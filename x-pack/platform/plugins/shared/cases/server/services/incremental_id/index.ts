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

  private getCases = async ({
    filter,
    perPage = 10000,
    page = 1,
    sortOrder = 'asc',
    sortField = 'created_at',
  }: GetCasesParameters) => {
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
  };

  // TODO: Could be used to initialize the count from the accurate value in the scenario we lost our state for whatever reason
  public getLastAppliedIdPerSpace = async (namespaces: string[]) => {
    const idTracker: Record<string, number> = {};
    for (let i = 0; i < namespaces.length; i++) {
      const namespace = namespaces[i];
      try {
        const casesResponse = await this.getCases({
          filter: CasesIncrementalIdService.incrementalIdExistsFilter,
          namespaces: [namespace],
          sortField: 'attributes.incremental_id',
          sortOrder: 'desc',
          perPage: 1, // We only need the most recent incremental id value
          page: 1,
        });
        if (casesResponse.total === 0) return { [namespace]: undefined };
        const mostRecentIncrementalId = casesResponse.saved_objects[0].attributes.incremental_id;
        if (mostRecentIncrementalId !== casesResponse.total) {
          throw new Error('Mismatch between incremental id and case count');
        }
        idTracker[namespace] = mostRecentIncrementalId;
      } catch (error) {
        this.logger.error(error);
      }
    }
    return idTracker;
  };

  public incrementCaseIdSequentially = async (
    casesWithoutIncrementalId: Array<SavedObjectsFindResult<CasePersistedAttributes>>
  ) => {
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
        this.logger.info(`Case namespace: ${namespaceOfCase}`);

        // Get the incremental id SO from the cache or load it
        let incIdSo = incIdSoCache.get(namespaceOfCase);
        if (!incIdSo) {
          incIdSo = await this.getCaseIdIncrementerSo(namespaceOfCase);
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
        await this.incrementCounter(incIdSo, incIdSo.attributes.next_id, namespace);
      }
    }
  };

  private getCaseIdIncrementerSo = async (namespace: string, nextIncrementalIdToApply?: number) => {
    try {
      const incrementerResponse =
        await this.internalSavedObjectsClient.find<CaseIdIncrementerPersistedAttributes>({
          type: CASE_ID_INCREMENTER_SAVED_OBJECT,
          namespaces: [namespace],
        });
      if (incrementerResponse.total === 1) return incrementerResponse?.saved_objects[0];

      if (incrementerResponse.total > 1) {
        // We should not have multiple incrementer SO's per namespace
        // if this does happen, we need to add resolution logic
        const err = `Only 1 incrementer should exist, but multiple incrementers found in ${namespace}`;
        throw new Error(err);
      }
    } catch (error) {
      this.logger.error(`Unable to use an existing incrementer: ${error}`);
      // TODO: Potentially return here rather than potentially creating a duplicate incrementer below
    }

    try {
      const currentTime = new Date().getTime();
      const intializedIncrementalIdSo =
        await this.internalSavedObjectsClient.create<CaseIdIncrementerPersistedAttributes>(
          CASE_ID_INCREMENTER_SAVED_OBJECT,
          {
            next_id: nextIncrementalIdToApply ?? 1,
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
  };

  private incrementCounter = async (
    incrementerSo: CaseIdIncrementerSavedObject,
    lastAppliedId: number,
    namespace: string
  ) => {
    try {
      await this.internalSavedObjectsClient.update<CaseIdIncrementerPersistedAttributes>(
        CASE_ID_INCREMENTER_SAVED_OBJECT,
        incrementerSo.id,
        {
          next_id: lastAppliedId + 1,
          updated_at: new Date().getTime(),
        },
        {
          version: incrementerSo.version,
          namespace,
        }
      );
    } catch (error) {
      this.logger.error(`Unable to updste incrementer due to error: ${error}`);
      throw error;
    }
  };

  private applyIncrementalIdToCaseSo = async (
    currentCaseSo: SavedObjectsFindResult<CasePersistedAttributes>,
    newIncrementalId: number,
    namespace: string
  ) => {
    if (currentCaseSo.attributes.incremental_id != null) {
      return;
    }

    // We shouldn't have to worry about version conflicts, as we're not modifying any existing fields
    // just applying a new field
    const updateCase = async () => {
      await this.internalSavedObjectsClient.update<CasePersistedAttributes>(
        CASE_SAVED_OBJECT,
        currentCaseSo.id,
        { incremental_id: newIncrementalId },
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
  };
}
