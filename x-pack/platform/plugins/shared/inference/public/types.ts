/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChatCompleteAPI, OutputAPI, InferenceConnector } from '@kbn/inference-common';

/* eslint-disable @typescript-eslint/no-empty-interface*/

export interface ConfigSchema {}

export interface InferenceSetupDependencies {}

export interface InferenceStartDependencies {}

export interface InferencePublicSetup {}

export interface InferencePublicStart {
  chatComplete: ChatCompleteAPI;
  output: OutputAPI;
  getConnectors: () => Promise<InferenceConnector[]>;
}
