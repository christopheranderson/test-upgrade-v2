import type { OperationsData, WorkOrderInput, WorkOrderRecord } from '@rayfin-app/shared';
export { loadWorkspace, collectPages } from '@rayfin-app/shared';
export type { OperationsData } from '@rayfin-app/shared';
import { randomUUID } from 'node:crypto';
import { starterData } from './seed.js';

export async function ensureRows<T extends { id: string }>(
  rows: T[], exists: (id: string) => Promise<unknown>, create: (row: T) => Promise<unknown>,
): Promise<number> {
  let added = 0;
  for (const row of rows) {
    if (!await exists(row.id)) { await create(row); added++; }
  }
  return added;
}

export async function seedWorkspace(data: OperationsData): Promise<{ added: number }> {
  const s = starterData();
  let added = 0;
  // Insert parents before children; fixed IDs make interrupted setup resumable without overwriting edits.
  added += await ensureRows(s.customers, id => data.Customer.findById(id), row => data.Customer.create(row));
  added += await ensureRows(s.sites, id => data.Site.findById(id), row => data.Site.create(row));
  added += await ensureRows(s.assets, id => data.Asset.findById(id), row => data.Asset.create(row));
  added += await ensureRows(s.technicians, id => data.Technician.findById(id), row => data.Technician.create(row));
  added += await ensureRows(s.parts, id => data.Part.findById(id), row => data.Part.create(row));
  added += await ensureRows(s.workOrders, id => data.WorkOrder.findById(id), row => data.WorkOrder.create(row));
  added += await ensureRows(s.assignments, id => data.Assignment.findById(id), row => data.Assignment.create(row));
  added += await ensureRows(s.usages, id => data.PartUsage.findById(id), row => data.PartUsage.create(row));
  added += await ensureRows(s.logs, id => data.WorkLog.findById(id), row => data.WorkLog.create(row));
  return { added };
}

export function validateId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Choose a valid record.');
  }
}
export async function findWorkOrder(data: OperationsData, id: string): Promise<WorkOrderRecord | undefined> {
  const rows = await data.WorkOrder.select(['id', 'asset_id', 'title', 'description', 'status', 'priority', 'dueOn', 'estimatedHours', 'createdAt', 'updatedAt'])
    .where({ id: { eq: id } }).first(1).execute();
  return rows[0];
}
export function validateWorkOrder(input: WorkOrderInput): WorkOrderInput {
  validateId(input.assetId);
  const title = input.title.trim();
  if (!title || title.length > 200) throw new Error('Title must be between 1 and 200 characters.');
  if (input.description.length > 2000) throw new Error('Description must be at most 2,000 characters.');
  if (!['routine', 'high', 'urgent'].includes(input.priority)) throw new Error('Choose a valid priority.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn) ||
      !Number.isFinite(Date.parse(input.dueOn)) ||
      new Date(input.dueOn).toISOString().slice(0, 10) !== input.dueOn) throw new Error('Choose a valid due date.');
  if (!Number.isFinite(input.estimatedHours) || input.estimatedHours < 0.25 || input.estimatedHours > 80) {
    throw new Error('Estimated hours must be between 0.25 and 80.');
  }
  return { ...input, title, description: input.description.trim() };
}
export async function saveWorkOrder(data: OperationsData, id: string, input: WorkOrderInput): Promise<WorkOrderRecord> {
  const valid = validateWorkOrder(input);
  if (!await data.Asset.findById(valid.assetId)) throw new Error('The asset no longer exists.');
  const patch = {
    asset_id: valid.assetId, title: valid.title, description: valid.description,
    priority: valid.priority, dueOn: `${valid.dueOn}T12:00:00.000Z`,
    estimatedHours: valid.estimatedHours, updatedAt: new Date().toISOString(),
  };
  if (id) {
    validateId(id);
    const existing = await findWorkOrder(data, id);
    if (!existing || existing.status !== 'planned') throw new Error('Only planned work orders can be edited. Reload and try again.');
    const updated = await data.WorkOrder.update({ id }, patch);
    return { ...existing, ...updated };
  }
  return data.WorkOrder.create({ ...patch, id: randomUUID(), status: 'planned', createdAt: patch.updatedAt });
}
