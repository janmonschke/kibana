/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { StepHandlerContext } from '@kbn/workflows-extensions/server';
import {
  createCaseRequestFixture,
  createCaseResponseFixture,
} from '../../../common/fixtures/create_case';
import { createCaseStepDefinition } from './create_case';
import type { CasesClient } from '../../client';

const createContext = (input: unknown, config: Record<string, unknown> = {}): StepHandlerContext =>
  ({
    input,
    rawInput: input,
    config,
    contextManager: {
      getFakeRequest: jest.fn().mockReturnValue({} as KibanaRequest),
    },
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    abortSignal: new AbortController().signal,
    stepId: 'test-step-id',
    stepType: 'cases.createCase',
  } as unknown as StepHandlerContext);

describe('createCaseStepDefinition', () => {
  it('creates expected step definition structure', () => {
    const getCasesClient = jest.fn();
    const definition = createCaseStepDefinition(getCasesClient);

    expect(definition.id).toBe('cases.createCase');
    expect(typeof definition.handler).toBe('function');
    expect(definition.inputSchema.safeParse(createCaseRequestFixture).success).toBe(true);
  });

  it('calls client.cases.create and wraps output.case on success', async () => {
    const create = jest.fn().mockResolvedValue(createCaseResponseFixture);
    const getCasesClient = jest
      .fn()
      .mockResolvedValue({ cases: { create } } as unknown as CasesClient);
    const definition = createCaseStepDefinition(getCasesClient);
    const context = createContext(createCaseRequestFixture);

    const result = await definition.handler(context);

    expect(getCasesClient).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      ...createCaseRequestFixture,
      assignees: [],
      category: undefined,
      customFields: [],
      severity: 'low',
    });
    expect(result).toEqual({
      output: {
        case: createCaseResponseFixture,
      },
    });
  });

  it('returns error when client.cases.create throws', async () => {
    const createError = new Error('create failed');
    const create = jest.fn().mockRejectedValue(createError);
    const getCasesClient = jest
      .fn()
      .mockResolvedValue({ cases: { create } } as unknown as CasesClient);
    const definition = createCaseStepDefinition(getCasesClient);

    const result = await definition.handler(createContext(createCaseRequestFixture));

    expect(result).toEqual({ error: createError });
  });

  it('uses configured connector when connector-id is provided', async () => {
    const create = jest.fn().mockResolvedValue(createCaseResponseFixture);
    const getConnectors = jest.fn().mockResolvedValue([
      {
        id: 'jira-1',
        name: 'Jira Connector',
        actionTypeId: '.jira',
      },
    ]);
    const getCasesClient = jest.fn().mockResolvedValue({
      configure: { getConnectors },
      cases: { create },
    } as unknown as CasesClient);
    const definition = createCaseStepDefinition(getCasesClient);

    await definition.handler(createContext(createCaseRequestFixture, { 'connector-id': 'jira-1' }));

    expect(getConnectors).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        connector: {
          id: 'jira-1',
          name: 'Jira Connector',
          type: '.jira',
          fields: null,
        },
      })
    );
  });

  it('returns error when configured connector cannot be found', async () => {
    const create = jest.fn();
    const getConnectors = jest.fn().mockResolvedValue([
      {
        id: 'jira-1',
        name: 'Jira Connector',
        actionTypeId: '.jira',
      },
    ]);
    const getCasesClient = jest.fn().mockResolvedValue({
      configure: { getConnectors },
      cases: { create },
    } as unknown as CasesClient);
    const definition = createCaseStepDefinition(getCasesClient);

    const result = await definition.handler(
      createContext(createCaseRequestFixture, { 'connector-id': 'missing-connector' })
    );

    expect(create).not.toHaveBeenCalled();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('Connector configuration not found'),
      })
    );
  });

  it('pushes the case when push-case is enabled', async () => {
    const create = jest.fn().mockResolvedValue(createCaseResponseFixture);
    const push = jest.fn().mockResolvedValue(undefined);
    const getCasesClient = jest.fn().mockResolvedValue({
      cases: { create, push },
    } as unknown as CasesClient);
    const definition = createCaseStepDefinition(getCasesClient);

    await definition.handler(createContext(createCaseRequestFixture, { 'push-case': true }));

    expect(push).toHaveBeenCalledWith({
      caseId: createCaseResponseFixture.id,
      connectorId: createCaseResponseFixture.connector.id,
      pushType: 'automatic',
    });
  });
});
