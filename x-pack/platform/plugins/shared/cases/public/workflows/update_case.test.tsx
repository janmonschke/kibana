/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createUpdateCaseStepDefinition } from './update_case';

describe('createUpdateCaseStepDefinition', () => {
  it('returns a public step definition with expected metadata', () => {
    const definition = createUpdateCaseStepDefinition();

    expect(definition.id).toBe('cases.updateCase');
    expect(definition.actionsMenuGroup).toBe('kibana');
    expect(definition.documentation?.examples?.length).toBeGreaterThan(0);
  });
});
