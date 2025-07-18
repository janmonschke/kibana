/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { combineLatest, from } from 'rxjs';
import { map, tap, switchMap } from 'rxjs';
import type { IUiSettingsClient, KibanaExecutionContext } from '@kbn/core/public';
import type { IEsSearchResponse } from '@kbn/search-types';
import {
  getSearchParamsFromRequest,
  SearchRequest,
  DataPublicPluginStart,
} from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import { search as dataPluginSearch } from '@kbn/data-plugin/public';
import type { RequestResponder } from '@kbn/inspector-plugin/public';
import type { VegaInspectorAdapters } from '../vega_inspector';

/** @internal **/
export const extendSearchParamsWithRuntimeFields = async (
  indexPatterns: SearchAPIDependencies['indexPatterns'],
  requestParams: ReturnType<typeof getSearchParamsFromRequest>,
  indexPatternString?: string
) => {
  if (indexPatternString) {
    let runtimeMappings = requestParams.runtime_mappings;

    if (!runtimeMappings) {
      const indexPattern = (await indexPatterns.find(indexPatternString, 1)).find(
        (index) => index.title === indexPatternString
      );
      runtimeMappings = indexPattern?.getRuntimeMappings();
    }

    return {
      ...requestParams,
      runtime_mappings: runtimeMappings,
    };
  }

  return requestParams;
};

export interface SearchAPIDependencies {
  uiSettings: IUiSettingsClient;
  search: DataPublicPluginStart['search'];
  indexPatterns: DataViewsPublicPluginStart;
}

export class SearchAPI {
  constructor(
    private readonly dependencies: SearchAPIDependencies,
    private readonly abortSignal?: AbortSignal,
    public readonly inspectorAdapters?: VegaInspectorAdapters,
    private readonly searchSessionId?: string,
    private readonly executionContext?: KibanaExecutionContext
  ) {}

  search(searchRequests: SearchRequest[]) {
    const { search, indexPatterns } = this.dependencies;
    const requestResponders: any = {};

    return combineLatest(
      searchRequests.map((request) => {
        const { name: requestId, ...restRequest } = request;

        const requestParams = getSearchParamsFromRequest(restRequest, {
          getConfig: this.dependencies.uiSettings.get.bind(this.dependencies.uiSettings),
        });

        return from(
          extendSearchParamsWithRuntimeFields(indexPatterns, requestParams, `${request.index}`)
        ).pipe(
          tap((params) => {
            /** inspect request data **/
            if (this.inspectorAdapters) {
              requestResponders[requestId] = this.inspectorAdapters.requests.start(requestId, {
                ...request,
                searchSessionId: this.searchSessionId,
              });
              requestResponders[requestId].json(params);
            }
          }),
          switchMap((params) =>
            search
              .search(
                { params },
                {
                  abortSignal: this.abortSignal,
                  sessionId: this.searchSessionId,
                  executionContext: this.executionContext,
                }
              )
              .pipe(
                tap(
                  (data) => this.inspectSearchResult(data, requestResponders[requestId]),
                  (err) =>
                    this.inspectSearchResult(
                      {
                        rawResponse: err?.err,
                      },
                      requestResponders[requestId]
                    )
                ),
                map((data) => ({
                  name: requestId,
                  rawResponse: structuredClone(data.rawResponse),
                }))
              )
          )
        );
      })
    );
  }

  public resetSearchStats() {
    if (this.inspectorAdapters) {
      this.inspectorAdapters.requests.reset();
    }
  }

  private inspectSearchResult(response: IEsSearchResponse, requestResponder: RequestResponder) {
    if (requestResponder) {
      requestResponder
        .stats(dataPluginSearch.getResponseInspectorStats(response.rawResponse))
        .ok({ json: response.rawResponse });
    }
  }
}
