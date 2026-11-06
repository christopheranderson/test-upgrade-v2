import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, assign, reserve, removeOrder, seedRates, serviceReport, validateQuantity, validateTransition } from '../src/operations.js';
import { starterData, seedId } from '../src/seed.js';
import type { OperationsData } from '../src/workspace.js';
import type { sql } from '../src/sql.js';
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../src/workspace.js', async original => ({ ...await original<typeof import('../src/workspace.js')>(), loadWorkspace: load }));
function fakeData() {
  const query = { where: vi.fn(() => query), first: vi.fn(() => query), execute: vi.fn(async () => []) };
  const entity = () => ({ findById: vi.fn(), select: vi.fn(() => query), create: vi.fn(), update: vi.fn(), delete: vi.fn() });
  const data = { WorkOrder: entity(), Technician: entity(), Assignment: entity(), Part: entity(), PartUsage: entity(), WorkLog: entity() };
  // Existence checks return keys only; explicit selects return the configured fixture fields.
  for (const target of [data.WorkOrder, data.Technician]) {
    const selected = { where: () => selected, first: () => selected, execute: async () => {
      const row = await target.findById();
      return row ? [row] : [];
    } };
    target.select = vi.fn(() => selected) as typeof target.select;
  }
  return { data: data as unknown as OperationsData, query };
}
const id = seedId(100), technician = seedId(30), partId = seedId(40);
beforeEach(() => { load.mockResolvedValue(starterData(new Date('2026-11-05T12:00:00Z'))); });
describe('service lifecycle', () => {
  it.each([['planned', 'dispatched'], ['dispatched', 'in-progress'], ['in-progress', 'completed'], ['planned', 'cancelled'], ['in-progress', 'cancelled']])('allows %s → %s', (from, to) => expect(() => validateTransition(from, to)).not.toThrow());
  it.each([['planned', 'completed'], ['completed', 'planned'], ['cancelled', 'dispatched'], ['fake', 'planned']])('rejects %s → %s', (from, to) => expect(() => validateTransition(from, to)).toThrow());
  it('rejects stale states and dispatch without a technician', async () => {
    const { data } = fakeData();
    vi.mocked(data.WorkOrder.findById).mockResolvedValue({ ...starterData().workOrders[0], status: 'planned' });
    await expect(advance(data, id, 'dispatched', 'in-progress')).rejects.toThrow('changed');
    await expect(advance(data, id, 'planned', 'dispatched')).rejects.toThrow('Assign a technician');
    expect(data.WorkOrder.update).not.toHaveBeenCalled();
  });
  it('advances assigned work and persists its new status', async () => {
    const { data, query } = fakeData();
    vi.mocked(data.WorkOrder.findById).mockResolvedValue({ ...starterData().workOrders[0], status: 'planned' });
    query.execute.mockResolvedValue([{ id: technician }] as never);
    expect(await advance(data, id, 'planned', 'dispatched')).toEqual({ status: 'dispatched' });
    expect(data.WorkOrder.update).toHaveBeenCalledWith({ id }, expect.objectContaining({ status: 'dispatched' }));
  });
  it('assigns active technicians once, never to closed orders', async () => {
    const { data, query } = fakeData();
    vi.mocked(data.WorkOrder.findById).mockResolvedValue(starterData().workOrders[0]);
    vi.mocked(data.Technician.findById).mockResolvedValue(starterData().technicians[0]);
    await assign(data, id, technician);
    expect(data.Assignment.create).toHaveBeenCalledOnce();
    query.execute.mockResolvedValue([{ id: technician }] as never);
    await assign(data, id, technician);
    expect(data.Assignment.create).toHaveBeenCalledOnce();
    vi.mocked(data.WorkOrder.findById).mockResolvedValue({ ...starterData().workOrders[0], status: 'completed' });
    await expect(assign(data, id, technician)).rejects.toThrow('Only open');
  });
  it('rejects inactive technicians', async () => {
    const { data } = fakeData();
    vi.mocked(data.WorkOrder.findById).mockResolvedValue(starterData().workOrders[0]);
    vi.mocked(data.Technician.findById).mockResolvedValue({ ...starterData().technicians[0], active: false });
    await expect(assign(data, id, technician)).rejects.toThrow('active technician');
  });
  it('records usage as one immutable write with its original price', async () => {
    const { data } = fakeData();
    await reserve(data, id, partId, 2);
    expect(data.PartUsage.create).toHaveBeenCalledWith(expect.objectContaining({ part_id: partId, workOrder_id: id, quantity: 2, unitCost: 18.5 }));
    expect(data.Part.update).not.toHaveBeenCalled();
  });
  it('rejects insufficient stock and closed work without a write', async () => {
    const { data } = fakeData();
    await expect(reserve(data, id, partId, 25)).rejects.toThrow('Not enough stock');
    await expect(reserve(data, seedId(107), partId, 1)).rejects.toThrow('open work orders');
    expect(data.PartUsage.create).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 101, NaN, Infinity])('rejects invalid quantity %s', quantity => expect(() => validateQuantity(quantity)).toThrow());
  it('propagates a failed write without changing stock', async () => {
    const { data } = fakeData();
    vi.mocked(data.PartUsage.create).mockRejectedValue(new Error('offline'));
    await expect(reserve(data, id, partId, 1)).rejects.toThrow('offline');
    expect(data.Part.update).not.toHaveBeenCalled();
  });
  it('deletes only planned records with no service history', async () => {
    const { data, query } = fakeData();
    vi.mocked(data.WorkOrder.findById).mockResolvedValue({ ...starterData().workOrders[0], status: 'planned' });
    expect(await removeOrder(data, id)).toEqual({ deleted: true });
    expect(data.WorkOrder.delete).toHaveBeenCalledWith({ id });
    query.execute.mockResolvedValue([{ id }] as never);
    await expect(removeOrder(data, id)).rejects.toThrow('service history');
    vi.mocked(data.WorkOrder.findById).mockResolvedValue(starterData().workOrders[0]);
    await expect(removeOrder(data, id)).rejects.toThrow('Only planned');
  });
});
describe('SQL-backed service pricing', () => {
  function pool() {
    const request = { input: vi.fn(() => request), query: vi.fn(async () => ({ recordset: [{ calloutFees: 1000, rateCount: 3 }] })) };
    return { pool: { request: () => request } as unknown as sql.ConnectionPool, request };
  }
  it('combines scoped operational records and parameterized SQL pricing', async () => {
    const { data } = fakeData(), sql = pool();
    const report = await serviceReport(data, sql.pool, seedId(10));
    expect(report.openOrders).toBe(3);
    expect(report.completedOrders).toBe(1);
    expect(report.calloutFees).toBe(1000);
    expect(report.partsCost).toBe(163.5);
    expect(sql.request.input).toHaveBeenCalledWith('routine', expect.anything(), 2);
    expect(sql.request.query).toHaveBeenCalledWith(expect.stringContaining('@routine'));
  });
  it('surfaces missing rates and SQL failures rather than returning made-up totals', async () => {
    const { data } = fakeData(), sql = pool();
    sql.request.query.mockResolvedValue({ recordset: [{ calloutFees: 0, rateCount: 2 }] });
    await expect(serviceReport(data, sql.pool, '')).rejects.toThrow('rates are incomplete');
    sql.request.query.mockRejectedValue(new Error('permission denied'));
    await expect(serviceReport(data, sql.pool, '')).rejects.toThrow('permission denied');
  });
  it('seeds a namespaced rate table transactionally without overwriting existing rates', async () => {
    const sql = pool();
    await seedRates(sql.pool);
    const text = sql.request.query.mock.calls[0][0];
    expect(text).toContain('BEGIN TRANSACTION');
    expect(text).toContain('FieldworkServiceRates');
    expect(text).toContain('WHERE NOT EXISTS');
    expect(text).not.toContain('DROP');
  });
});
