import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Boxes, Check, ChevronRight, ClipboardList, MapPin, Moon, Plus, RefreshCw, Sun, Users, Wrench, X } from 'lucide-react';
import { nextStatus, statusLabels, type WorkspaceData, type WorkOrderRecord, type ServiceReport } from '@rayfin-app/shared';
import { getRayfinClient } from '@/lib/rayfin-client';
import { loadWorkspace } from '@/lib/workspace';
import { useTheme } from '@/hooks/theme.context';
import { useSemanticModelQuery } from '@/hooks/use-semantic-model-query';
import { parseStores, storePerformance } from '@/queries/store-performance';
import { calendarDate, errorMessage, filterOrders, money } from '@/lib/operations';
import { WorkOrderForm } from '@/components/WorkOrderForm';

type View = 'Work orders' | 'Sites & assets' | 'Inventory' | 'Team' | 'Business context';
const navigation = [
  { name: 'Work orders', icon: ClipboardList }, { name: 'Sites & assets', icon: MapPin },
  { name: 'Inventory', icon: Boxes }, { name: 'Team', icon: Users },
  { name: 'Business context', icon: ArrowUpRight },
] as const;
function Badge({ children, urgent = false }: { children: React.ReactNode; urgent?: boolean }) {
  return <span className={`inline-flex rounded-full px-300 py-100 text-200 font-medium ${urgent ? 'bg-warning text-warning-foreground' : 'bg-muted text-muted-foreground'}`}>{children}</span>;
}
function Metric({ label, value, note }: { label: string; value: React.ReactNode; note: string }) {
  return <div className="border-l border-border pl-500 first:border-l-0 first:pl-0">
    <dt className="text-300 text-muted-foreground">{label}</dt>
    <dd className="mt-200 font-heading text-hero-800 font-semibold tabular-nums">{value}</dd>
    <dd className="mt-100 text-200 text-muted-foreground">{note}</dd>
  </div>;
}
function BusinessContext() {
  const model = useSemanticModelQuery(storePerformance());
  if (model.isLoading) return <p role="status">Reading store performance...</p>;
  if (model.error || model.data?.status === 'error') return <div role="alert" className="rounded-xl border border-destructive p-500">
    <p>Sales context is unavailable. Check access to Coffee Shop Sales in rayfin-playground.</p>
    <button className="secondary mt-300" onClick={() => void model.refetch()}>Retry sales connection</button>
  </div>;
  if (!model.data || model.data.status !== 'success') return <p>No sales results returned.</p>;
  let stores;
  try { stores = parseStores(model.data.table); }
  catch { return <p role="alert">The sales model schema changed. Review the store-performance query.</p>; }
  return <section>
    <div className="mb-600 flex flex-wrap items-end justify-between gap-400">
      <div><p className="eyebrow">Connected intelligence</p><h2 className="font-heading text-hero-800 font-semibold">The business behind the service.</h2></div>
      <Badge>Live connection / historical data</Badge>
    </div>
    <p className="mb-600 max-w-prose text-muted-foreground">Store activity helps put maintenance decisions in context. These are historical sales, not a forecast or a measurement of current equipment downtime.</p>
    {stores.length === 0 ? <p>No stores in the source model.</p> : <div className="grid gap-500 lg:grid-cols-3">
      {stores.map(store => <article key={store.location} className="rounded-2xl border border-border bg-card p-600">
        <MapPin className="mb-500 icon-size-400 text-primary" /><h3 className="font-heading text-500 font-semibold">{store.location}</h3>
        <p className="mt-100 text-200 text-muted-foreground">{calendarDate(store.periodStart)} - {calendarDate(store.periodEnd)}</p>
        <p className="mt-600 font-heading text-hero-800 font-semibold">{money(store.revenue)}</p><p className="text-300 text-muted-foreground">Sales revenue</p>
        <dl className="mt-500 flex justify-between border-t border-border pt-400"><div><dt className="text-200 text-muted-foreground">Transactions</dt><dd className="font-semibold">{store.transactions.toLocaleString()}</dd></div>
          <div><dt className="text-200 text-muted-foreground">Units sold</dt><dd className="font-semibold">{store.units.toLocaleString()}</dd></div></dl>
      </article>)}
    </div>}
    <aside className="mt-600 rounded-xl bg-muted p-500 text-300 text-muted-foreground">
      Source: Coffee Shop Sales / rayfin-playground. Revenue is quantity multiplied by unit price; transaction count is the number of source rows.
      Northline Coffee operations records are fictional starter data, stored in the workspace database. Location names link that service scenario to the model; no customer identity match is implied.
    </aside>
  </section>;
}

function App() {
  const theme = useTheme();
  const [view, setView] = useState<View>('Work orders');
  const [data, setData] = useState<WorkspaceData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const mutationLock = useRef(false);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [siteId, setSiteId] = useState('');
  const [status, setStatus] = useState('open');
  const [form, setForm] = useState<'new' | WorkOrderRecord>();
  const [reportState, setReportState] = useState<{
    workspace: WorkspaceData; siteId: string; version: number; value?: ServiceReport; failed: boolean;
  }>();
  const [reportVersion, setReportVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await loadWorkspace()); }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void loadWorkspace()
      .then(value => { if (active) { setData(value); setLoading(false); } })
      .catch(e => { if (active) { setError(errorMessage(e)); setLoading(false); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    if (!data) return;
    void getRayfinClient().then(client => client.functions.getServiceReport.invoke({ siteId }))
      .then(value => { if (active) setReportState({ workspace: data, siteId, version: reportVersion, value, failed: false }); })
      .catch(() => { if (active) setReportState({ workspace: data, siteId, version: reportVersion, failed: true }); });
    return () => { active = false; };
  }, [data, siteId, reportVersion]);
  const currentReport = reportState?.workspace === data && reportState?.siteId === siteId && reportState?.version === reportVersion ? reportState : undefined;
  const report = currentReport?.value;
  const reportError = currentReport?.failed;

  async function mutate(operation: () => Promise<unknown>, message: string): Promise<boolean> {
    if (mutationLock.current) return false;
    mutationLock.current = true; setPending(true); setError(''); setNotice('');
    let committed = false;
    try {
      await operation();
      committed = true;
      setNotice(message);
      setData(await loadWorkspace());
      return true;
    } catch (e) {
      setError(committed ? 'Saved, but the workspace could not refresh. Reload before making further changes.' : errorMessage(e));
      return committed;
    } finally { mutationLock.current = false; setPending(false); }
  }
  const orders = data ? filterOrders(data, search, siteId, status) : [];
  const selected = data?.workOrders.find(order => order.id === selectedId);
  const selectedAsset = data?.assets.find(asset => asset.id === selected?.asset_id);
  const selectedSite = data?.sites.find(site => site.id === selectedAsset?.site_id);
  const openCount = data?.workOrders.filter(order => !['completed', 'cancelled'].includes(order.status)).length;
  return <div className="min-h-full bg-background font-base text-300">
    <header className="border-b border-border bg-card px-600 py-400">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-400">
        <a href="#main" className="flex items-center gap-300 font-heading text-500 font-bold"><span className="flex rounded-lg bg-primary p-200 text-primary-foreground"><ArrowDownRight className="icon-size-400" /></span>fieldwork<span className="hidden border-l border-border pl-400 text-300 font-normal text-muted-foreground sm:inline">Service operations</span></a>
        <div className="flex items-center gap-300"><span className="hidden text-200 text-muted-foreground sm:inline">Northline Coffee</span>
          <button className="secondary" aria-label={theme.isDark ? 'Use light theme' : 'Use dark theme'} onClick={theme.toggleTheme}>{theme.isDark ? <Sun className="icon-size-200" /> : <Moon className="icon-size-200" />}</button>
          <span className="rounded-full bg-muted px-300 py-200 text-200 font-semibold">NC</span>
        </div>
      </div>
    </header>
    <div className="mx-auto grid max-w-screen-2xl lg:grid-cols-[var(--sidebar-width)_1fr]">
      <aside className="border-b border-border p-500 lg:min-h-screen lg:border-r lg:border-b-0">
        <p className="eyebrow mb-400 hidden lg:block">Workspace</p>
        <nav aria-label="Workspace" className="flex flex-wrap gap-200 lg:flex-col">
          {navigation.map(({ name, icon: Icon }) => <button key={name} onClick={() => { setView(name); setForm(undefined); setSelectedId(''); }}
            aria-current={view === name ? 'page' : undefined}
            className={`flex items-center gap-300 rounded-lg px-400 py-300 text-left font-medium ${view === name ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <Icon className="icon-size-200" />{name}{name === 'Work orders' && data && <span className="ml-auto text-200">{openCount}</span>}
          </button>)}
        </nav>
        <div className="mt-800 hidden rounded-xl border border-border p-400 lg:block"><Wrench className="mb-300 icon-size-300 text-primary" /><p className="font-medium">Keep the coffee flowing.</p><p className="mt-200 text-200 text-muted-foreground">One workspace for the people, equipment, and parts behind every store.</p></div>
      </aside>
      <main id="main" className="min-w-0 p-500 sm:p-800">
        <div className="mb-700 flex flex-wrap items-start justify-between gap-400">
          <div><p className="eyebrow">{view === 'Work orders' ? 'Operations / Service desk' : 'Operations / Workspace'}</p><h1 className="font-heading text-hero-900 font-semibold tracking-tight">{view}</h1>
            <p className="mt-200 text-muted-foreground">{view === 'Work orders' ? 'Small fixes. Smooth service. Everything in motion.' : 'The details that keep your operation moving.'}</p></div>
          <div className="flex gap-300"><button className="secondary" disabled={loading || pending} onClick={() => void refresh()}><RefreshCw className="icon-size-200" />Refresh</button>
            {view === 'Work orders' && data && data.assets.length > 0 && <button className="action" disabled={pending} onClick={() => { setForm('new'); setSelectedId(''); }}><Plus className="icon-size-200" />New work order</button>}</div>
        </div>
        {error && <div role="alert" className="mb-500 flex items-center justify-between gap-400 rounded-xl border border-destructive bg-card p-400"><p>{error}</p><button className="secondary" disabled={pending || loading} onClick={() => void refresh()}>Reload workspace</button></div>}
        {notice && <p role="status" className="mb-500 flex items-center gap-200 text-primary"><Check className="icon-size-200" />{notice}</p>}
        {loading && !data ? <p role="status" className="rounded-2xl border border-border bg-card p-800">Connecting to your service workspace...</p>
          : !data ? <p>Workspace unavailable. Use Reload workspace to reconnect.</p>
          : data.sites.length === 0 ? <section className="rounded-2xl border border-border bg-card p-800"><p className="eyebrow">Ready when you are</p><h2 className="font-heading text-600">Set up your service workspace</h2><p className="my-400 text-muted-foreground">Add the Northline starter records: three locations, equipment, technicians, parts, and scheduled work.</p>
            <button className="action" disabled={pending} onClick={() => void mutate(async () => (await getRayfinClient()).functions.seedWorkspace.invoke(), 'Workspace records are ready.')}>{pending ? 'Setting up...' : 'Populate workspace'}</button></section>
          : <>
            {view === 'Work orders' && <>
              <dl className="mb-700 grid grid-cols-1 gap-500 rounded-2xl border border-border bg-card p-600 sm:grid-cols-2 2xl:grid-cols-4">
                <Metric label="Open work" value={report?.openOrders ?? (reportError ? '—' : '...')} note="Across selected locations" />
                <Metric label="Completed" value={report?.completedOrders ?? (reportError ? '—' : '...')} note="Recorded service visits" />
                <Metric label="Labor estimate" value={report ? money(report.estimatedLabor) : reportError ? '—' : '...'} note="Hours × assigned technician rates" />
                <Metric label="Parts used" value={report ? money(report.partsCost) : reportError ? '—' : '...'} note="Recorded cost at time of use" />
              </dl>
              {reportError && <p role="alert" className="mb-500">The service report is unavailable. Check SQL access. <button className="underline" onClick={() => setReportVersion(value => value + 1)}>Retry report</button></p>}
              {report && <p className="mb-500 text-200 text-muted-foreground">SQL rate-card callout fees: <strong>{money(report.calloutFees)}</strong> across non-cancelled work. {report.lowStockParts} parts at or below reorder level.</p>}
              {form && <div className="mb-600"><WorkOrderForm key={form === 'new' ? 'new' : form.id} data={data} order={form === 'new' ? undefined : form} pending={pending}
                onCancel={() => setForm(undefined)} onSave={input => mutate(async () => (await getRayfinClient()).functions.saveWorkOrder.invoke({ id: form === 'new' ? '' : form.id, input }), 'Work order saved.')} /></div>}
              <div className="mb-400 flex flex-wrap items-center justify-between gap-300"><h2 className="font-heading text-500 font-semibold">Service queue <span className="ml-200 text-300 font-normal text-muted-foreground">{orders.length} orders</span></h2>
                <div className="flex flex-wrap gap-300"><input className="!mt-0 !w-auto" aria-label="Search work orders" placeholder="Search work orders..." value={search} onChange={e => setSearch(e.target.value)} />
                  <select className="!mt-0 !w-auto" aria-label="Filter by site" value={siteId} onChange={e => { setSiteId(e.target.value); setSelectedId(''); }}><option value="">All locations</option>{data.sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
                  <select className="!mt-0 !w-auto" aria-label="Filter by status" value={status} onChange={e => { setStatus(e.target.value); setSelectedId(''); }}><option value="open">Open work</option><option value="">All statuses</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
              </div>
              <div className={`grid gap-500 ${selected ? 'xl:grid-cols-2' : ''}`}>
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                  {orders.length === 0 ? <p className="p-800 text-muted-foreground">No work orders match these filters.</p> : orders.map(order => {
                    const asset = data.assets.find(a => a.id === order.asset_id);
                    return <button key={order.id} onClick={() => { setSelectedId(order.id); setConfirmDelete(false); setForm(undefined); }}
                      aria-pressed={selectedId === order.id} className={`flex w-full items-center justify-between gap-400 border-b border-border p-500 text-left last:border-b-0 hover:bg-accent ${selectedId === order.id ? 'bg-accent' : ''}`}>
                      <div className="min-w-0"><div className="mb-200 flex flex-wrap gap-200"><Badge urgent={order.priority !== 'routine'}>{order.priority}</Badge><Badge>{statusLabels[order.status]}</Badge></div>
                        <h3 className="font-heading text-400 font-semibold">{order.title}</h3>
                        <p className="mt-100 text-200 text-muted-foreground">{data.sites.find(s => s.id === asset?.site_id)?.name} / {asset?.name}</p></div>
                      <div className="flex shrink-0 items-center gap-300"><div className="hidden text-right text-200 text-muted-foreground sm:block"><p>{calendarDate(order.dueOn)}</p><p>{order.estimatedHours}h estimated</p></div><ChevronRight className="icon-size-200 text-muted-foreground" /></div>
                    </button>;
                  })}
                </div>
                {selected && <section key={selected.id} aria-label="Work order details" className="self-start rounded-2xl border border-border bg-card p-600">
                  <div className="flex items-start justify-between gap-400"><div><p className="eyebrow">{selectedSite?.name} / Service detail</p><h2 className="font-heading text-600 font-semibold">{selected.title}</h2></div><button className="secondary" aria-label="Close work order" onClick={() => setSelectedId('')}><X className="icon-size-200" /></button></div>
                  <p className="my-400 whitespace-pre-wrap text-muted-foreground">{selected.description}</p>
                  <dl className="grid grid-cols-2 gap-400 border-y border-border py-400"><div><dt className="text-200 text-muted-foreground">Equipment</dt><dd>{selectedAsset?.name}</dd><dd className="text-200 text-muted-foreground">{selectedAsset?.serialNumber}</dd></div><div><dt className="text-200 text-muted-foreground">Due date</dt><dd>{calendarDate(selected.dueOn)}</dd></div></dl>
                  <div className="my-500 flex flex-wrap gap-200"><Badge>{statusLabels[selected.status]}</Badge>
                    {nextStatus(selected.status) && <button className="action" disabled={pending} onClick={() => void mutate(async () => (await getRayfinClient()).functions.advanceWorkOrder.invoke({ id: selected.id, expected: selected.status, target: nextStatus(selected.status)! }), 'Work order status updated.')}>{({ planned: 'Dispatch work', dispatched: 'Start service', 'in-progress': 'Complete service', completed: '', cancelled: '' })[selected.status]}</button>}
                    {!['completed', 'cancelled'].includes(selected.status) && <button className="secondary" disabled={pending} onClick={() => void mutate(async () => (await getRayfinClient()).functions.advanceWorkOrder.invoke({ id: selected.id, expected: selected.status, target: 'cancelled' }), 'Work order cancelled. Parts usage remains in history.')}>Cancel order</button>}
                    {selected.status === 'planned' && <button className="secondary" disabled={pending} onClick={() => setForm(selected)}>Edit</button>}
                  </div>
                  <OrderResources data={data} order={selected} pending={pending} mutate={mutate} />
                  <h3 className="mt-600 font-semibold">Activity</h3><ol className="mt-300 space-y-300">{data.logs.filter(log => log.workOrder_id === selected.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(log => <li key={log.id} className="border-l-2 border-border pl-300"><p>{log.message}</p><p className="text-200 text-muted-foreground">{calendarDate(log.createdAt)}</p></li>)}</ol>
                  {selected.status === 'planned' && <div className="mt-600 border-t border-border pt-400">{confirmDelete ? <div role="alert"><p>Delete "{selected.title}"? Only orders without service history can be deleted.</p><div className="mt-300 flex gap-300"><button className="secondary text-destructive" disabled={pending} onClick={async () => {
                    if (await mutate(async () => (await getRayfinClient()).functions.deleteWorkOrder.invoke({ id: selected.id }), 'Work order deleted.')) { setSelectedId(''); setConfirmDelete(false); }
                  }}>Confirm delete</button><button className="secondary" disabled={pending} onClick={() => setConfirmDelete(false)}>Keep order</button></div></div> : <button className="text-destructive underline" disabled={pending} onClick={() => setConfirmDelete(true)}>Delete planned order</button>}</div>}
                </section>}
              </div>
            </>}
            {view === 'Sites & assets' && <div className="space-y-500">{data.sites.map(site => <section key={site.id} className="rounded-2xl border border-border bg-card p-600"><div className="flex gap-300"><MapPin className="icon-size-400 text-primary" /><div><h2 className="font-heading text-600 font-semibold">{site.name}</h2><p className="text-muted-foreground">{site.address}</p><p className="mt-100 text-200 text-muted-foreground">{data.customers.find(customer => customer.id === site.customer_id)?.name} / {data.customers.find(customer => customer.id === site.customer_id)?.serviceTier}</p></div></div>
              <div className="mt-500 grid gap-400 md:grid-cols-2">{data.assets.filter(asset => asset.site_id === site.id).map(asset => <article key={asset.id} className="rounded-xl bg-muted p-400"><p className="eyebrow">{asset.category}</p><h3 className="font-semibold">{asset.name}</h3><p className="text-200 text-muted-foreground">{asset.serialNumber} / Installed {calendarDate(asset.installedOn)}</p><button className="mt-300 text-primary underline" onClick={() => { setView('Work orders'); setSiteId(site.id); setStatus(''); }}>View location work</button></article>)}</div></section>)}</div>}
            {view === 'Inventory' && <><p className="mb-500 text-muted-foreground">Stock is deducted when parts are used on a work order. Historical usage retains its original unit cost.</p><div className="grid gap-400 md:grid-cols-2 xl:grid-cols-3">{data.parts.map(part => <article key={part.id} className="rounded-2xl border border-border bg-card p-500"><div className="flex justify-between"><Boxes className="icon-size-300 text-primary" /><Badge urgent={part.stock <= part.reorderAt}>{part.stock <= part.reorderAt ? 'Reorder needed' : 'In stock'}</Badge></div><p className="eyebrow mt-500">{part.sku}</p><h2 className="font-heading text-500 font-semibold">{part.name}</h2><p className="mt-400 font-heading text-600 font-semibold">{part.stock} <span className="text-300 font-normal text-muted-foreground">on hand</span></p><p className="text-200 text-muted-foreground">{money(part.unitCost)} each / Reorder at {part.reorderAt}</p></article>)}</div></>}
            {view === 'Team' && <div className="grid gap-500 md:grid-cols-2">{data.technicians.map(technician => {
              const activeJobs = data.assignments.filter(assignment => assignment.technician_id === technician.id && data.workOrders.some(order => order.id === assignment.workOrder_id && !['completed', 'cancelled'].includes(order.status)));
              return <article key={technician.id} className="rounded-2xl border border-border bg-card p-600"><div className="mb-500 flex items-center justify-between"><span className="rounded-full bg-muted p-400 font-semibold">{technician.name.split(' ').map(word => word[0]).join('')}</span><Badge>{technician.active ? 'Active' : 'Inactive'}</Badge></div><h2 className="font-heading text-500 font-semibold">{technician.name}</h2><p className="text-muted-foreground">{technician.specialty}</p><p className="mt-400">{activeJobs.length} open assignments / {money(technician.hourlyRate)} per hour</p></article>;
            })}</div>}
            {view === 'Business context' && <BusinessContext />}
          </>}
      </main>
    </div>
  </div>;
}

function OrderResources({ data, order, pending, mutate }: {
  data: WorkspaceData; order: WorkOrderRecord; pending: boolean;
  mutate(operation: () => Promise<unknown>, message: string): Promise<boolean>;
}) {
  const [technicianId, setTechnicianId] = useState('');
  const [partId, setPartId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const closed = ['completed', 'cancelled'].includes(order.status);
  const assigned = data.assignments.filter(a => a.workOrder_id === order.id);
  const usages = data.usages.filter(u => u.workOrder_id === order.id);
  return <>
    <h3 className="font-semibold">Service team</h3>
    <p className="mt-200 text-muted-foreground">{assigned.map(a => data.technicians.find(t => t.id === a.technician_id)?.name).join(', ') || 'No technicians assigned'}</p>
    {!closed && <form className="mt-300 flex flex-wrap items-end gap-200" onSubmit={async event => {
      event.preventDefault();
      if (await mutate(async () => (await getRayfinClient()).functions.assignTechnician.invoke({ workOrderId: order.id, technicianId }), 'Technician assigned.')) setTechnicianId('');
    }}><label className="min-w-0 flex-1 text-200">Assign technician<select required value={technicianId} onChange={e => setTechnicianId(e.target.value)}><option value="">Choose technician</option>{data.technicians.filter(t => t.active && !assigned.some(a => a.technician_id === t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><button className="secondary" disabled={pending || !technicianId}>Assign</button></form>}
    <h3 className="mt-600 font-semibold">Parts used</h3><ul className="mt-200 space-y-200">{usages.map(u => <li key={u.id} className="flex justify-between gap-200"><span>{u.quantity} × {data.parts.find(p => p.id === u.part_id)?.name}</span><span>{money(u.quantity * u.unitCost)}</span></li>)}</ul>{usages.length === 0 && <p className="mt-200 text-muted-foreground">No parts recorded</p>}
    {!closed && <form className="mt-300 flex flex-wrap items-end gap-200" onSubmit={async event => {
      event.preventDefault();
      if (await mutate(async () => (await getRayfinClient()).functions.usePart.invoke({ workOrderId: order.id, partId, quantity }), 'Parts recorded and stock updated.')) { setPartId(''); setQuantity(1); }
    }}><label className="min-w-0 flex-1 text-200">Part<select required value={partId} onChange={e => setPartId(e.target.value)}><option value="">Choose part</option>{data.parts.map(p => <option key={p.id} value={p.id} disabled={p.stock === 0}>{p.name} ({p.stock} available)</option>)}</select></label><label className="w-quantity text-200">Quantity<input required type="number" min={1} max={Math.min(100, data.parts.find(p => p.id === partId)?.stock ?? 100)} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label><button className="secondary" disabled={pending || !partId}>Use parts</button></form>}
  </>;
}
export default App;
