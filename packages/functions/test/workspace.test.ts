import { describe, it, expect, vi } from 'vitest';
import { collectPages, ensureRows, loadWorkspace, saveWorkOrder, seedWorkspace, validateWorkOrder, type OperationsData } from '../src/workspace.js';
import { starterData, seedId } from '../src/seed.js';

const valid = { assetId: seedId(20), title: '  Service check  ', description: ' Check seals ', priority: 'routine' as const, dueOn: '2026-11-12', estimatedHours: 1.5 };
function memoryData() {
  const rows = new Map<string, Map<string, Record<string, unknown>>>();
  const data = Object.fromEntries(['Customer', 'Site', 'Asset', 'Technician', 'WorkOrder', 'Assignment', 'Part', 'PartUsage', 'WorkLog'].map(name => {
    const records = new Map<string, Record<string, unknown>>();
    rows.set(name, records);
    const entity = {
      findById: vi.fn(async (id: string) => records.has(id) ? { id } : null),
      create: vi.fn(async (row: Record<string, unknown>) => { records.set(String(row.id), { ...row }); return { ...row }; }),
      update: vi.fn(async ({ id }: { id: string }, patch: Record<string, unknown>) => {
        const row = { ...records.get(id), ...patch }; records.set(id, row); return row;
      }),
      select: vi.fn(() => {
        let selectedId: string | undefined;
        const query = { orderBy: () => query, first: () => query, after: () => query,
          where: (filter: { id?: { eq: string } }) => { selectedId = filter.id?.eq; return query; },
          execute: async () => selectedId ? (records.has(selectedId) ? [records.get(selectedId)] : []) : [...records.values()],
          executePaginated: async () => ({ items: [...records.values()], hasNextPage: false }) };
        return query;
      }),
    };
    return [name, entity];
  })) as OperationsData;
  return { data, rows };
}
describe('workspace data', () => {
  it('pages without dropping records and stops at the last page', async () => {
    const read = vi.fn(async (cursor?: string) => cursor ? { items: [3], hasNextPage: false } : { items: [1, 2], hasNextPage: true, endCursor: 'next' });
    expect(await collectPages(read)).toEqual([1, 2, 3]);
    expect(read).toHaveBeenNthCalledWith(2, 'next');
  });
  it.each([undefined, 'repeat'])('rejects broken pagination rather than looping (%s)', async cursor => {
    let first = true;
    await expect(collectPages(async () => {
      const current = first; first = false;
      return { items: [], hasNextPage: true, endCursor: current ? 'repeat' : cursor };
    })).rejects.toThrow('cursor did not advance');
  });
  it('seeds all related entities, then preserves existing edits on a rerun', async () => {
    const { data, rows } = memoryData();
    const first = await seedWorkspace(data);
    expect(first.added).toBe(56);
    const original = rows.get('Customer')!.get(seedId(1))!;
    original.name = 'Edited customer';
    expect(await seedWorkspace(data)).toEqual({ added: 0 });
    expect(rows.get('Customer')!.get(seedId(1))!.name).toBe('Edited customer');
    const result = await loadWorkspace(data);
    expect(result.workOrders).toHaveLength(12);
    expect(result.assets.every(asset => result.sites.some(site => site.id === asset.site_id))).toBe(true);
    expect(result.assignments.every(a => result.workOrders.some(order => order.id === a.workOrder_id) && result.technicians.some(t => t.id === a.technician_id))).toBe(true);
    expect(result.parts[0].stock).toBe(23);
    expect(result.usages.every(u => result.parts.some(part => part.id === u.part_id))).toBe(true);
  });
  it('does not swallow partial seed failure and can resume', async () => {
    const create = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'));
    await expect(ensureRows([{ id: 'a' }, { id: 'b' }], async () => null, create)).rejects.toThrow('offline');
    expect(create).toHaveBeenCalledTimes(2);
  });
  it('normalizes SDK-deserialized Date objects before exposing browser contracts', async () => {
    const { data, rows } = memoryData();
    await seedWorkspace(data);
    rows.get('WorkOrder')!.get(seedId(100))!.dueOn = new Date('2026-11-12T12:00:00Z');
    const loaded = await loadWorkspace(data);
    expect(loaded.workOrders[0].dueOn).toBe('2026-11-12T12:00:00.000Z');
  });
  it('creates a normalized planned order and edits only planned records', async () => {
    const { data, rows } = memoryData();
    rows.get('Asset')!.set(seedId(20), { id: seedId(20) });
    const created = await saveWorkOrder(data, '', valid);
    expect(created).toMatchObject({ title: 'Service check', description: 'Check seals', status: 'planned', dueOn: '2026-11-12T12:00:00.000Z' });
    const updated = await saveWorkOrder(data, created.id, { ...valid, title: 'Updated check' });
    expect(updated.title).toBe('Updated check');
    rows.get('WorkOrder')!.get(created.id)!.status = 'completed';
    await expect(saveWorkOrder(data, created.id, valid)).rejects.toThrow('Only planned');
  });
  it('rejects missing assets without creating an order', async () => {
    const { data } = memoryData();
    await expect(saveWorkOrder(data, '', valid)).rejects.toThrow('asset no longer exists');
    expect(data.WorkOrder.create).not.toHaveBeenCalled();
  });
});
describe('input validation', () => {
  it.each([
    { title: '' }, { title: 'x'.repeat(201) }, { assetId: 'invalid' }, { description: 'x'.repeat(2001) },
    { priority: 'invalid' }, { dueOn: '2026-02-30' }, { dueOn: 'not-a-date' },
    { estimatedHours: 0 }, { estimatedHours: 81 }, { estimatedHours: NaN }, { estimatedHours: Infinity },
  ])('rejects invalid input %j', patch => {
    expect(() => validateWorkOrder({ ...valid, ...patch } as typeof valid)).toThrow();
  });
  it('accepts leap dates and boundary estimates', () => {
    expect(validateWorkOrder({ ...valid, dueOn: '2028-02-29', estimatedHours: 0.25 }).estimatedHours).toBe(0.25);
    expect(validateWorkOrder({ ...valid, estimatedHours: 80 }).estimatedHours).toBe(80);
  });
  it('constructs deterministic, internally related starter rows', () => {
    const data = starterData(new Date('2026-11-05T12:00:00Z'));
    const allIds = Object.values(data).flat().map(row => row.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(data.workOrders[0].dueOn).toBe('2026-11-02T12:00:00.000Z');
  });
});
