// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { RayfinClient, suppliedToken } from '@microsoft/rayfin-client';
import { dataService } from '@microsoft/rayfin-data';
import { functionsService } from '@microsoft/rayfin-functions';
import { connectorsService, type HostEnvironment } from '@microsoft/rayfin-connectors';
import { fabricSemanticModel } from '@microsoft/rayfin-connector-fabric-semanticmodel';
import type { UniversalAppSchema } from '@rayfin-app/shared';
import type { AppFunctionsSchema } from '@rayfin-app/functions/types';
import { connectorConfigs, type AppConnectorsSchema } from './connectors';

describe('packaged Node routing', () => {
  it('uses explicit same-origin routing and observes supplied-token rotation', async () => {
    let token = 'fixture-first';
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: { workOrders: { items: [] } } }));
    const client = RayfinClient.create({
      baseUrl: '', publishableKey: 'pk-fixture', fetch,
      auth: suppliedToken({ accessToken: () => token }),
      services: { data: dataService<UniversalAppSchema>() },
    });
    try {
      expect('auth' in client).toBe(false);
      await client.data.WorkOrder.select(['id']).execute();
      token = 'fixture-rotated';
      await client.data.WorkOrder.select(['id']).execute();
      expect(fetch.mock.calls.map(call => String(call[0]))).toEqual(['/graphql', '/graphql']);
      expect(fetch.mock.calls.map(call => new Headers(call[1]?.headers).get('authorization')))
        .toEqual(['Bearer fixture-first', 'Bearer fixture-rotated']);
    } finally {
      client.dispose();
    }
  });

  it.each([undefined, { type: 'cli' } as const])('selects connector host explicitly: %j', async (host?: HostEnvironment) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => host
      ? Response.json({ error: { code: 'FixtureDenied', message: 'Fixture permission denied' } }, { status: 403 })
      : Response.json({ status: 'Succeeded', output: { tables: [{ rows: [{ '[Value]': 1 }] }] }, errors: [] }));
    const client = RayfinClient.create({
      baseUrl: 'https://backend.example.test', publishableKey: 'pk-fixture',
      fetch, auth: suppliedToken({ accessToken: 'fixture-rayfin' }),
      services: {
        connectors: connectorsService<AppConnectorsSchema>({
          configs: connectorConfigs,
          runtime: {
            coffeesales: fabricSemanticModel({
              target: { workspaceId: 'fixture-workspace', itemId: 'fixture-model' },
              getToken: async () => 'fixture-powerbi',
            }),
          },
          ...(host ? { host } : {}),
        }),
      },
    });
    try {
      const result = await client.connectors.coffeesales.executeQuery({ query: 'EVALUATE ROW("Value", 1)' });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(fetch.mock.calls[0][0])).toBe(host
        ? 'https://api.powerbi.com/v1.0/myorg/groups/fixture-workspace/datasets/fixture-model/executeDaxQueries'
        : 'https://backend.example.test/connector-invoke/coffeesales');
      expect(result.status).toBe(host ? 'error' : 'success');
      const headers = new Headers(fetch.mock.calls[0][1]?.headers);
      expect(headers.get('authorization')).toBe(host ? 'Bearer fixture-powerbi' : 'Bearer fixture-rayfin');
    } finally {
      client.dispose();
    }
  });

  it('limits functionsBaseUrl overrides to function requests', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/api/getServiceReport')
      ? Response.json({ status: 'Succeeded', output: { openOrders: 9 }, errors: [] })
      : Response.json({ data: { workOrders: { items: [] } } }));
    const client = RayfinClient.create({
      baseUrl: 'https://backend.example.test', publishableKey: 'pk-fixture',
      functionsBaseUrl: 'http://localhost:7079', fetch, auth: suppliedToken(),
      services: { data: dataService<UniversalAppSchema>(), functions: functionsService<AppFunctionsSchema>() },
    });
    try {
      await client.functions.getServiceReport.invoke({ siteId: '' });
      await client.data.WorkOrder.select(['id']).execute();
      expect(fetch.mock.calls.map(call => String(call[0]))).toEqual([
        'http://localhost:7079/api/getServiceReport', 'https://backend.example.test/graphql',
      ]);
    } finally {
      client.dispose();
    }
  });
});
