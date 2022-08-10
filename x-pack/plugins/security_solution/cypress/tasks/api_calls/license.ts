/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { User } from '../login';

const es = new URL(String(Cypress.env('ELASTICSEARCH_URL')));
const protocol = es.protocol.replace(':', '');

export function startBasicLicense(user: User) {
  const esUrl = `${protocol}://${user.username}:${user.password}@${es.hostname}:${es.port}`;
  cy.request({
    url: `${esUrl}/_license/start_basic?acknowledge=true`,
    method: 'POST',
  });
}

export function startPlatinumLicense(user: User) {
  const esUrl = `${protocol}://${user.username}:${user.password}@${es.hostname}:${es.port}`;
  cy.request({
    url: `${esUrl}/_license/?acknowledge=true`,
    method: 'POST',
    body: {
      license: {
        uid: '00000000-d3ad-7357-c0d3-000000000000',
        type: 'enterprise',
        issue_date_in_millis: 1577836800000,
        start_date_in_millis: 1577836800000,
        // expires 2022-12-31
        expiry_date_in_millis: 1672531199999,
        max_resource_units: 250,
        max_nodes: null,
        issued_to: 'Elastic Internal Use (development environments)',
        issuer: 'Elastic',
        signature:
          'AAAABQAAAA1gHUVis7hel8b8nNCAAAAAIAo5/x6hrsGh1GqqrJmy4qgmEC7gK0U4zQ6q5ZEMhm4jAAABAKMR+w3KZsMJfG5jNWgZXJLwRmiNqN7k94vKFgRdj1yM+gA9ufhXIn9d01OvFhPjilIqm+fxVjCxXwGKbFRiwtTWnTYjXPuNml+qCFGgUWguWEcVoIW6VU7/lYOqMJ4EB4zOMLe93P267iaDm542aelQrW1OJ69lGGuPBik8v9r1bNZzKBQ99VUr/qoosGDAm0udh2HxWzYoCL5lDML5Niy87xlVCubSSBXdUXzUgdZKKk6pKaMdHswB1gjvEfnwqPxEWAyrV0BCr/T1WehXd7U4p6/zt6sJ6cPh+34AZe9g4+3WPKrZhX4iaSHMDDHn4HNjO72CZ2oi42ZDNnJ37tA=',
      },
    },
  });
}
