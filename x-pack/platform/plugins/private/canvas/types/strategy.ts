/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TransportResult } from '@elastic/elasticsearch';
import type { estypes } from '@elastic/elasticsearch';
import type { IKibanaSearchRequest } from '@kbn/search-types';
import { ExpressionValueFilter } from '.';
export interface EssqlSearchStrategyRequest extends IKibanaSearchRequest {
  count: number;
  query: string;
  params?: Array<string | number | boolean>;
  timezone?: string;
  filter: ExpressionValueFilter[];
}

export interface EssqlSearchStrategyResponse {
  columns: Array<{
    id: string;
    name: string;
    meta: {
      type: string;
    };
  }>;
  rows: any[];

  rawResponse: TransportResult<estypes.SqlQueryResponse, unknown>;
}
