/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { SavedObjectsClient, type CoreStart, type Logger } from '@kbn/core/server';
import type { TaskInstance, TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { CasesServerSetupDependencies } from '../../types';
import { CASE_SAVED_OBJECT, CASE_ID_INCREMENTER_SAVED_OBJECT } from '../../../common/constants';
import { CasesIncrementalIdService } from '../../services/incremental_id';

export const CASES_INCREMENTAL_ID_SYNC_TASK_TYPE = 'cases_incremental_id_assignment';
export const CASES_INCREMENTAL_ID_SYNC_TASK_ID = `Cases:${CASES_INCREMENTAL_ID_SYNC_TASK_TYPE}`;

export const CasesIncrementIdTaskVersion = '1.0.0';
const CASES_INCREMENTAL_ID_SYNC_INTERVAL_DEFAULT = '1m';

export class CasesIdIncrementerTaskManager {
  private logger: Logger;
  private casesIncrementService?: CasesIncrementalIdService;

  constructor(plugins: CasesServerSetupDependencies, logger: Logger) {
    this.logger = logger.get('cases', 'incremental_id_task');
    this.logger.info('Registering Case Incremental ID Task Manager');

    if (plugins.taskManager) {
      plugins.taskManager.registerTaskDefinitions({
        [CASES_INCREMENTAL_ID_SYNC_TASK_TYPE]: {
          title: 'Cases Numerical ID assignment',
          description: 'Applying incremental numeric ids to cases',
          // In order to ensure sequential id assignments, there can only every be one task running at a time
          maxConcurrency: 1,
          createTaskRunner: () => {
            return {
              run: async () => {
                const initializedTime = new Date().toISOString();
                const startTime = performance.now();
                this.logger.info(`Increment id task started at: ${initializedTime}`);
                if (!this.casesIncrementService) {
                  this.logger.error('Missing increment service necessary for task');
                  return undefined;
                }

                // Fetch all cases without an incremental id
                const casesWithoutIncrementalIdResponse =
                  await this.casesIncrementService.getCasesWithoutIncrementalId();
                const { saved_objects: casesWithoutIncrementalId } =
                  casesWithoutIncrementalIdResponse;

                // Increment the case ids
                await this.casesIncrementService.incrementCaseIds(casesWithoutIncrementalId);

                const endTime = performance.now();
                this.logger.info(`Increment id task ended at: ${new Date().toISOString()}`);

                this.logger.debug(
                  `Task terminated ${CASES_INCREMENTAL_ID_SYNC_TASK_ID}. Task run took ${
                    endTime - startTime
                  }ms [ started: ${initializedTime} ]`
                );
              },
              cancel: async () => {
                this.logger.info(`${CASES_INCREMENTAL_ID_SYNC_TASK_ID} task run was canceled`);
              },
            };
          },
        },
      });
    }
  }

  public async scheduleIncrementIdTask(
    taskManager: TaskManagerStartContract,
    core: CoreStart
  ): Promise<TaskInstance | null> {
    try {
      if (!taskManager) {
        this.logger.error(
          `Error running task: ${CASES_INCREMENTAL_ID_SYNC_TASK_ID}. Missing task manager service`
        );
        return null;
      }

      // TODO: REMOVE as this removes the existing state we want to keep, but good for testing cleanup
      // await taskManager.removeIfExists(CASES_INCREMENTAL_ID_SYNC_TASK_ID);

      // Instantiate saved objects client
      const internalSavedObjectsRepository = core.savedObjects.createInternalRepository([
        CASE_SAVED_OBJECT,
        CASE_ID_INCREMENTER_SAVED_OBJECT,
      ]);
      const internalSavedObjectsClient = new SavedObjectsClient(internalSavedObjectsRepository);

      this.casesIncrementService = new CasesIncrementalIdService(
        internalSavedObjectsClient,
        this.logger
      );

      const taskInstance = await taskManager.ensureScheduled({
        id: CASES_INCREMENTAL_ID_SYNC_TASK_ID,
        taskType: CASES_INCREMENTAL_ID_SYNC_TASK_TYPE,
        schedule: {
          interval: CASES_INCREMENTAL_ID_SYNC_INTERVAL_DEFAULT,
        },
        params: {},
        state: {},
        scope: ['cases'],
      });

      this.logger.info(
        `${CASES_INCREMENTAL_ID_SYNC_TASK_ID} scheduled with interval ${taskInstance.schedule?.interval}`
      );

      return taskInstance;
    } catch (e) {
      this.logger.error(
        `Error running task: ${CASES_INCREMENTAL_ID_SYNC_TASK_ID}: ${e}`,
        e?.message ?? e
      );
      return null;
    }
  }
}
