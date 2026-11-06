import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signInWithBrokeredToken } from '@microsoft/rayfin-auth-provider-fabric';
import type { AppClient } from './rayfin-client';

const backend = 'https://runtime.example.test/backend';
const fixtureToken = 'fixture.session.token';
const report = { openOrders: 9, completedOrders: 4, estimatedLabor: 1565, partsCost: 513, lowStockParts: 2, calloutFees: 1065 };

describe('packaged client integration', () => {
  let client: AppClient | undefined;
  const requests: { url: string; headers: Headers; body: string }[] = [];

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    requests.length = 0;
    vi.stubEnv('VITE_RAYFIN_API_URL', 'https://fallback.example.test');
    vi.stubEnv('VITE_RAYFIN_PUBLISHABLE_KEY', 'pk-fallback');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/rayfin.config.json') {
        return Response.json({ apiUrl: backend, publishableKey: 'pk-fixture', workspaceId: 'ws-fixture', itemId: 'item-fixture', portalUrl: 'https://app.fabric.microsoft.com' });
      }
      requests.push({ url, headers: new Headers(init?.headers), body: String(init?.body ?? '') });
      if (url === `${backend}/graphql`) {
        return Response.json({ data: { workOrders: { items: [{ id: 'order-fixture', title: 'Pressure check', status: 'planned' }] } } });
      }
      if (url === `${backend}/functions/getServiceReport/invoke`) {
        return Response.json({ status: 'Succeeded', output: report, errors: [] });
      }
      if (url === `${backend}/connector-invoke/coffeesales`) {
        return Response.json({
          status: 'Succeeded',
          output: { tables: [{ rows: [{ 'Coffee Shop Sales[store_location]': 'Astoria', '[Revenue]': 232243.91 }] }] },
          errors: [],
        });
      }
      throw new Error(`Unexpected fixture request: ${url}`);
    }));
  });

  afterEach(() => {
    client?.dispose();
    client = undefined;
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function authenticatedClient() {
    const { getRayfinClient } = await import('./rayfin-client');
    client = await getRayfinClient();
    await signInWithBrokeredToken(client.auth, {
      accessToken: fixtureToken, tokenType: 'Bearer', expiresIn: 3600,
    });
    return client;
  }

  it('uses the companion auth provider and shared transport for app data', async () => {
    const current = await authenticatedClient();
    expect(current.auth.getSession().isAuthenticated).toBe(true);
    const rows = await current.data.WorkOrder.select(['id', 'title', 'status']).execute();
    expect(rows).toEqual([{ id: 'order-fixture', title: 'Pressure check', status: 'planned' }]);
    expect(requests[0].url).toBe(`${backend}/graphql`);
    expect(requests[0].headers.get('authorization')).toBe(`Bearer ${fixtureToken}`);
    expect(current.runtimeConfig?.itemId).toBe('item-fixture');
  });

  it('routes typed functions through the configured backend and unwraps output', async () => {
    const current = await authenticatedClient();
    expect(await current.functions.getServiceReport.invoke({ siteId: '' })).toEqual(report);
    expect(JSON.parse(requests[0].body)).toEqual({ siteId: '' });
    expect(requests[0].headers.get('authorization')).toBe(`Bearer ${fixtureToken}`);
  });

  it('registers the semantic runtime and normalizes its wire response', async () => {
    const current = await authenticatedClient();
    const result = await current.connectors.coffeesales.executeQuery({ query: 'EVALUATE ROW("Revenue", 232243.91)' });
    expect(result).toMatchObject({
      status: 'success',
      table: { rows: [['Astoria', 232243.91]] },
    });
    expect(requests[0].url).toBe(`${backend}/connector-invoke/coffeesales`);
    expect(requests[0].headers.get('authorization')).toBe(`Bearer ${fixtureToken}`);
    expect(requests[0].body).not.toContain('workspaceId');
  });

  it('rejects new capability requests after disposal without network activity', async () => {
    const current = await authenticatedClient();
    current.dispose();
    await expect(current.data.WorkOrder.select(['id']).execute()).rejects.toMatchObject({ code: 'CLIENT_DISPOSED' });
    expect(requests).toHaveLength(0);
    current.dispose();
  });
});
