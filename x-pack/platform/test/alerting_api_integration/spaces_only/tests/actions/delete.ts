/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Spaces } from '../../scenarios';
import { getUrlPrefix, ObjectRemover } from '../../../common/lib';
import type { FtrProviderContext } from '../../../common/ftr_provider_context';

export default function deleteConnectorTests({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');

  describe('delete', () => {
    const objectRemover = new ObjectRemover(supertest);

    after(() => objectRemover.removeAll());

    it('should handle delete connector request appropriately', async () => {
      const { body: createdConnector } = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/actions/connector`)
        .set('kbn-xsrf', 'foo')
        .send({
          name: 'My connector',
          connector_type_id: 'test.index-record',
          config: {
            unencrypted: `This value shouldn't get encrypted`,
          },
          secrets: {
            encrypted: 'This value should be encrypted',
          },
        })
        .expect(200);

      await supertest
        .delete(`${getUrlPrefix(Spaces.space1.id)}/api/actions/connector/${createdConnector.id}`)
        .set('kbn-xsrf', 'foo')
        .expect(204, '');
    });

    it(`shouldn't delete connector from another space`, async () => {
      const { body: createdConnector } = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/actions/connector`)
        .set('kbn-xsrf', 'foo')
        .send({
          name: 'My connector',
          connector_type_id: 'test.index-record',
          config: {
            unencrypted: `This value shouldn't get encrypted`,
          },
          secrets: {
            encrypted: 'This value should be encrypted',
          },
        })
        .expect(200);
      objectRemover.add(Spaces.space1.id, createdConnector.id, 'connector', 'actions');

      await supertest
        .delete(`${getUrlPrefix(Spaces.other.id)}/api/actions/connector/${createdConnector.id}`)
        .set('kbn-xsrf', 'foo')
        .expect(404, {
          statusCode: 404,
          error: 'Not Found',
          message: `Saved object [action/${createdConnector.id}] not found`,
        });
    });

    it(`should handle delete request appropriately when connector doesn't exist`, async () => {
      await supertest
        .delete(`${getUrlPrefix(Spaces.space1.id)}/api/actions/connector/2`)
        .set('kbn-xsrf', 'foo')
        .expect(404, {
          statusCode: 404,
          error: 'Not Found',
          message: 'Saved object [action/2] not found',
        });
    });

    it(`shouldn't delete a preconfigured connector`, async () => {
      await supertest
        .delete(`${getUrlPrefix(Spaces.space1.id)}/api/actions/connector/my-slack1`)
        .set('kbn-xsrf', 'foo')
        .expect(400, {
          statusCode: 400,
          error: 'Bad Request',
          message: `Preconfigured action my-slack1 is not allowed to delete.`,
        });
    });

    it(`shouldn't delete a system action`, async () => {
      await supertest
        .delete(
          `${getUrlPrefix(
            Spaces.space1.id
          )}/api/actions/connector/system-connector-test.system-action`
        )
        .set('kbn-xsrf', 'foo')
        .expect(400, {
          statusCode: 400,
          error: 'Bad Request',
          message: 'System action system-connector-test.system-action is not allowed to delete.',
        });
    });
  });
}
