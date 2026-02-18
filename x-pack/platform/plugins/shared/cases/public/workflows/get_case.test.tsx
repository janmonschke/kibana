/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getCaseStepDefinition } from './get_case';

describe('getCaseStepDefinition', () => {
  it('returns a public step definition with expected metadata', () => {
    expect(getCaseStepDefinition.id).toBe('cases.getCase');
    expect(getCaseStepDefinition.actionsMenuGroup).toBe('kibana');
    expect(getCaseStepDefinition.documentation?.examples?.length).toBeGreaterThan(0);
  });
});
