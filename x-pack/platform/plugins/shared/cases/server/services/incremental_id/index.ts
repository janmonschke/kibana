/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type {
  SavedObjectsFindOptions,
  SavedObjectsFindResult,
  SavedObjectsClient,
  SavedObject,
} from '@kbn/core/server';
import { type Logger } from '@kbn/core/server';
import pRetry from 'p-retry';
import { CASE_SAVED_OBJECT, CASE_ID_INCREMENTER_SAVED_OBJECT } from '../../../common/constants';
import type { CasePersistedAttributes } from '../../common/types/case';
import type {
  CaseIdIncrementerPersistedAttributes,
  CaseIdIncrementerSavedObject,
} from '../../common/types/id_incrementer';

type GetCasesParameters = Pick<
  SavedObjectsFindOptions,
  'sortField' | 'sortOrder' | 'perPage' | 'page' | 'filter' | 'namespaces'
>;

export class CasesIncrementalIdService {
  static incrementalIdExistsFilter = 'cases.attributes.incremental_id: *';
  static incrementalIdMissingFilter = 'not cases.attributes.incremental_id: *';

  constructor(private internalSavedObjectsClient: SavedObjectsClient, private logger: Logger) {
    this.logger = logger.get('incremental-id-service');
    this.logger.info('Cases incremental ID service initialized');
  }

  public async getCasesWithoutIncrementalId(parameters: Omit<GetCasesParameters, 'filter'> = {}) {
    return this.getCases({
      ...parameters,
      filter: CasesIncrementalIdService.incrementalIdMissingFilter,
    });
  }

  private async getCases({
    filter,
    perPage = 10000,
    page = 1,
    sortOrder = 'asc',
    sortField = 'created_at',
  }: GetCasesParameters) {
    try {
      const savedCases = await this.internalSavedObjectsClient.find<CasePersistedAttributes>({
        type: CASE_SAVED_OBJECT,
        sortField,
        sortOrder,
        perPage,
        page,
        filter,
        namespaces: ['*'],
      });
      return savedCases;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  public async getLastAppliedIdForSpace(namespace: string) {
    try {
      const casesResponse = await this.getCases({
        filter: CasesIncrementalIdService.incrementalIdExistsFilter,
        namespaces: [namespace],
        sortField: 'attributes.incremental_id.numerical_id',
        sortOrder: 'desc',
        perPage: 1, // We only need the most recent incremental id value
        page: 1,
      });
      if (casesResponse.total === 0) return 0;
      const mostRecentIncrementalId =
        casesResponse.saved_objects[0].attributes.incremental_id?.numerical_id;
      if (mostRecentIncrementalId !== casesResponse.total) {
        throw new Error('Mismatch between incremental id and case count');
      }
      return mostRecentIncrementalId;
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async incrementCaseIdSequentially(
    casesWithoutIncrementalId: Array<SavedObjectsFindResult<CasePersistedAttributes>>
  ) {
    /** In-memory cache of the incremental ID SO changes that we will need to apply */
    const incIdSoCache: Map<string, SavedObject<CaseIdIncrementerPersistedAttributes>> = new Map();

    let hasAppliedAnId = false;
    for (let index = 0; index < casesWithoutIncrementalId.length; index++) {
      try {
        const caseSo = casesWithoutIncrementalId[index];
        const namespaceOfCase = caseSo.namespaces?.[0];
        if (!namespaceOfCase) {
          this.logger.info(`Case ${caseSo.id} has no namespace assigned. Skipping it.`);
          // eslint-disable-next-line no-continue
          continue;
        }
        // TODO: remove the next line
        this.logger.info(`Case namespace: ${namespaceOfCase}`);

        // Get the incremental id SO from the cache or fetch it
        let incIdSo = incIdSoCache.get(namespaceOfCase);
        if (!incIdSo) {
          incIdSo = await this.getOrCreateCaseIdIncrementerSo(namespaceOfCase);
          incIdSoCache.set(namespaceOfCase, incIdSo);
        }

        // Increase the next id
        const newId = incIdSo.attributes.next_id + 1;
        await this.applyIncrementalIdToCaseSo(caseSo, newId, namespaceOfCase);
        incIdSo.attributes.next_id = newId;
        hasAppliedAnId = true;
      } catch (error) {
        this.logger.error(`ID incrementing paused due to error: ${error}`);
        break;
      }
    }

    // If changes have been made, apply the changes to the counters
    // TODO: we definitely need to clean this up, in case it fails. Probably in `getCaseIdIncrementerSo`
    if (hasAppliedAnId) {
      for (const [namespace, incIdSo] of incIdSoCache) {
        await this.incrementCounterSO(incIdSo, incIdSo.attributes.next_id, namespace);
      }
    }
  }

  /**
   * Gets or creates the case id incrementer SO for the given namespace
   * @param namespace The namespace of the case id incrementor so
   */
  private async getOrCreateCaseIdIncrementerSo(
    namespace: string
  ): Promise<SavedObject<CaseIdIncrementerPersistedAttributes>> {
    try {
      // NEXT: if latestAppliedId is larger than what's in the case incrementer SO (because we failed to update it), make sure to update it
      // NEXT: change `next_id` to `latest_id`
      const latestAppliedId = (await this.getLastAppliedIdForSpace(namespace)) || 0;
      const incrementerResponse =
        await this.internalSavedObjectsClient.find<CaseIdIncrementerPersistedAttributes>({
          type: CASE_ID_INCREMENTER_SAVED_OBJECT,
          namespaces: [namespace],
        });
      const incrementerSO = incrementerResponse?.saved_objects[0];

      // We should not have multiple incrementer SO's per namespace, but if we do, let's resolve that
      if (incrementerResponse.total > 1) {
        this.logger.error(
          `Only 1 incrementer should exist, but multiple incrementers found in ${namespace}. Resolving to max incrementer.`
        );
        return this.resolveMultipleIncrementerSO(
          incrementerResponse.saved_objects,
          latestAppliedId,
          namespace
        );
      }

      // Only one incrementer SO exists
      if (incrementerResponse.total === 1 && incrementerSO.attributes.next_id) {
        // If we have matching incremental ids, we're good
        const idsMatch = latestAppliedId === incrementerSO.attributes.next_id;
        if (idsMatch) {
          return incrementerResponse?.saved_objects[0];
        } else {
          // Otherwise, we're updating the incrementer SO to the highest value
          const newId = Math.max(latestAppliedId, incrementerSO.attributes.next_id);
          return this.incrementCounterSO(incrementerSO, newId, namespace);
        }
      }
    } catch (error) {
      throw new Error(`Unable to use an existing incrementer: ${error}`);
    }
    // At this point we assume that no incrementer SO exists
    return this.createCaseIdIncrementerSo(namespace);
  }

  /**
   * Resolves the situation when multiple incrementer SOs exists
   */
  private async resolveMultipleIncrementerSO(
    incrementerQueryResponse: Array<SavedObjectsFindResult<CaseIdIncrementerPersistedAttributes>>,
    latestAppliedId: number,
    namespace: string
  ) {
    // Find the incrementer with the highest ID
    const incrementerWithHighestId =
      incrementerQueryResponse.reduce<SavedObjectsFindResult<CaseIdIncrementerPersistedAttributes> | null>(
        (maxIncrementer, currIncrementer) => {
          if (!maxIncrementer) {
            return currIncrementer;
          } else {
            return currIncrementer.attributes.next_id > maxIncrementer.attributes.next_id
              ? currIncrementer
              : maxIncrementer;
          }
        },
        null
      );

    // Gather the incrementers with lower ID values and delete them
    const incrementersToDelete = incrementerQueryResponse.filter(
      (incrementer) => incrementer !== incrementerWithHighestId
    );
    await this.internalSavedObjectsClient.bulkDelete(incrementersToDelete);

    // If a max incrementer exists, update it with the max value found
    if (incrementerWithHighestId) {
      const newId = Math.max(latestAppliedId, incrementerWithHighestId.attributes.next_id);
      return this.incrementCounterSO(incrementerWithHighestId, newId, namespace);
    } else {
      // If there is no max incrementer, create a new one
      return this.createCaseIdIncrementerSo(namespace);
    }
  }

  /**
   * Creates a case id incrementer SO for the given namespace
   * @param namespace The namespace for the newly created case id incrementer SO
   */
  private async createCaseIdIncrementerSo(namespace: string) {
    try {
      const currentTime = new Date().getTime();
      const intializedIncrementalIdSo =
        await this.internalSavedObjectsClient.create<CaseIdIncrementerPersistedAttributes>(
          CASE_ID_INCREMENTER_SAVED_OBJECT,
          {
            next_id: 0,
            '@timestamp': currentTime,
            updated_at: currentTime,
          },
          {
            namespace,
          }
        );
      return intializedIncrementalIdSo;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  private async incrementCounterSO(
    incrementerSo: CaseIdIncrementerSavedObject,
    lastAppliedId: number,
    namespace: string
  ): Promise<SavedObject<CaseIdIncrementerPersistedAttributes>> {
    try {
      const updatedAttributes = {
        next_id: lastAppliedId + 1,
        updated_at: new Date().getTime(),
      };
      await this.internalSavedObjectsClient.update<CaseIdIncrementerPersistedAttributes>(
        CASE_ID_INCREMENTER_SAVED_OBJECT,
        incrementerSo.id,
        updatedAttributes,
        {
          version: incrementerSo.version,
          namespace,
        }
      );

      // Manually updating the SO here because `SavedObjectsClient.update`
      // returns a type with a `Partial` of the SO's attributes.
      return {
        ...incrementerSo,
        attributes: {
          ...incrementerSo.attributes,
          ...updatedAttributes,
        },
      };
    } catch (error) {
      this.logger.error(`Unable to update incrementer due to error: ${error}`);
      throw error;
    }
  }

  private async applyIncrementalIdToCaseSo(
    currentCaseSo: SavedObjectsFindResult<CasePersistedAttributes>,
    newIncrementalId: number,
    namespace: string
  ) {
    // We shouldn't have to worry about version conflicts, as we're not modifying any existing fields
    // just applying a new field
    const updateCase = async () => {
      await this.internalSavedObjectsClient.update<CasePersistedAttributes>(
        CASE_SAVED_OBJECT,
        currentCaseSo.id,
        { incremental_id: { numerical_id: newIncrementalId, space_id: namespace } },
        { namespace }
      );
    };

    try {
      await pRetry(updateCase, {
        maxTimeout: 3000,
        retries: 3,
        factor: 2,
        onFailedAttempt: (error) => {
          this.logger.warn(
            `Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`
          );
        },
      });
    } catch (err) {
      this.logger.error(`Failed to apply incremental id ${newIncrementalId}`);
      throw err;
    }
  }
}
