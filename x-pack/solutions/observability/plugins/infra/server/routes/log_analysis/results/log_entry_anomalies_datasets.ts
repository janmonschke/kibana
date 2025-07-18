/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';

import { createRouteValidationFunction } from '@kbn/io-ts-utils';
import { logAnalysisResultsV1 } from '../../../../common/http_api';
import type { InfraBackendLibs } from '../../../lib/infra_types';
import { getLogEntryAnomaliesDatasets } from '../../../lib/log_analysis';
import { assertHasInfraMlPlugins } from '../../../utils/request_context';
import { isMlPrivilegesError } from '../../../lib/log_analysis/errors';

export const initGetLogEntryAnomaliesDatasetsRoute = ({ framework }: InfraBackendLibs) => {
  framework
    .registerVersionedRoute({
      access: 'internal',
      method: 'post',
      path: logAnalysisResultsV1.LOG_ANALYSIS_GET_LOG_ENTRY_ANOMALIES_DATASETS_PATH,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: createRouteValidationFunction(
              logAnalysisResultsV1.getLogEntryAnomaliesDatasetsRequestPayloadRT
            ),
          },
        },
      },
      framework.router.handleLegacyErrors(async (requestContext, request, response) => {
        const {
          data: {
            logView,
            idFormats,
            timeRange: { startTime, endTime },
          },
        } = request.body;

        try {
          const infraMlContext = await assertHasInfraMlPlugins(requestContext);

          const { datasets, timing } = await getLogEntryAnomaliesDatasets(
            { infra: await infraMlContext.infra },
            logView,
            idFormats,
            startTime,
            endTime
          );

          return response.ok({
            body: logAnalysisResultsV1.getLogEntryAnomaliesDatasetsSuccessReponsePayloadRT.encode({
              data: {
                datasets,
              },
              timing,
            }),
          });
        } catch (error) {
          if (Boom.isBoom(error)) {
            throw error;
          }

          if (isMlPrivilegesError(error)) {
            return response.customError({
              statusCode: 403,
              body: {
                message: error.message,
              },
            });
          }

          return response.customError({
            statusCode: error.statusCode ?? 500,
            body: {
              message: error.message ?? 'An unexpected error occurred',
            },
          });
        }
      })
    );
};
