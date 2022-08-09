/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { User, Role } from '../privileges';
import { createUsersAndRoles, deleteUsersAndRoles } from '../privileges';

const BasicRole: Role = {
  name: 'BasicRole',
  privileges: {
    elasticsearch: {
      cluster: ['all'],
    },
    kibana: [
      {
        base: ['all'],
        spaces: ['*'],
      },
    ],
  },
};

export const BasicUser: User = {
  username: 'UserWithBasicLicense',
  password: 'changeme',
  roles: [BasicRole.name],
};

const roles = [BasicRole];
const users = [BasicUser];

export function createBasicUser() {
  createUsersAndRoles(users, roles);

  // cy.request({
  //   url: `${Cypress.env('ELASTICSEARCH_URL')}/_license`,
  //   method: 'delete',
  // }).then(() => {
  //   console.log('license deleted');

  //   cy.request('/api/licensing/info');

  //   // activate the basic license
  //   return cy.request({
  //     url: `${Cypress.env('ELASTICSEARCH_URL')}/_license/start_basic?acknowledge=true`,
  //     method: 'post',
  //   });
  // });

  cy.request('/api/licensing/info');
  try {
    cy.request({
      url: `${Cypress.env('ELASTICSEARCH_URL')}/_license/start_basic?acknowledge=true`,
      method: 'post',
    });
  } catch (e) {
    console.error(e);
  }
}

export function deleteBasicUser() {
  deleteUsersAndRoles(users, roles);
  cy.request({
    url: `${Cypress.env('ELASTICSEARCH_URL')}/_license/start_trial?acknowledge=true`,
    method: 'delete',
  });
  cy.wait(3000);
}
