/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { StepHandlerContext } from '@kbn/workflows-extensions/server';
import { createCaseResponseFixture } from '../../../common/fixtures/create_case';
import { getCaseStepDefinition } from './get_case';
import type { CasesClient } from '../../client';

const createContext = (input: unknown): StepHandlerContext =>
  ({
    input,
    rawInput: input,
    config: {},
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
    stepType: 'cases.getCase',
  } as unknown as StepHandlerContext);

describe('getCaseStepDefinition', () => {
  it('creates expected step definition structure', () => {
    const getCasesClient = jest.fn();
    const definition = getCaseStepDefinition(getCasesClient);

    expect(definition.id).toBe('cases.getCase');
    expect(typeof definition.handler).toBe('function');
    expect(
      definition.inputSchema.safeParse({
        case_id: 'case-1',
        include_comments: true,
      }).success
    ).toBe(true);
  });

  it('fetches case with includeComments=true when include_comments is true', async () => {
    const get = jest.fn().mockResolvedValue(createCaseResponseFixture);
    const getCasesClient = jest.fn().mockResolvedValue({
      cases: { get },
    } as unknown as CasesClient);
    const definition = getCaseStepDefinition(getCasesClient);

    const result = await definition.handler(
      createContext({
        case_id: 'case-1',
        include_comments: true,
      })
    );

    expect(get).toHaveBeenCalledWith({ id: 'case-1', includeComments: true });
    expect(result).toEqual({
      output: {
        case: createCaseResponseFixture,
      },
    });
  });

  it('fetches case with includeComments=false when include_comments is false', async () => {
    const get = jest.fn().mockResolvedValue(createCaseResponseFixture);
    const getCasesClient = jest.fn().mockResolvedValue({
      cases: { get },
    } as unknown as CasesClient);
    const definition = getCaseStepDefinition(getCasesClient);

    await definition.handler(
      createContext({
        case_id: 'case-1',
        include_comments: false,
      })
    );

    expect(get).toHaveBeenCalledWith({ id: 'case-1', includeComments: false });
  });

  it('returns error when client.cases.get throws', async () => {
    const getError = new Error('get failed');
    const get = jest.fn().mockRejectedValue(getError);
    const getCasesClient = jest.fn().mockResolvedValue({
      cases: { get },
    } as unknown as CasesClient);
    const definition = getCaseStepDefinition(getCasesClient);

    const result = await definition.handler(
      createContext({
        case_id: 'case-1',
        include_comments: false,
      })
    );

    expect(result).toEqual({ error: getError });
  });
});
