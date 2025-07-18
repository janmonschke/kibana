/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderWithI18n } from '@kbn/test-jest-helpers';

import { EditFilterListHeader } from './header';

describe('EditFilterListHeader', () => {
  const updateNewFilterId = jest.fn(() => {});
  const updateDescription = jest.fn(() => {});

  const requiredProps = {
    updateNewFilterId,
    updateDescription,
    canCreateFilter: true,
    canDeleteFilter: true,
  };

  test('renders the header when creating a new filter list with the ID not set', () => {
    const props = {
      ...requiredProps,
      newFilterId: '',
      isNewFilterIdInvalid: true,
      totalItemCount: 0,
    };

    const { container } = renderWithI18n(<EditFilterListHeader {...props} />);

    expect(container).toMatchSnapshot();
  });

  test('renders the header when creating a new filter list with ID, description and items set', () => {
    const props = {
      ...requiredProps,
      newFilterId: 'test_filter_list',
      isNewFilterIdInvalid: false,
      description: 'A test filter list',
      totalItemCount: 15,
    };

    const { container } = renderWithI18n(<EditFilterListHeader {...props} />);

    expect(container).toMatchSnapshot();
  });

  test('renders the header when editing an existing unused filter list with no description or items', () => {
    const props = {
      ...requiredProps,
      filterId: 'test_filter_list',
      totalItemCount: 0,
    };

    const { container } = renderWithI18n(<EditFilterListHeader {...props} />);

    expect(container).toMatchSnapshot();
  });

  test('renders the header when editing an existing used filter list with description and items set', () => {
    const props = {
      ...requiredProps,
      filterId: 'test_filter_list',
      description: 'A test filter list',
      totalItemCount: 15,
      usedBy: {
        jobs: ['cloudwatch'],
        detectors: ['mean CPUUtilization'],
      },
    };

    const { container } = renderWithI18n(<EditFilterListHeader {...props} />);

    expect(container).toMatchSnapshot();
  });
});
