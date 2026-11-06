import { AudienceType, UserDataFunctions, type RayfinContext } from '@microsoft/fabric-user-data-functions';
import type { UniversalAppSchema } from '@rayfin-app/shared';
import { seedWorkspace, saveWorkOrder } from './workspace.js';
import { advance, assign, reserve, removeOrder, serviceReport, seedRates } from './operations.js';
import { withOperationsLock, withSql } from './sql.js';

const udf = new UserDataFunctions();

// Inline boundary shapes keep this CLI version's generated contract self-contained.
udf.func('seedWorkspace', async (ctx: RayfinContext<UniversalAppSchema, AudienceType.Sql>): Promise<{ added: number }> => {
  await withSql(ctx.Tokens.Sql, seedRates);
  return withOperationsLock(ctx.Tokens.Sql, () => seedWorkspace(ctx.getDataClient()));
}, []);
udf.func('saveWorkOrder', async (id: string, input: {
  assetId: string; title: string; description: string; priority: 'routine' | 'high' | 'urgent'; dueOn: string; estimatedHours: number;
}, ctx: RayfinContext<UniversalAppSchema, AudienceType.Sql>): Promise<{
  id: string; asset_id: string; title: string; description: string; status: 'planned' | 'dispatched' | 'in-progress' | 'completed' | 'cancelled';
  priority: 'routine' | 'high' | 'urgent'; dueOn: string; estimatedHours: number; createdAt: string; updatedAt: string;
}> =>
  withOperationsLock(ctx.Tokens.Sql, () => saveWorkOrder(ctx.getDataClient(), id, input)), []);
udf.func('advanceWorkOrder', async (id: string, expected: string, target: string, ctx: RayfinContext<UniversalAppSchema, AudienceType.Sql>): Promise<{ status: string }> =>
  withOperationsLock(ctx.Tokens.Sql, () => advance(ctx.getDataClient(), id, expected, target)), []);
udf.func('assignTechnician', async (workOrderId: string, technicianId: string, ctx: RayfinContext<UniversalAppSchema, AudienceType.Sql>): Promise<{ assigned: boolean }> =>
  withOperationsLock(ctx.Tokens.Sql, () => assign(ctx.getDataClient(), workOrderId, technicianId)), []);
udf.func('usePart', async (workOrderId: string, partId: string, quantity: number, ctx: RayfinContext<UniversalAppSchema, AudienceType.Sql>): Promise<{ reserved: number }> =>
  withOperationsLock(ctx.Tokens.Sql, () => reserve(ctx.getDataClient(), workOrderId, partId, quantity)), []);
udf.func('deleteWorkOrder', async (id: string, ctx: RayfinContext<UniversalAppSchema, AudienceType.Sql>): Promise<{ deleted: boolean }> =>
  withOperationsLock(ctx.Tokens.Sql, () => removeOrder(ctx.getDataClient(), id)), []);
udf.func('getServiceReport', async (siteId: string, ctx: RayfinContext<UniversalAppSchema, AudienceType.Sql>): Promise<{
  openOrders: number; completedOrders: number; estimatedLabor: number; partsCost: number; lowStockParts: number; calloutFees: number;
}> =>
  withSql(ctx.Tokens.Sql, pool => serviceReport(ctx.getDataClient(), pool, siteId)), []);
