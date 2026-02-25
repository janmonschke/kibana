/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getCaseStepDefinition } from './get_case';
import { createCreateCaseStepDefinition } from './create_case';
// import { createCreateCaseFromTemplateStepDefinition } from './create_case_from_template';
import { createUpdateCaseStepDefinition } from './update_case';
import { createUpdateCasesStepDefinition } from './update_cases';
import { createSetCustomFieldStepDefinition } from './set_custom_field';
import { addCommentStepDefinition } from './add_comment';
import { findCasesStepDefinition } from './find_cases';
import { createSetSeverityStepDefinition } from './set_severity';
import { createSetStatusStepDefinition } from './set_status';
import { createCloseCaseStepDefinition } from './close_case';
import { createAssignCaseStepDefinition } from './assign_case';
import { createUnassignCaseStepDefinition } from './unassign_case';
import { createAddAlertsStepDefinition } from './add_alerts';
import { createAddEventsStepDefinition } from './add_events';
import { createFindSimilarCasesStepDefinition } from './find_similar_cases';
import { createSetDescriptionStepDefinition } from './set_description';
import { createSetTitleStepDefinition } from './set_title';
import { createAddObservablesStepDefinition } from './add_observables';
import { createAddTagStepDefinition } from './add_tag';
import { createAddCategoryStepDefinition } from './add_category';
import type { CasesPublicSetupDependencies } from '../types';

export function registerCasesSteps(
  workflowsExtensions: CasesPublicSetupDependencies['workflowsExtensions']
) {
  if (!workflowsExtensions) {
    return;
  }

  workflowsExtensions.registerStepDefinition(getCaseStepDefinition);
  workflowsExtensions.registerStepDefinition(createCreateCaseStepDefinition());
  // Leaving this in for now. We need to get support for reflective value lookup first.
  // workflowsExtensions.registerStepDefinition(createCreateCaseFromTemplateStepDefinition());
  workflowsExtensions.registerStepDefinition(createUpdateCaseStepDefinition());
  workflowsExtensions.registerStepDefinition(createUpdateCasesStepDefinition());
  workflowsExtensions.registerStepDefinition(createSetCustomFieldStepDefinition());
  workflowsExtensions.registerStepDefinition(addCommentStepDefinition);
  workflowsExtensions.registerStepDefinition(findCasesStepDefinition);
  workflowsExtensions.registerStepDefinition(createSetSeverityStepDefinition());
  workflowsExtensions.registerStepDefinition(createSetStatusStepDefinition());
  workflowsExtensions.registerStepDefinition(createCloseCaseStepDefinition());
  workflowsExtensions.registerStepDefinition(createAssignCaseStepDefinition());
  workflowsExtensions.registerStepDefinition(createUnassignCaseStepDefinition());
  workflowsExtensions.registerStepDefinition(createAddAlertsStepDefinition());
  workflowsExtensions.registerStepDefinition(createAddEventsStepDefinition());
  workflowsExtensions.registerStepDefinition(createFindSimilarCasesStepDefinition());
  workflowsExtensions.registerStepDefinition(createSetDescriptionStepDefinition());
  workflowsExtensions.registerStepDefinition(createSetTitleStepDefinition());
  workflowsExtensions.registerStepDefinition(createAddObservablesStepDefinition());
  workflowsExtensions.registerStepDefinition(createAddTagStepDefinition());
  workflowsExtensions.registerStepDefinition(createAddCategoryStepDefinition());
}
