import type { TypedDataClients } from '@microsoft/rayfin-data';
import type { UniversalAppSchema, WorkspaceData } from './index.js';

export type OperationsData = TypedDataClients<UniversalAppSchema>;
function isoDate(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('The workspace returned an invalid date.');
  return parsed.toISOString();
}
interface Page<T> { items: T[]; hasNextPage: boolean; endCursor?: string }
function pageAfter<T>(query: {
  after(cursor: string): { executePaginated(): Promise<Page<T>> };
  executePaginated(): Promise<Page<T>>;
}, cursor?: string): Promise<Page<T>> {
  return cursor ? query.after(cursor).executePaginated() : query.executePaginated();
}
export async function collectPages<T>(read: (cursor?: string) => Promise<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await read(cursor);
    rows.push(...page.items);
    if (!page.hasNextPage) return rows;
    if (!page.endCursor || page.endCursor === cursor) throw new Error('The data cursor did not advance. Reload the workspace.');
    cursor = page.endCursor;
  } while (rows.length < 10000);
  throw new Error('Workspace exceeds 10,000 records. Narrow the query before loading.');
}
export async function loadWorkspace(data: OperationsData): Promise<WorkspaceData> {
  const [customers, sites, assets, technicians, workOrders, assignments, parts, usages, logs] = await Promise.all([
    collectPages(cursor => pageAfter(data.Customer.select(['id', 'name', 'contact', 'email', 'serviceTier']).orderBy({ id: 'asc' }).first(200), cursor)),
    collectPages(cursor => pageAfter(data.Site.select(['id', 'customer_id', 'name', 'address', 'modelLocation']).orderBy({ id: 'asc' }).first(200), cursor)),
    collectPages(cursor => pageAfter(data.Asset.select(['id', 'site_id', 'name', 'serialNumber', 'category', 'installedOn']).orderBy({ id: 'asc' }).first(200), cursor)),
    collectPages(cursor => pageAfter(data.Technician.select(['id', 'name', 'specialty', 'hourlyRate', 'active']).orderBy({ id: 'asc' }).first(200), cursor)),
    collectPages(cursor => pageAfter(data.WorkOrder.select(['id', 'asset_id', 'title', 'description', 'status', 'priority', 'dueOn', 'estimatedHours', 'createdAt', 'updatedAt']).orderBy({ id: 'asc' }).first(200), cursor)),
    collectPages(cursor => pageAfter(data.Assignment.select(['id', 'workOrder_id', 'technician_id', 'assignedAt']).orderBy({ id: 'asc' }).first(200), cursor)),
    collectPages(cursor => pageAfter(data.Part.select(['id', 'sku', 'name', 'unitCost', 'stock', 'reorderAt']).orderBy({ id: 'asc' }).first(200), cursor)),
    collectPages(cursor => pageAfter(data.PartUsage.select(['id', 'workOrder_id', 'part_id', 'quantity', 'unitCost']).orderBy({ id: 'asc' }).first(200), cursor)),
    collectPages(cursor => pageAfter(data.WorkLog.select(['id', 'workOrder_id', 'message', 'createdAt']).orderBy({ id: 'asc' }).first(200), cursor)),
  ]);
  return { customers, sites,
    assets: assets.map(asset => ({ ...asset, installedOn: isoDate(asset.installedOn) })),
    technicians,
    workOrders: workOrders.map(order => ({ ...order, dueOn: isoDate(order.dueOn), createdAt: isoDate(order.createdAt), updatedAt: isoDate(order.updatedAt) })),
    assignments: assignments.map(assignment => ({ ...assignment, assignedAt: isoDate(assignment.assignedAt) })),
    parts: parts.map(part => ({ ...part, stock: part.stock - usages.filter(usage => usage.part_id === part.id).reduce((sum, usage) => sum + usage.quantity, 0) })),
    usages, logs: logs.map(log => ({ ...log, createdAt: isoDate(log.createdAt) })) };
}
