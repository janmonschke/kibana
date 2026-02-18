/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { addCommentStepDefinition } from './add_comment';

describe('addCommentStepDefinition', () => {
  it('returns a public step definition with expected metadata', () => {
    expect(addCommentStepDefinition.id).toBe('cases.addComment');
    expect(addCommentStepDefinition.actionsMenuGroup).toBe('kibana');
    expect(addCommentStepDefinition.documentation?.examples?.length).toBeGreaterThan(0);
  });
});
