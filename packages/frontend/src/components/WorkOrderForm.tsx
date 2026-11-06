import { useState } from 'react';
import type { WorkOrderInput, WorkOrderRecord, WorkspaceData, Priority } from '@rayfin-app/shared';

export function WorkOrderForm({ data, order, pending, onSave, onCancel }: {
  data: WorkspaceData; order?: WorkOrderRecord; pending: boolean;
  onSave(input: WorkOrderInput): Promise<boolean>; onCancel(): void;
}) {
  const [input, setInput] = useState<WorkOrderInput>({
    title: order?.title ?? '', description: order?.description ?? '',
    assetId: order?.asset_id ?? data.assets[0]?.id ?? '',
    priority: order?.priority ?? 'routine', dueOn: order?.dueOn.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    estimatedHours: order?.estimatedHours ?? 1,
  });
  return <section className="rounded-2xl border border-primary bg-card p-600" aria-labelledby="form-title">
    <h2 id="form-title" className="font-heading text-600 font-semibold">{order ? 'Edit work order' : 'New work order'}</h2>
    <form className="mt-500 grid gap-400 sm:grid-cols-2" onSubmit={async event => {
      event.preventDefault();
      if (await onSave(input)) onCancel();
    }}>
      <label className="sm:col-span-2">Title<input autoFocus required maxLength={200} value={input.title} onChange={e => setInput({ ...input, title: e.target.value })} /></label>
      <label className="sm:col-span-2">Asset<select required value={input.assetId} onChange={e => setInput({ ...input, assetId: e.target.value })}>
        {data.assets.map(asset => <option key={asset.id} value={asset.id}>{data.sites.find(site => site.id === asset.site_id)?.name} / {asset.name} / {asset.serialNumber}</option>)}
      </select></label>
      <label>Priority<select value={input.priority} onChange={e => setInput({ ...input, priority: e.target.value as Priority })}>
        <option value="routine">Routine</option><option value="high">High</option><option value="urgent">Urgent</option>
      </select></label>
      <label>Due date<input required type="date" value={input.dueOn} onChange={e => setInput({ ...input, dueOn: e.target.value })} /></label>
      <label>Estimated hours<input required type="number" step="0.25" min="0.25" max="80" value={input.estimatedHours} onChange={e => setInput({ ...input, estimatedHours: Number(e.target.value) })} /></label>
      <label className="sm:col-span-2">Service notes<textarea rows={3} maxLength={2000} value={input.description} onChange={e => setInput({ ...input, description: e.target.value })} /></label>
      <div className="flex gap-300 sm:col-span-2"><button className="action" disabled={pending || !input.title.trim() || !input.assetId}>{pending ? 'Saving...' : 'Save work order'}</button>
        <button type="button" className="secondary" disabled={pending} onClick={onCancel}>Cancel</button></div>
    </form>
  </section>;
}
