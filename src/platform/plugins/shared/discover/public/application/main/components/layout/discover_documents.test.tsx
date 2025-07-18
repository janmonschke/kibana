/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { act } from 'react-dom/test-utils';
import { BehaviorSubject } from 'rxjs';
import { findTestSubject } from '@elastic/eui/lib/test';
import { mountWithIntl } from '@kbn/test-jest-helpers';
import type { DataDocuments$ } from '../../state_management/discover_data_state_container';
import { discoverServiceMock } from '../../../../__mocks__/services';
import { FetchStatus } from '../../../types';
import { DiscoverDocuments, onResize } from './discover_documents';
import { dataViewMock, esHitsMock } from '@kbn/discover-utils/src/__mocks__';
import { buildDataTableRecord } from '@kbn/discover-utils';
import type { EsHitRecord } from '@kbn/discover-utils/types';
import { getDiscoverStateMock } from '../../../../__mocks__/discover_state.mock';
import type { DiscoverAppState } from '../../state_management/discover_app_state_container';
import type { DiscoverCustomization } from '../../../../customizations';
import { createCustomizationService } from '../../../../customizations/customization_service';
import { DiscoverGrid } from '../../../../components/discover_grid';
import { createDataViewDataSource } from '../../../../../common/data_sources';
import { type ProfilesManager } from '../../../../context_awareness';
import { internalStateActions } from '../../state_management/redux';
import { DiscoverTestProvider } from '../../../../__mocks__/test_provider';

const customisationService = createCustomizationService();

async function mountComponent(
  fetchStatus: FetchStatus,
  hits: EsHitRecord[],
  profilesManager?: ProfilesManager
) {
  const services = discoverServiceMock;

  services.data.query.timefilter.timefilter.getTime = () => {
    return { from: '2020-05-14T11:05:13.590', to: '2020-05-14T11:20:13.590' };
  };

  const documents$ = new BehaviorSubject({
    fetchStatus,
    result: hits.map((hit) => buildDataTableRecord(hit, dataViewMock)),
  }) as DataDocuments$;
  const stateContainer = getDiscoverStateMock({});
  stateContainer.appState.update({
    dataSource: createDataViewDataSource({ dataViewId: dataViewMock.id! }),
  });
  stateContainer.internalState.dispatch(
    stateContainer.injectCurrentTab(internalStateActions.setDataRequestParams)({
      dataRequestParams: {
        timeRangeRelative: {
          from: '2020-05-14T11:05:13.590',
          to: '2020-05-14T11:20:13.590',
        },
        timeRangeAbsolute: {
          from: '2020-05-14T11:05:13.590',
          to: '2020-05-14T11:20:13.590',
        },
        searchSessionId: 'test',
      },
    })
  );

  stateContainer.dataState.data$.documents$ = documents$;

  const props = {
    viewModeToggle: <div data-test-subj="viewModeToggle">test</div>,
    dataView: dataViewMock,
    onAddFilter: jest.fn(),
    stateContainer,
    onFieldEdited: jest.fn(),
  };

  profilesManager = profilesManager ?? services.profilesManager;
  const scopedEbtManager = services.ebtManager.createScopedEBTManager();

  const component = mountWithIntl(
    <DiscoverTestProvider
      services={{ ...services, profilesManager }}
      stateContainer={stateContainer}
      customizationService={customisationService}
      scopedProfilesManager={profilesManager.createScopedProfilesManager({ scopedEbtManager })}
      scopedEbtManager={scopedEbtManager}
    >
      <DiscoverDocuments {...props} />
    </DiscoverTestProvider>
  );
  await act(async () => {
    component.update();
  });
  return component;
}

describe('Discover documents layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('render loading when loading and no documents', async () => {
    const component = await mountComponent(FetchStatus.LOADING, []);
    expect(component.find('.dscDocuments__loading').exists()).toBeTruthy();
    expect(component.find('.dscTable').exists()).toBeFalsy();
  });

  test('render complete when loading but documents were already fetched', async () => {
    const component = await mountComponent(FetchStatus.LOADING, esHitsMock);
    expect(component.find('.dscDocuments__loading').exists()).toBeFalsy();
    expect(component.find('.dscTable').exists()).toBeTruthy();
  });

  test('render complete', async () => {
    const component = await mountComponent(FetchStatus.COMPLETE, esHitsMock);
    expect(component.find('.dscDocuments__loading').exists()).toBeFalsy();
    expect(component.find('.dscTable').exists()).toBeTruthy();
    expect(findTestSubject(component, 'unifiedDataTableToolbar').exists()).toBe(true);
    expect(findTestSubject(component, 'unifiedDataTableToolbarBottom').exists()).toBe(true);
    expect(findTestSubject(component, 'viewModeToggle').exists()).toBe(true);
  });

  test('should set rounded width to state on resize column', () => {
    const state = {
      grid: { columns: { timestamp: { width: 173 }, someField: { width: 197 } } },
    } as DiscoverAppState;
    const container = getDiscoverStateMock({});
    container.appState.update(state);

    onResize(
      {
        columnId: 'someField',
        width: 205.5435345534,
      },
      container
    );

    expect(container.appState.getState().grid?.columns?.someField.width).toEqual(206);
  });

  test('should render customisations', async () => {
    const customization: DiscoverCustomization = {
      id: 'data_table',
      logsEnabled: true,
      rowAdditionalLeadingControls: [],
    };

    customisationService.set(customization);
    const component = await mountComponent(FetchStatus.COMPLETE, esHitsMock);
    const discoverGridComponent = component.find(DiscoverGrid);
    expect(discoverGridComponent.exists()).toBeTruthy();

    expect(discoverGridComponent.prop('rowAdditionalLeadingControls')).toBe(
      customization.rowAdditionalLeadingControls
    );
    expect(discoverGridComponent.prop('externalCustomRenderers')).toBeDefined();
  });

  describe('context awareness', () => {
    it('should pass cell renderers from profile', async () => {
      customisationService.set({
        id: 'data_table',
        logsEnabled: true,
      });
      await discoverServiceMock.profilesManager.resolveRootProfile({ solutionNavId: 'test' });
      const component = await mountComponent(FetchStatus.COMPLETE, esHitsMock);
      const discoverGridComponent = component.find(DiscoverGrid);
      expect(discoverGridComponent.exists()).toBeTruthy();
      expect(Object.keys(discoverGridComponent.prop('externalCustomRenderers')!)).toEqual([
        '_source',
        'rootProfile',
      ]);
    });
  });
});
