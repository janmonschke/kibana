/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type httpProxy from 'http-proxy';
import type http from 'http';
import expect from '@kbn/expect';
import type { IValidatedEvent } from '@kbn/event-log-plugin/server';

import { URL, format as formatUrl } from 'url';
import getPort from 'get-port';
import { getHttpProxyServer } from '@kbn/alerting-api-integration-helpers';
import {
  getExternalServiceSimulatorPath,
  ExternalServiceSimulator,
  getWebhookServer,
} from '@kbn/actions-simulators-plugin/server/plugin';
import type { FtrProviderContext } from '../../../../../common/ftr_provider_context';
import { getEventLog } from '../../../../../common/lib';

const defaultValues: Record<string, any> = {
  headers: null,
  method: 'post',
  hasAuth: true,
};

function parsePort(url: Record<string, string>): Record<string, string | null | number> {
  return {
    ...url,
    port: url.port ? parseInt(url.port, 10) : url.port,
  };
}

export default function webhookTest({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const kibanaServer = getService('kibanaServer');
  const configService = getService('config');
  const retry = getService('retry');

  async function createWebhookAction(
    webhookSimulatorURL: string,
    config: Record<string, string | Record<string, string>> = {},
    kibanaUrlWithCreds: string
  ): Promise<string> {
    const { user, password } = extractCredentialsFromUrl(kibanaUrlWithCreds);
    const url =
      config.url && typeof config.url === 'object' ? parsePort(config.url) : webhookSimulatorURL;
    const composedConfig = {
      headers: {
        'Content-Type': 'text/plain',
      },
      ...config,
      url,
    };

    const { body: createdAction } = await supertest
      .post('/api/actions/connector')
      .set('kbn-xsrf', 'test')
      .send({
        name: 'A generic Webhook action',
        connector_type_id: '.webhook',
        secrets: {
          user,
          password,
        },
        config: composedConfig,
      })
      .expect(200);

    return createdAction.id;
  }

  describe('webhook action', () => {
    let webhookSimulatorURL: string = '';
    let webhookServer: http.Server;
    let kibanaURL: string = '<could not determine kibana url>';
    let proxyServer: httpProxy | undefined;
    let proxyHaveBeenCalled = false;

    // need to wait for kibanaServer to settle ...
    before(async () => {
      webhookServer = await getWebhookServer();
      const availablePort = await getPort({ port: getPort.makeRange(9000, 9100) });
      webhookServer.listen(availablePort);
      webhookSimulatorURL = `http://localhost:${availablePort}`;

      kibanaURL = kibanaServer.resolveUrl(
        getExternalServiceSimulatorPath(ExternalServiceSimulator.WEBHOOK)
      );

      proxyServer = await getHttpProxyServer(
        webhookSimulatorURL,
        configService.get('kbnTestServer.serverArgs'),
        () => {
          proxyHaveBeenCalled = true;
        }
      );
    });

    it('should return 200 when creating a webhook action successfully', async () => {
      const { body: createdAction } = await supertest
        .post('/api/actions/connector')
        .set('kbn-xsrf', 'test')
        .send({
          name: 'A generic Webhook action',
          connector_type_id: '.webhook',
          secrets: {
            user: 'username',
            password: 'mypassphrase',
          },
          config: {
            url: webhookSimulatorURL,
          },
        })
        .expect(200);

      expect(createdAction).to.eql({
        id: createdAction.id,
        is_preconfigured: false,
        is_system_action: false,
        is_deprecated: false,
        name: 'A generic Webhook action',
        connector_type_id: '.webhook',
        is_missing_secrets: false,
        config: {
          ...defaultValues,
          url: webhookSimulatorURL,
        },
      });

      expect(typeof createdAction.id).to.be('string');

      const { body: fetchedAction } = await supertest
        .get(`/api/actions/connector/${createdAction.id}`)
        .expect(200);

      expect(fetchedAction).to.eql({
        id: fetchedAction.id,
        is_preconfigured: false,
        is_system_action: false,
        is_deprecated: false,
        name: 'A generic Webhook action',
        connector_type_id: '.webhook',
        is_missing_secrets: false,
        config: {
          ...defaultValues,
          url: webhookSimulatorURL,
        },
      });
    });

    it('should remove headers when a webhook is updated', async () => {
      const { body: createdAction } = await supertest
        .post('/api/actions/connector')
        .set('kbn-xsrf', 'test')
        .send({
          name: 'A generic Webhook action',
          connector_type_id: '.webhook',
          secrets: {
            user: 'username',
            password: 'mypassphrase',
          },
          config: {
            url: webhookSimulatorURL,
            headers: {
              someHeader: '123',
            },
          },
        })
        .expect(200);

      expect(createdAction).to.eql({
        id: createdAction.id,
        is_preconfigured: false,
        is_system_action: false,
        is_deprecated: false,
        name: 'A generic Webhook action',
        connector_type_id: '.webhook',
        is_missing_secrets: false,
        config: {
          ...defaultValues,
          url: webhookSimulatorURL,
          headers: {
            someHeader: '123',
          },
        },
      });

      await supertest
        .put(`/api/actions/connector/${createdAction.id}`)
        .set('kbn-xsrf', 'foo')
        .send({
          name: 'A generic Webhook action',
          secrets: {
            user: 'username',
            password: 'mypassphrase',
          },
          config: {
            url: webhookSimulatorURL,
            headers: {
              someOtherHeader: '456',
            },
          },
        })
        .expect(200);

      const { body: fetchedAction } = await supertest
        .get(`/api/actions/connector/${createdAction.id}`)
        .expect(200);

      expect(fetchedAction).to.eql({
        id: fetchedAction.id,
        is_preconfigured: false,
        is_system_action: false,
        is_deprecated: false,
        name: 'A generic Webhook action',
        connector_type_id: '.webhook',
        is_missing_secrets: false,
        config: {
          ...defaultValues,
          url: webhookSimulatorURL,
          headers: {
            someOtherHeader: '456',
          },
        },
      });
    });

    it('should send authentication to the webhook target', async () => {
      const webhookActionId = await createWebhookAction(webhookSimulatorURL, {}, kibanaURL);
      const { body: result } = await supertest
        .post(`/api/actions/connector/${webhookActionId}/_execute`)
        .set('kbn-xsrf', 'test')
        .send({
          params: {
            body: 'authenticate',
          },
        })
        .expect(200);

      expect(result.status).to.eql('ok');
    });

    it('should support the POST method against webhook target', async () => {
      const webhookActionId = await createWebhookAction(
        webhookSimulatorURL,
        { method: 'post' },
        kibanaURL
      );
      const { body: result } = await supertest
        .post(`/api/actions/connector/${webhookActionId}/_execute`)
        .set('kbn-xsrf', 'test')
        .send({
          params: {
            body: 'success_post_method',
          },
        })
        .expect(200);

      expect(result.status).to.eql('ok');

      const events: IValidatedEvent[] = await retry.try(async () => {
        return await getEventLog({
          getService,
          spaceId: 'default',
          type: 'action',
          id: webhookActionId,
          provider: 'actions',
          actions: new Map([
            ['execute-start', { gte: 1 }],
            ['execute', { gte: 1 }],
          ]),
        });
      });

      const executeEvent = events[1];
      expect(executeEvent?.kibana?.action?.execution?.usage?.request_body_bytes).to.be(19);
    });

    it('should support the PUT method against webhook target', async () => {
      const webhookActionId = await createWebhookAction(
        webhookSimulatorURL,
        { method: 'put' },
        kibanaURL
      );
      const { body: result } = await supertest
        .post(`/api/actions/connector/${webhookActionId}/_execute`)
        .set('kbn-xsrf', 'test')
        .send({
          params: {
            body: 'success_put_method',
          },
        })
        .expect(200);

      expect(proxyHaveBeenCalled).to.equal(true);
      expect(result.status).to.eql('ok');
    });

    it('should handle target webhooks that are not added to allowedHosts', async () => {
      const { body: result } = await supertest
        .post('/api/actions/connector')
        .set('kbn-xsrf', 'test')
        .send({
          name: 'A generic Webhook action',
          connector_type_id: '.webhook',
          secrets: {
            user: 'username',
            password: 'mypassphrase',
          },
          config: {
            url: 'http://a.none.allowedHosts.webhook/endpoint',
          },
        })
        .expect(400);

      expect(result.error).to.eql('Bad Request');
      expect(result.message).to.match(/is not added to the Kibana config/);
    });

    it('should handle unreachable webhook targets', async () => {
      const webhookActionId = await createWebhookAction(
        'http://some.non.existent.com/endpoint',
        {},
        kibanaURL
      );
      const { body: result } = await supertest
        .post(`/api/actions/connector/${webhookActionId}/_execute`)
        .set('kbn-xsrf', 'test')
        .send({
          params: {
            body: 'failure',
          },
        })
        .expect(200);

      expect(result.status).to.eql('error');
      expect(result.message).to.match(/error calling webhook, retry later/);
    });

    it('should handle failing webhook targets', async () => {
      const webhookActionId = await createWebhookAction(webhookSimulatorURL, {}, kibanaURL);
      const { body: result } = await supertest
        .post(`/api/actions/connector/${webhookActionId}/_execute`)
        .set('kbn-xsrf', 'test')
        .send({
          params: {
            body: 'failure',
          },
        })
        .expect(200);

      expect(result.status).to.eql('error');
      expect(result.message).to.match(/error calling webhook, retry later/);
      expect(result.service_message).to.eql('[500] Internal Server Error');
    });

    after(() => {
      webhookServer.close();
      if (proxyServer) {
        proxyServer.close();
      }
    });
  });
}

function extractCredentialsFromUrl(url: string): { url: string; user: string; password: string } {
  const parsedUrl = new URL(url);
  const { password, username: user } = parsedUrl;
  return { url: formatUrl(parsedUrl, { auth: false }), user, password };
}
