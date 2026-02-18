/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { StepHandlerContext } from '@kbn/workflows-extensions/server';
import type { CasesClient } from '../../client';
import type { CreateCaseStepOutput } from '../../../common/workflows/steps/create_case';
import type { UpdateCaseStepInput } from '../../../common/workflows/steps/update_case';
import { ConnectorTypes } from '../../../common/types/domain';

type WorkflowStepCaseResult = CreateCaseStepOutput['case'];
type WorkflowUpdatePayload = UpdateCaseStepInput['updates'];

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object';

const isResilientConnectorFields = (
  fields: unknown
): fields is { issueTypes: string[]; severityCode: string } => {
  if (!isObjectRecord(fields)) {
    return false;
  }

  return Array.isArray(fields.issueTypes) && typeof fields.severityCode === 'string';
};

export const normalizeCaseStepConnector = <
  TConnector extends { type: string; fields: unknown } | undefined
>(
  connector: TConnector
) => {
  if (!connector) {
    return;
  }

  if (connector.type === ConnectorTypes.none || connector.type === ConnectorTypes.casesWebhook) {
    return { ...connector, fields: null };
  }

  if (connector.type === ConnectorTypes.resilient && isResilientConnectorFields(connector.fields)) {
    return {
      ...connector,
      fields: {
        incidentTypes: connector.fields.issueTypes,
        severityCode: connector.fields.severityCode,
      },
    };
  }

  return connector;
};

export const normalizeCaseStepUpdatesForBulkPatch = (updates: WorkflowUpdatePayload) => {
  const { assignees, connector, ...restUpdates } = updates;
  const normalizedConnector = normalizeCaseStepConnector(connector);

  return {
    ...restUpdates,
    ...(assignees === null ? { assignees: [] } : {}),
    ...(assignees ? { assignees } : {}),
    ...(normalizedConnector ? { connector: normalizedConnector } : {}),
  };
};

async function getCasesClientFromStepsContext(
  context: StepHandlerContext,
  getCasesClient: (request: KibanaRequest) => Promise<CasesClient>
): Promise<CasesClient> {
  // Get the fake request from the workflow context
  const request = context.contextManager.getFakeRequest();
  return getCasesClient(request);
}

/**
 * Creates a standardized handler for cases workflow steps.
 */
export function createCasesStepHandler<
  TInput = unknown,
  TConfig = unknown,
  TOutputCase extends WorkflowStepCaseResult = WorkflowStepCaseResult
>(
  getCasesClient: (request: KibanaRequest) => Promise<CasesClient>,
  operation: (client: CasesClient, input: TInput, config: TConfig) => Promise<TOutputCase>
) {
  return async (context: StepHandlerContext) => {
    try {
      const casesClient = await getCasesClientFromStepsContext(context, getCasesClient);
      const theCase = await operation(
        casesClient,
        context.input as TInput,
        context.config as TConfig
      );

      if (context.config['push-case']) {
        await casesClient.cases.push({
          caseId: theCase.id,
          connectorId: theCase.connector.id,
          pushType: 'automatic',
        });
      }

      return {
        output: {
          case: theCase,
        },
      };
    } catch (error) {
      return { error };
    }
  };
}
