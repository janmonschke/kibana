/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type {
  SavedObjectsFindOptions,
  SavedObjectsFindResult,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import { type Logger } from '@kbn/core/server';
import pRetry from 'p-retry';
import { CASE_SAVED_OBJECT } from '../../../common/constants';
import type { CasePersistedAttributes } from '../../common/types/case';

type GetCasesParameters = Pick<
  SavedObjectsFindOptions,
  'sortField' | 'sortOrder' | 'perPage' | 'page' | 'filter' | 'namespaces'
>;

export class CasesIncrementalIdService {
  static incrementalIdExistsFilter = 'cases.attributes.incremental_id: *';
  static incrementalIdMissingFilter = 'not cases.attributes.incremental_id: *';

  constructor(
    private internalSavedObjectsClient: SavedObjectsClientContract,
    private logger: Logger
  ) {
    this.logger = logger.get('incremental-id-service');
    this.logger.info('Cases incremental ID service initialized');
  }

  public async getCasesWithoutIncrementalId(parameters: Omit<GetCasesParameters, 'filter'> = {}) {
    return this.getCases({
      ...parameters,
      filter: CasesIncrementalIdService.incrementalIdMissingFilter,
    });
  }

  public async getCases({
    filter,
    perPage = 10000,
    page = 1,
    sortOrder = 'asc',
    sortField = 'created_at',
    namespaces = ['*'],
  }: GetCasesParameters) {
    try {
      const savedCases = await this.internalSavedObjectsClient.find<CasePersistedAttributes>({
        type: CASE_SAVED_OBJECT,
        sortField,
        sortOrder,
        perPage,
        page,
        filter,
        namespaces,
      });
      return savedCases;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Get the latest applied ID for a given space.
   * Uses the actually applied numerical ids on cases in the space.
   */
  public async getLastAppliedIdForSpace(namespace: string) {
    try {
      const casesResponse = await this.getCases({
        filter: CasesIncrementalIdService.incrementalIdExistsFilter,
        namespaces: [namespace],
        sortField: 'incremental_id.numerical_id',
        sortOrder: 'desc',
        perPage: 1, // We only need the most recent incremental id value
        page: 1,
      });

      if (casesResponse.total === 0) {
        this.logger.debug(`No cases found with incremental id in ${namespace}`);
        return 0;
      }

      const mostRecentIncrementalId =
        casesResponse.saved_objects[0].attributes.incremental_id?.numerical_id;
      this.logger.debug(
        `getLastAppliedIdForSpace (from cases): Most recent incremental id in ${namespace}: ${mostRecentIncrementalId}`
      );

      if (mostRecentIncrementalId === undefined || mostRecentIncrementalId === null) {
        return 0;
      }

      // TODO: should we really throw here?
      // There might be gaps because of deleted cases.
      // if (mostRecentIncrementalId !== casesResponse.total) {
      //   throw new Error('Mismatch between incremental id and case count');
      // }
      return mostRecentIncrementalId;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  public async incrementCaseIds(
    casesWithoutIncrementalId: Array<SavedObjectsFindResult<CasePersistedAttributes>>,
    maxDurationMs = 10 * 60 * 1000
  ) {
    /** In-memory cache of the incremental ID broken down by namespace */
    const idByNamespace: Map<string, number> = new Map();
    const startTime = Date.now();

    for (let index = 0; index < casesWithoutIncrementalId.length; index++) {
      try {
        const elapsedTimeMs = Date.now() - startTime;

        // Stop processing if we've exceeded the max duration.
        // We will still sync the incIdSoCache at the end.
        if (elapsedTimeMs > maxDurationMs) {
          const progress = (index + 1 / casesWithoutIncrementalId.length) * 100;
          this.logger.warn(
            `Stopping ID incrementing due to time limit. Processed ${progress.toFixed(
              2
            )}% of cases.`
          );
          break;
        }

        const caseSo = casesWithoutIncrementalId[index];
        const namespaceOfCase = caseSo.namespaces?.[0];
        if (!namespaceOfCase) {
          this.logger.error(`Case ${caseSo.id} has no namespace assigned. Skipping it.`);
          // eslint-disable-next-line no-continue
          continue;
        }

        let actualLatestId = 0;
        if (!idByNamespace.has(namespaceOfCase)) {
          const latestAppliedId = await this.getLastAppliedIdForSpace(namespaceOfCase);
          actualLatestId = latestAppliedId || 0;
          this.logger.debug(
            `Latest applied ID to a case for ${namespaceOfCase}: ${latestAppliedId} (${actualLatestId})`
          );
        } else {
          actualLatestId = idByNamespace.get(namespaceOfCase) || 0;
        }

        // Increase the inc id
        const newId = actualLatestId + 1;
        // Apply the new ID to the case
        await this.applyIncrementalIdToCaseSo(caseSo, newId, namespaceOfCase);
        idByNamespace.set(namespaceOfCase, newId);
      } catch (error) {
        this.logger.error(`ID incrementing paused due to error: ${error}`);
        break;
      }
    }
  }

  public async applyIncrementalIdToCaseSo(
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
