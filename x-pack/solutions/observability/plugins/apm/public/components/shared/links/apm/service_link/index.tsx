/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiLink, EuiText } from '@elastic/eui';
import { AgentIcon } from '@kbn/custom-icons';
import { i18n } from '@kbn/i18n';
import styled from '@emotion/styled';
import type { TypeOf } from '@kbn/typed-react-router-config';
import React from 'react';
import { isMobileAgentName } from '../../../../../../common/agent_name';
import { NOT_AVAILABLE_LABEL } from '../../../../../../common/i18n';
import type { AgentName } from '../../../../../../typings/es_schemas/ui/fields/agent';
import { useApmRouter } from '../../../../../hooks/use_apm_router';
import { truncate, unit } from '../../../../../utils/style';
import type { ApmRoutes } from '../../../../routing/apm_route_config';
import { PopoverTooltip } from '../../../popover_tooltip';
import { TruncateWithTooltip } from '../../../truncate_with_tooltip';
import { MaxGroupsMessage, OTHER_SERVICE_NAME } from '../max_groups_message';

const StyledLink = styled(EuiLink)`
  ${truncate('100%')};
`;

function formatString(value?: string | null) {
  return value || NOT_AVAILABLE_LABEL;
}

interface ServiceLinkProps {
  agentName?: AgentName;
  query: TypeOf<ApmRoutes, '/services/{serviceName}/overview'>['query'];
  serviceName: string;
  serviceOverflowCount?: number;
}
export function ServiceLink({ agentName, query, serviceName }: ServiceLinkProps) {
  const apmRouter = useApmRouter();

  const serviceLink = isMobileAgentName(agentName)
    ? '/mobile-services/{serviceName}/overview'
    : '/services/{serviceName}/overview';

  if (serviceName === OTHER_SERVICE_NAME) {
    return (
      <EuiFlexGroup alignItems="center" gutterSize="xs">
        <EuiFlexItem grow={false}>
          <EuiText grow={false} style={{ fontStyle: 'italic', fontSize: '1rem' }}>
            {i18n.translate('xpack.apm.serviceLink.otherBucketName', {
              defaultMessage: 'Remaining Services',
            })}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <PopoverTooltip
            ariaLabel={i18n.translate('xpack.apm.serviceLink.tooltip', {
              defaultMessage:
                'Number of services instrumented has reached the current capacity of the APM server',
            })}
            iconType="warning"
          >
            <EuiText style={{ width: `${unit * 28}px` }} size="s">
              <MaxGroupsMessage />
            </EuiText>
          </PopoverTooltip>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  return (
    <TruncateWithTooltip
      data-test-subj="apmServiceListAppLink"
      text={formatString(serviceName)}
      content={
        <StyledLink
          data-test-subj={`serviceLink_${agentName}`}
          href={apmRouter.link(serviceLink, {
            path: { serviceName },
            query,
          })}
        >
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <AgentIcon agentName={agentName} size="l" role="presentation" />
            </EuiFlexItem>
            <EuiFlexItem className="eui-textTruncate">
              <span className="eui-textTruncate">{serviceName}</span>
            </EuiFlexItem>
          </EuiFlexGroup>
        </StyledLink>
      }
    />
  );
}
