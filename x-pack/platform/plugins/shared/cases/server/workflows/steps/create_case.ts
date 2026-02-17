/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import {
  createCaseStepCommonDefinition,
  type CreateCaseStepConfig,
  type CreateCaseStepInput,
  type CreateCaseStepOutput,
} from '../../../common/workflows/steps/create_case';
import type { CasesClient } from '../../client';

import { createCasesStepHandler } from './utils';
import {
  getInitialCaseValue,
  type GetInitialCaseValueArgs,
} from '../../../common/utils/get_initial_case_value';
import type { ConnectorTypes } from '../../../common/types/domain';

export const createCaseStepDefinition = (
  getCasesClient: (request: KibanaRequest) => Promise<CasesClient>
) =>
  createServerStepDefinition({
    ...createCaseStepCommonDefinition,
    handler: createCasesStepHandler<
      CreateCaseStepInput,
      CreateCaseStepOutput['case'],
      CreateCaseStepConfig
    >(getCasesClient, async (casesClient, input, config) => {
      // TODO: Handle connector push. SHould that move to the cases client?
      // TODO: Add cases.createFromTemplate step. Takes the template values and enriches it with the optional input.Multip
      if (config['connector-id']) {
        // Intentionally left as a no-op until connector-id resolution is implemented.
        const connectorConfig = await casesClient.configure.getConnectors();
        const foundConnector = connectorConfig.find(
          (connector) => connector.id === config['connector-id']
        );

        if (foundConnector) {
          const enrichedInput = getInitialCaseValue({
            ...(input as GetInitialCaseValueArgs),
            connector: {
              id: foundConnector.id,
              name: foundConnector.name,
              type: foundConnector.actionTypeId as ConnectorTypes,
              fields: null,
            },
          });

          const createdCase = await casesClient.cases.create(enrichedInput);

          if (config['push-case']) {
            await casesClient.cases.push({
              caseId: createdCase.id,
              connectorId: createdCase.connector.id,
              pushType: 'automatic',
            });
          }

          return createdCase as unknown as CreateCaseStepOutput['case'];
        } else {
          throw new Error(`Connector configuration not found: ${config['connector-id']}`);
        }
      } else {
        const createdCase = await casesClient.cases.create(
          getInitialCaseValue(input as unknown as GetInitialCaseValueArgs)
        );
        return createdCase as unknown as CreateCaseStepOutput['case'];
      }
    }),
  });
