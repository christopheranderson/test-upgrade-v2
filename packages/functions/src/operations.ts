import { randomUUID } from 'node:crypto';
import type { ServiceReport, WorkStatus } from '@rayfin-app/shared';
import { sql } from './sql.js';
import { findWorkOrder, loadWorkspace, validateId, type OperationsData } from './workspace.js';

export function validateTransition(from: string, to: string): asserts to is WorkStatus {
  const allowed: Record<string, string[]> = {
    planned: ['dispatched', 'cancelled'], dispatched: ['in-progress', 'cancelled'],
    'in-progress': ['completed', 'cancelled'],
  };
  if (!allowed[from]?.includes(to)) throw new Error('That status change is not allowed. Reload the work order.');
}
export async function advance(data: OperationsData, id: string, expected: string, target: string): Promise<{ status: string }> {
  validateId(id); validateTransition(expected, target);
  const order = await findWorkOrder(data, id);
  if (!order || order.status !== expected) throw new Error('Work order changed. Reload before continuing.');
  if (target === 'dispatched') {
    const assigned = await data.Assignment.select(['id']).where({ workOrder_id: { eq: id } }).first(1).execute();
    if (!assigned.length) throw new Error('Assign a technician before dispatching.');
  }
  await data.WorkOrder.update({ id }, { status: target, updatedAt: new Date().toISOString() });
  return { status: target };
}
export async function assign(data: OperationsData, workOrderId: string, technicianId: string): Promise<{ assigned: boolean }> {
  validateId(workOrderId); validateId(technicianId);
  const [order, technicians] = await Promise.all([
    findWorkOrder(data, workOrderId),
    data.Technician.select(['id', 'active']).where({ id: { eq: technicianId } }).first(1).execute(),
  ]);
  const technician = technicians[0];
  if (!order || ['completed', 'cancelled'].includes(order.status)) throw new Error('Only open work orders can be assigned.');
  if (!technician?.active) throw new Error('Choose an active technician.');
  const existing = await data.Assignment.select(['id']).where({ workOrder_id: { eq: workOrderId }, technician_id: { eq: technicianId } }).first(1).execute();
  if (!existing.length) await data.Assignment.create({ id: randomUUID(), workOrder_id: workOrderId, technician_id: technicianId, assignedAt: new Date().toISOString() });
  return { assigned: true };
}
export function validateQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Quantity must be a whole number between 1 and 100.');
}
export async function reserve(data: OperationsData, workOrderId: string, partId: string, quantity: number): Promise<{ reserved: number }> {
  validateId(workOrderId); validateId(partId); validateQuantity(quantity);
  const workspace = await loadWorkspace(data);
  const order = workspace.workOrders.find(item => item.id === workOrderId);
  const part = workspace.parts.find(item => item.id === partId);
  if (!order || ['completed', 'cancelled'].includes(order.status)) throw new Error('Parts can only be used on open work orders.');
  if (!part || part.stock < quantity) throw new Error('Not enough stock. Reload inventory.');
  // Stock is an opening balance minus immutable usage, so recording usage is one atomic write.
  await data.PartUsage.create({ id: randomUUID(), workOrder_id: workOrderId, part_id: partId, quantity, unitCost: part.unitCost });
  return { reserved: quantity };
}
export async function removeOrder(data: OperationsData, id: string): Promise<{ deleted: boolean }> {
  validateId(id);
  const order = await findWorkOrder(data, id);
  if (!order || order.status !== 'planned') throw new Error('Only planned work orders can be deleted.');
  const [usages, assignments, logs] = await Promise.all([
    data.PartUsage.select(['id']).where({ workOrder_id: { eq: id } }).first(1).execute(),
    data.Assignment.select(['id']).where({ workOrder_id: { eq: id } }).first(1).execute(),
    data.WorkLog.select(['id']).where({ workOrder_id: { eq: id } }).first(1).execute(),
  ]);
  if (usages.length || assignments.length || logs.length) throw new Error('This order has service history. Cancel it instead to preserve history.');
  await data.WorkOrder.delete({ id });
  return { deleted: true };
}

export async function seedRates(pool: sql.ConnectionPool): Promise<void> {
  await pool.request().query(`
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    IF OBJECT_ID('dbo.FieldworkServiceRates', 'U') IS NULL
      CREATE TABLE dbo.FieldworkServiceRates (priority nvarchar(20) NOT NULL PRIMARY KEY, calloutFee decimal(10,2) NOT NULL CHECK (calloutFee >= 0));
    INSERT INTO dbo.FieldworkServiceRates (priority, calloutFee)
      SELECT v.priority, v.calloutFee FROM (VALUES (N'routine', 45.00), (N'high', 85.00), (N'urgent', 125.00)) v(priority, calloutFee)
      WHERE NOT EXISTS (SELECT 1 FROM dbo.FieldworkServiceRates r WITH (UPDLOCK, HOLDLOCK) WHERE r.priority = v.priority);
    COMMIT;`);
}
export async function serviceReport(data: OperationsData, pool: sql.ConnectionPool, siteId: string): Promise<ServiceReport> {
  if (siteId) validateId(siteId);
  const workspace = await loadWorkspace(data);
  const orders = workspace.workOrders.filter(order => !siteId || workspace.assets.some(asset => asset.id === order.asset_id && asset.site_id === siteId));
  const included = orders.filter(order => order.status !== 'cancelled');
  const open = orders.filter(order => !['cancelled', 'completed'].includes(order.status));
  const pricing = await pool.request()
    .input('routine', sql.Int, included.filter(order => order.priority === 'routine').length)
    .input('high', sql.Int, included.filter(order => order.priority === 'high').length)
    .input('urgent', sql.Int, included.filter(order => order.priority === 'urgent').length)
    .query<{ calloutFees: number; rateCount: number }>(`
      SELECT COALESCE(SUM(calloutFee * CASE priority WHEN 'routine' THEN @routine WHEN 'high' THEN @high WHEN 'urgent' THEN @urgent ELSE 0 END), 0) AS calloutFees,
        COUNT(*) AS rateCount FROM dbo.FieldworkServiceRates WHERE priority IN ('routine', 'high', 'urgent');`);
  if (pricing.recordset[0]?.rateCount !== 3) throw new Error('Service rates are incomplete. Run workspace setup.');
  return {
    openOrders: open.length, completedOrders: orders.filter(order => order.status === 'completed').length,
    estimatedLabor: included.reduce((sum, order) => sum + workspace.assignments.filter(a => a.workOrder_id === order.id)
      .reduce((subtotal, a) => subtotal + order.estimatedHours * (workspace.technicians.find(t => t.id === a.technician_id)?.hourlyRate ?? 0), 0), 0),
    partsCost: workspace.usages.filter(u => orders.some(order => order.id === u.workOrder_id)).reduce((sum, u) => sum + u.quantity * u.unitCost, 0),
    lowStockParts: workspace.parts.filter(part => part.stock <= part.reorderAt).length,
    calloutFees: pricing.recordset[0].calloutFees,
  };
}
