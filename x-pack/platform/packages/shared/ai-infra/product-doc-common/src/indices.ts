/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isImpliedDefaultElserInferenceId } from './is_default_inference_endpoint';
import type { ProductName } from './product';

export const productDocIndexPrefix = '.kibana_ai_product_doc';
export const productDocIndexPattern = `${productDocIndexPrefix}_*`;

export const getProductDocIndexName = (productName: ProductName, inferenceId?: string): string => {
  return `${productDocIndexPrefix}_${productName.toLowerCase()}${
    !isImpliedDefaultElserInferenceId(inferenceId) ? `-${inferenceId}` : ''
  }`;
};
