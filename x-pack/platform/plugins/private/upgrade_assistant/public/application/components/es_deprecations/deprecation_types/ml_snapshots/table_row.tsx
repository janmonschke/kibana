/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { EuiTableRow, EuiTableRowCell } from '@elastic/eui';
import { useAppContext } from '../../../../app_context';
import { EnrichedDeprecationInfo, MlAction } from '../../../../../../common/types';
import { GlobalFlyout } from '../../../../../shared_imports';
import { DeprecationTableColumns } from '../../../types';
import { EsDeprecationsTableCells } from '../../es_deprecations_table_cells';
import { MlSnapshotsResolutionCell } from './resolution_table_cell';
import { FixSnapshotsFlyout, FixSnapshotsFlyoutProps } from './flyout';
import { MlSnapshotsStatusProvider, useMlSnapshotContext } from './context';
import { MlSnapshotsActionsCell } from './actions_table_cell';

const { useGlobalFlyout } = GlobalFlyout;

interface TableRowProps {
  deprecation: EnrichedDeprecationInfo;
  rowFieldNames: DeprecationTableColumns[];
  mlUpgradeModeEnabled: boolean;
  index: number;
}

export const MlSnapshotsTableRowCells: React.FunctionComponent<TableRowProps> = ({
  rowFieldNames,
  deprecation,
  index,
}) => {
  const [showFlyout, setShowFlyout] = useState(false);
  const snapshotState = useMlSnapshotContext();

  const { addContent: addContentToGlobalFlyout, removeContent: removeContentFromGlobalFlyout } =
    useGlobalFlyout();

  const closeFlyout = useCallback(() => {
    setShowFlyout(false);
    removeContentFromGlobalFlyout('mlFlyout');
  }, [removeContentFromGlobalFlyout]);

  useEffect(() => {
    if (showFlyout) {
      addContentToGlobalFlyout<FixSnapshotsFlyoutProps>({
        id: 'mlFlyout',
        Component: FixSnapshotsFlyout,
        props: {
          deprecation,
          closeFlyout,
          ...snapshotState,
        },
        flyoutProps: {
          onClose: closeFlyout,
          className: 'eui-textBreakWord',
          'data-test-subj': 'mlSnapshotDetails',
          'aria-labelledby': 'mlSnapshotDetailsFlyoutTitle',
        },
      });
    }
  }, [snapshotState, addContentToGlobalFlyout, showFlyout, deprecation, closeFlyout]);

  return (
    <EuiTableRow data-test-subj="deprecationTableRow" key={`deprecation-row-${index}`}>
      {rowFieldNames.map((field: DeprecationTableColumns) => {
        return (
          <EuiTableRowCell
            key={field}
            truncateText={false}
            data-test-subj={`mlTableCell-${field}`}
            align={field === 'actions' ? 'right' : 'left'}
          >
            <EsDeprecationsTableCells
              fieldName={field}
              deprecation={deprecation}
              resolutionTableCell={<MlSnapshotsResolutionCell />}
              actionsTableCell={<MlSnapshotsActionsCell openFlyout={() => setShowFlyout(true)} />}
            />
          </EuiTableRowCell>
        );
      })}
    </EuiTableRow>
  );
};

export const MlSnapshotsTableRow: React.FunctionComponent<TableRowProps> = (props) => {
  const {
    services: { api },
  } = useAppContext();

  return (
    <MlSnapshotsStatusProvider
      snapshotId={(props.deprecation.correctiveAction as MlAction).snapshotId}
      jobId={(props.deprecation.correctiveAction as MlAction).jobId}
      mlUpgradeModeEnabled={props.mlUpgradeModeEnabled}
      api={api}
    >
      <MlSnapshotsTableRowCells {...props} />
    </MlSnapshotsStatusProvider>
  );
};
