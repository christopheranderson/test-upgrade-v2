import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceData } from '@rayfin-app/shared';
import App from './App';

const mocks = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn(), seed: vi.fn(), advance: vi.fn(), assign: vi.fn(),
  usePart: vi.fn(), remove: vi.fn(), report: vi.fn(), model: vi.fn(),
}));
vi.mock('@/lib/rayfin-client', () => ({ getRayfinClient: async () => ({ functions: {
  loadWorkspace: { invoke: mocks.load }, saveWorkOrder: { invoke: mocks.save },
  seedWorkspace: { invoke: mocks.seed }, advanceWorkOrder: { invoke: mocks.advance },
  assignTechnician: { invoke: mocks.assign }, usePart: { invoke: mocks.usePart },
  deleteWorkOrder: { invoke: mocks.remove }, getServiceReport: { invoke: mocks.report },
} }) }));
vi.mock('@/lib/workspace', () => ({ loadWorkspace: mocks.load }));
vi.mock('@/hooks/use-semantic-model-query', () => ({ useSemanticModelQuery: mocks.model }));
const date = '2026-11-05T12:00:00.000Z';
const fixture: WorkspaceData = {
  customers: [{ id: 'c', name: 'Northline', contact: 'Operations', email: 'ops@example.test', serviceTier: 'Priority' }],
  sites: [{ id: 's', customer_id: 'c', name: 'Astoria', address: 'Queens', modelLocation: 'Astoria' }, { id: 's2', customer_id: 'c', name: 'Midtown', address: 'Manhattan', modelLocation: 'Midtown' }],
  assets: [{ id: 'a', site_id: 's', name: 'Espresso machine', serialNumber: 'NL-001', category: 'Espresso', installedOn: date }],
  technicians: [{ id: 't', name: 'Alex Morgan', specialty: 'Espresso', hourlyRate: 85, active: true }],
  workOrders: [{ id: 'w', asset_id: 'a', title: 'Pressure check', description: 'Inspect pump', status: 'planned', priority: 'high', dueOn: date, estimatedHours: 2, createdAt: date, updatedAt: date }],
  assignments: [], usages: [], logs: [],
  parts: [{ id: 'p', sku: 'P-1', name: 'Gasket', unitCost: 18.5, stock: 3, reorderAt: 4 }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(structuredClone(fixture));
  mocks.save.mockResolvedValue({ ...fixture.workOrders[0], title: 'New inspection' });
  mocks.report.mockResolvedValue({ openOrders: 1, completedOrders: 0, estimatedLabor: 170, partsCost: 0, lowStockParts: 1, calloutFees: 85 });
  mocks.advance.mockResolvedValue({ status: 'dispatched' });
  mocks.assign.mockResolvedValue({ assigned: true });
  mocks.usePart.mockResolvedValue({ reserved: 1 });
  mocks.remove.mockResolvedValue({ deleted: true });
  mocks.model.mockReturnValue({ isLoading: false, data: { status: 'success', table: {
    columns: ['Coffee Shop Sales[store_location]', '[Revenue]', '[Transactions]', '[Units]', '[PeriodStart]', '[PeriodEnd]'].map(name => ({ name })),
    rows: [['Astoria', 232243.91, 50599, 70991, '2023-01-01T00:00:00.000', '2023-06-30T00:00:00.000']],
  } }, refetch: vi.fn() });
});
async function loaded() {
  render(<App />);
  await screen.findByRole('heading', { name: 'Pressure check' });
}
describe('Fieldwork workspace', () => {
  it('shows an honest loading state until data arrives', async () => {
    let finish!: (data: WorkspaceData) => void;
    mocks.load.mockReturnValue(new Promise<WorkspaceData>(resolve => { finish = resolve; }));
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Connecting');
    expect(screen.queryByText('Pressure check')).toBeNull();
    await act(async () => finish(fixture));
    expect(screen.getByText('Pressure check')).toBeVisible();
  });
  it('surfaces a load error and retries successfully', async () => {
    mocks.load.mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('connection and permissions');
    fireEvent.click(screen.getByRole('button', { name: 'Reload workspace' }));
    expect(await screen.findByText('Pressure check')).toBeVisible();
  });
  it('filters by text, location, and status with a useful empty state', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText('Search work orders'), { target: { value: 'no match' } });
    expect(screen.getByText('No work orders match these filters.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Search work orders'), { target: { value: 'espresso' } });
    expect(screen.getByText('Pressure check')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Filter by site'), { target: { value: 's2' } });
    expect(screen.queryByText('Pressure check')).toBeNull();
    fireEvent.change(screen.getByLabelText('Filter by site'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'completed' } });
    expect(screen.queryByText('Pressure check')).toBeNull();
  });
  it('creates work through the typed function contract and closes the form on success', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'New work order' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New inspection' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save work order' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ id: '', input: expect.objectContaining({ title: 'New inspection', assetId: 'a' }) }));
    await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('Work order saved');
  });
  it('preserves form input when saving fails', async () => {
    mocks.save.mockRejectedValue(new Error('offline'));
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'New work order' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Keep my input' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save work order' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Title')).toHaveValue('Keep my input');
  });
  it('edits planned work without changing its identity', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /Pressure check/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Pressure check');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Updated check' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save work order' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ id: 'w', input: expect.objectContaining({ title: 'Updated check' }) }));
  });
  it('dispatches with the expected current state and surfaces expected failures', async () => {
    mocks.advance.mockRejectedValue(new Error('Assign a technician before dispatching.'));
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /Pressure check/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dispatch work' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Assign a technician');
    expect(mocks.advance).toHaveBeenCalledWith({ id: 'w', expected: 'planned', target: 'dispatched' });
  });
  it('assigns a technician and records parts through separate trusted actions', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /Pressure check/ }));
    fireEvent.change(screen.getByLabelText('Assign technician'), { target: { value: 't' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith({ workOrderId: 'w', technicianId: 't' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled());
    fireEvent.change(screen.getByLabelText('Part', { exact: true }), { target: { value: 'p' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use parts' }));
    await waitFor(() => expect(mocks.usePart).toHaveBeenCalledWith({ workOrderId: 'w', partId: 'p', quantity: 2 }));
  });
  it('requires explicit deletion confirmation', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /Pressure check/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete planned order' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep order' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete planned order' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({ id: 'w' }));
  });
  it('renders inventory thresholds, sites, and technician workload', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Inventory' }));
    expect(screen.getByText('Reorder needed')).toBeVisible();
    expect(screen.getByText('Gasket')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sites & assets' }));
    expect(screen.getByText('NL-001 / Installed Nov 5, 2026')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(screen.getByRole('heading', { name: 'Alex Morgan' })).toBeVisible();
    expect(screen.getByText('0 open assignments / $85.00 per hour')).toBeVisible();
  });
  it('shows verified historical sales and provenance, not current sales', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Business context' }));
    expect(screen.getByText('$232,243.91')).toBeVisible();
    expect(screen.getByText('Jan 1, 2023 - Jun 30, 2023')).toBeVisible();
    expect(screen.getByText(/fictional starter data/)).toBeVisible();
  });
  it.each([{ error: new Error('forbidden') }, { data: { status: 'error', error: { message: 'query failed' } } }])('surfaces both connector error channels', async result => {
    const refetch = vi.fn();
    mocks.model.mockReturnValue({ isLoading: false, ...result, refetch });
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Business context' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sales context is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry sales connection' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it('separates SQL report failure from operational data and allows retry', async () => {
    mocks.report.mockRejectedValueOnce(new Error('SQL unavailable'));
    await loaded();
    expect(await screen.findByRole('alert')).toHaveTextContent('Check SQL access');
    fireEvent.click(screen.getByRole('button', { name: 'Retry report' }));
    await screen.findByText('$170.00');
    expect(screen.getByText('Pressure check')).toBeVisible();
  });
  it('populates an empty workspace through the setup function', async () => {
    mocks.load.mockResolvedValueOnce({ ...fixture, sites: [] });
    mocks.seed.mockResolvedValue({ added: 56 });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Populate workspace' }));
    await screen.findByRole('heading', { name: 'Pressure check' });
    expect(mocks.seed).toHaveBeenCalledOnce();
  });
  it('does not present a committed mutation as failed when only refresh fails', async () => {
    await loaded();
    mocks.load.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'New work order' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Committed order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save work order' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Saved, but the workspace could not refresh');
    expect(screen.queryByLabelText('Title')).toBeNull();
  });
});
