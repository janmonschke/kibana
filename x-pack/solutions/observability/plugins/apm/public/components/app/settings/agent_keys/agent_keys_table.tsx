/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiBasicTableColumn, EuiInMemoryTableProps } from '@elastic/eui';
import { EuiInMemoryTable } from '@elastic/eui';
import type { ApiKey } from '@kbn/security-plugin-types-common';
import { Timestamp } from '@kbn/apm-ui-shared';
import { ConfirmDeleteModal } from './confirm_delete_modal';

interface Props {
  agentKeys: ApiKey[];
  onKeyDelete: () => void;
  canManage: boolean;
}

export function AgentKeysTable({ agentKeys, onKeyDelete, canManage }: Props) {
  const [agentKeyToBeDeleted, setAgentKeyToBeDeleted] = useState<ApiKey>();

  const columns: Array<EuiBasicTableColumn<ApiKey>> = [
    {
      field: 'name',
      name: i18n.translate('xpack.apm.settings.agentKeys.table.nameColumnName', {
        defaultMessage: 'Name',
      }),
      sortable: true,
    },
    {
      field: 'username',
      name: i18n.translate('xpack.apm.settings.agentKeys.table.userNameColumnName', {
        defaultMessage: 'User',
      }),
      sortable: true,
    },
    {
      field: 'realm',
      name: i18n.translate('xpack.apm.settings.agentKeys.table.realmColumnName', {
        defaultMessage: 'Realm',
      }),
      sortable: true,
    },
    {
      field: 'creation',
      name: i18n.translate('xpack.apm.settings.agentKeys.table.creationColumnName', {
        defaultMessage: 'Created',
      }),
      dataType: 'date',
      sortable: true,
      mobileOptions: {
        show: false,
      },
      render: (date: number) => <Timestamp timestamp={date} renderMode="tooltip" />,
    },
  ];

  if (canManage) {
    columns.push({
      actions: [
        {
          name: i18n.translate('xpack.apm.settings.agentKeys.table.deleteActionTitle', {
            defaultMessage: 'Delete',
          }),
          description: i18n.translate(
            'xpack.apm.settings.agentKeys.table.deleteActionDescription',
            {
              defaultMessage: 'Delete this APM agent key',
            }
          ),
          icon: 'trash',
          color: 'danger',
          type: 'icon',
          onClick: (agentKey: ApiKey) => setAgentKeyToBeDeleted(agentKey),
        },
      ],
    });
  }

  const search: EuiInMemoryTableProps<ApiKey>['search'] = {
    box: {
      incremental: true,
    },
    filters: [
      {
        type: 'field_value_selection',
        field: 'username',
        name: i18n.translate('xpack.apm.settings.agentKeys.table.userFilterLabel', {
          defaultMessage: 'User',
        }),
        multiSelect: 'or',
        operator: 'exact',
        options: Object.keys(
          agentKeys.reduce((acc: Record<string, boolean>, { username }) => {
            acc[username] = true;
            return acc;
          }, {})
        ).map((value) => ({ value })),
      },
      {
        type: 'field_value_selection',
        field: 'realm',
        name: i18n.translate('xpack.apm.settings.agentKeys.table.realmFilterLabel', {
          defaultMessage: 'Realm',
        }),
        multiSelect: 'or',
        operator: 'exact',
        options: Object.keys(
          agentKeys.reduce((acc: Record<string, boolean>, { realm }) => {
            acc[realm] = true;
            return acc;
          }, {})
        ).map((value) => ({ value })),
      },
    ],
  };

  return (
    <React.Fragment>
      <EuiInMemoryTable
        tableCaption={i18n.translate('xpack.apm.settings.agentKeys.tableCaption', {
          defaultMessage: 'APM agent keys',
        })}
        items={agentKeys ?? []}
        columns={columns}
        pagination={true}
        search={search}
        sorting={true}
      />
      {agentKeyToBeDeleted && (
        <ConfirmDeleteModal
          onCancel={() => setAgentKeyToBeDeleted(undefined)}
          agentKey={agentKeyToBeDeleted}
          onConfirm={() => {
            setAgentKeyToBeDeleted(undefined);
            onKeyDelete();
          }}
        />
      )}
    </React.Fragment>
  );
}
