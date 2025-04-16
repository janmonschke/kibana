/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { SavedObjectsClient, type CoreStart, type Logger } from '@kbn/core/server';
import type { TaskInstance, TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { TaskInstanceWithId } from '@kbn/task-manager-plugin/server/task';
import { DEFAULT_SPACE_ID } from '@kbn/spaces-plugin/common';
import type { CasesServerSetupDependencies } from '../../types';
import { CASE_SAVED_OBJECT, CASE_ID_INCREMENTER_SAVED_OBJECT } from '../../../common/constants';
import type { CasesIncrementIdTaskState, CasesIncrementIdTaskStateSchemaV1 } from './state';
import { casesIncrementIdStateSchemaByVersion } from './case_id_task_state';
import { CasesIncrementalIdService } from '../../services/incremental_id';

export const CASES_INCREMENTAL_ID_SYNC_TASK_TYPE = 'cases_incremental_id_assignment';
export const CASES_INCREMENTAL_ID_SYNC_TASK_ID = `Cases:${CASES_INCREMENTAL_ID_SYNC_TASK_TYPE}`;

export const CasesIncrementIdTaskVersion = '1.0.0';
const CASES_INCREMENTAL_ID_SYNC_INTERVAL_DEFAULT = '1m';

export class CasesIdIncrementerTaskManager {
  private logger: Logger;
  private namespaces: Set<string> = new Set([DEFAULT_SPACE_ID]);
  private taskManager?: TaskManagerStartContract;
  private taskInstance?: TaskInstanceWithId;
  private casesIncrementService?: CasesIncrementalIdService;

  constructor(plugins: CasesServerSetupDependencies, logger: Logger) {
    this.logger = logger.get('cases', 'incremental_id_task');
    this.logger.info('Registering Case Incremental ID Task Manager');

    if (plugins.taskManager) {
      plugins.taskManager.registerTaskDefinitions({
        [CASES_INCREMENTAL_ID_SYNC_TASK_TYPE]: {
          title: 'Cases Numerical ID assignment',
          description: 'Applying incremental numeric ids to cases',

          stateSchemaByVersion: casesIncrementIdStateSchemaByVersion,
          createTaskRunner: ({ taskInstance }) => {
            return {
              run: async () => {
                const initializedTime = new Date().toISOString();
                const startTime = performance.now();
                this.logger.info(`Increment id task started at: ${initializedTime}`);
                if (!this.casesIncrementService) {
                  this.logger.error('Missing increment service necessary for task');
                  return undefined;
                }
                this.taskInstance = taskInstance;
                const currentState = this.taskInstance.state as CasesIncrementIdTaskStateSchemaV1;

                // For potential telemetry purposes
                let initialCasesCountLackingId = 0;

                // const lastIdByNameSpace: Record<string, number> =
                //   currentState.last_update.last_id_by_namespace ?? {};

                const casesWithoutIncrementalIdResponse =
                  await this.casesIncrementService.getCasesWithoutIncrementalId();

                initialCasesCountLackingId =
                  initialCasesCountLackingId + casesWithoutIncrementalIdResponse.total;

                const { saved_objects: casesWithoutIncrementalId } =
                  casesWithoutIncrementalIdResponse;

                await this.casesIncrementService.incrementCaseIds(casesWithoutIncrementalId);

                const endTime = performance.now();
                this.logger.info(`Increment id task ended at: ${new Date().toISOString()}`);

                this.logger.debug(
                  `Completed ${CASES_INCREMENTAL_ID_SYNC_TASK_ID}. Task run took ${
                    endTime - startTime
                  }ms [ started: ${initializedTime} ]`
                );

                const newState = structuredClone(currentState);
                return {
                  state: {
                    ...newState,
                    namespaces: Array.from(this.namespaces),
                    last_update: {
                      timestamp: startTime,
                      unincremented_cases_count: initialCasesCountLackingId,
                      conflict_retry_count: 0,
                    },
                  },
                };
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

  private updateTaskState(newState: Partial<CasesIncrementIdTaskStateSchemaV1>) {
    if (this.taskManager) {
      this.taskManager?.bulkUpdateState([CASES_INCREMENTAL_ID_SYNC_TASK_ID], (_state) => {
        const clonedState = structuredClone(this.taskInstance?.state) ?? {};
        return {
          ...clonedState,
          ...newState,
        };
      });
    }
  }

  public addNamespace(namespace?: string) {
    if (namespace) {
      this.namespaces.add(namespace);
      const newNamespaces = Array.from(this.namespaces);
      this.updateTaskState({ namespaces: newNamespaces });
    }
  }

  public removeNamespace(namespace?: string) {
    if (namespace && this.namespaces.has(namespace)) {
      this.namespaces.delete(namespace);
      const newNamespaces = Array.from(this.namespaces);
      this.updateTaskState({ namespaces: newNamespaces });
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
      // This is great, because it's the internal SO client?
      const internalSavedObjectsRepository = core.savedObjects.createInternalRepository([
        CASE_SAVED_OBJECT,
        CASE_ID_INCREMENTER_SAVED_OBJECT,
      ]);
      const internalSavedObjectsClient = new SavedObjectsClient(internalSavedObjectsRepository);

      this.casesIncrementService = new CasesIncrementalIdService(
        internalSavedObjectsClient,
        this.logger
      );

      const casesWithoutIncrementalId =
        await this.casesIncrementService.getCasesWithoutIncrementalId({
          perPage: 1,
        });

      const initializedTime = new Date().getTime();

      const initialTaskState: CasesIncrementIdTaskState = {
        namespaces: Array.from(this.namespaces),
        on_initialization: {
          timestamp: initializedTime,
          unincremented_cases_count: casesWithoutIncrementalId.total,
        },
        last_update: {
          timestamp: initializedTime,
          unincremented_cases_count: casesWithoutIncrementalId.total,
          conflict_retry_count: 0,
        },
      };

      const taskInstance = await taskManager.ensureScheduled({
        id: CASES_INCREMENTAL_ID_SYNC_TASK_ID,
        taskType: CASES_INCREMENTAL_ID_SYNC_TASK_TYPE,
        schedule: {
          interval: CASES_INCREMENTAL_ID_SYNC_INTERVAL_DEFAULT,
        },
        params: {},
        state: initialTaskState,
        scope: ['cases'],
      });

      this.taskInstance = taskInstance;
      this.taskManager = taskManager;
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
