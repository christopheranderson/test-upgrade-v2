import type { WorkspaceData, WorkOrderRecord } from '@rayfin-app/shared';
export const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
export const calendarDate = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(value.includes('T') && !/(Z|[+-]\d{2}:\d{2})$/i.test(value) ? `${value}Z` : value));
export function filterOrders(data: WorkspaceData, search: string, siteId: string, status: string): WorkOrderRecord[] {
  const term = search.trim().toLowerCase();
  return data.workOrders.filter(order => {
    const asset = data.assets.find(a => a.id === order.asset_id);
    const site = data.sites.find(s => s.id === asset?.site_id);
    return (!siteId || siteId === site?.id) &&
      (!status || (status === 'open' ? !['completed', 'cancelled'].includes(order.status) : status === order.status)) &&
      (!term || [order.title, order.description, asset?.name, site?.name].some(value => value?.toLowerCase().includes(term)));
  }).sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id));
}
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const known = [
    'Assign a technician before dispatching.', 'Not enough stock. Reload inventory.',
    'Work order changed. Reload before continuing.',
    'Only planned work orders can be deleted.',
    'This order has parts usage. Cancel it instead to preserve history.',
    'This order has service history. Cancel it instead to preserve history.',
    'Only planned work orders can be edited. Reload and try again.',
    'Only open work orders can be assigned.', 'Parts can only be used on open work orders.',
  ];
  return known.find(value => message.includes(value)) ??
    'The operation could not finish. Check your connection and permissions, then retry.';
}
