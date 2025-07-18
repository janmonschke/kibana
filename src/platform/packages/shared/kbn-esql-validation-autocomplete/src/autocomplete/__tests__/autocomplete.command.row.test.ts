/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Location } from '@kbn/esql-ast/src/commands_registry/types';
import { getNewUserDefinedColumnSuggestion } from '@kbn/esql-ast';
import { attachTriggerCommand, getFunctionSignaturesByReturnType, setup } from './helpers';

describe('autocomplete.suggest', () => {
  describe('ROW column1 = value1[, ..., columnN = valueN]', () => {
    const functions = getFunctionSignaturesByReturnType(Location.ROW, 'any', { scalar: true });
    it('suggests functions and an assignment for new expressions', async () => {
      const { assertSuggestions } = await setup();
      const expectedSuggestions = [getNewUserDefinedColumnSuggestion('col0'), ...functions];

      await assertSuggestions('ROW /', expectedSuggestions);
      await assertSuggestions('ROW foo = "bar", /', expectedSuggestions);
    });

    it('suggests only functions after an assignment', async () => {
      const { assertSuggestions } = await setup();
      await assertSuggestions('ROW col0 = /', functions);
    });

    it('suggests a comma and a pipe after a complete expression', async () => {
      const { assertSuggestions } = await setup();
      const expected = [', ', '| '].map(attachTriggerCommand);

      await assertSuggestions('ROW col0 = 23 /', expected);
      await assertSuggestions('ROW ABS(23) /', expected);
      await assertSuggestions('ROW ABS(23), col0=234 /', expected);
    });
  });
});
