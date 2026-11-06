import { afterEach, expect, it, vi } from 'vitest';
import { AudienceType, RayfinContext } from '@microsoft/fabric-user-data-functions';
import type { UniversalAppSchema } from '@rayfin-app/shared';

afterEach(() => vi.unstubAllGlobals());

it('uses the packaged invocation context for caller-scoped data and SQL tokens', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
    data: { workOrders: { items: [{ id: 'fixture-order', status: 'planned' }] } },
  }));
  vi.stubGlobal('fetch', fetch);
  const context = new RayfinContext<UniversalAppSchema, AudienceType.Sql>({
    rayFinEndpoint: 'https://backend.example.test',
    publishableKey: 'pk-fixture',
    rayfinToken: 'fixture-caller-token',
  }, { Sql: 'fixture-sql-token' });
  const rows = await context.getDataClient().WorkOrder.select(['id', 'status']).execute();
  expect(rows).toEqual([{ id: 'fixture-order', status: 'planned' }]);
  expect(context.Tokens.Sql).toBe('fixture-sql-token');
  expect(String(fetch.mock.calls[0][0])).toBe('https://backend.example.test/graphql');
  const headers = new Headers(fetch.mock.calls[0][1]?.headers);
  expect(headers.get('authorization')).toBe('Bearer fixture-caller-token');
  expect(headers.get('authorization')).not.toContain('fixture-sql-token');
});
