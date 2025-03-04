/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IconType } from '@elastic/eui';
import { JOB_STATUS } from '@kbn/reporting-common';
import { Job } from '@kbn/reporting-public';

/**
 * This is not the most forward-compatible way of mapping to an {@link IconType} for an application.
 *
 * Ideally apps using reporting should send some metadata for the icon type they want - this is how
 * the saved objects management UI handles icons at the moment.
 */
export const guessAppIconTypeFromObjectType = (type: string): IconType => {
  switch (type) {
    case 'search':
      return 'discoverApp';
    case 'dashboard':
      return 'dashboardApp';
    case 'visualization':
      return 'visualizeApp';
    case 'canvas workpad':
      return 'canvasApp';
    case 'lens':
      return 'lensApp';
    default:
      return 'apps';
  }
};

export const getDisplayNameFromObjectType = (type: string): string => {
  switch (type) {
    case 'search':
      return 'discover session';
    default:
      return type;
  }
};

export const jobHasIssues = (job: Job): boolean => {
  return (
    Boolean(job.getWarnings()) ||
    [JOB_STATUS.WARNINGS, JOB_STATUS.FAILED].some((status) => job.status === status)
  );
};
