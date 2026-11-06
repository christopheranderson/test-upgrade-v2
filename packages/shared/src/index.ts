export type WorkStatus = 'planned' | 'dispatched' | 'in-progress' | 'completed' | 'cancelled';
export { collectPages, loadWorkspace } from './workspace.js';
export type { OperationsData } from './workspace.js';
export type Priority = 'routine' | 'high' | 'urgent';
export interface CustomerRecord {
  id: string; name: string; contact: string; email: string; serviceTier: string;
}
export interface SiteRecord {
  id: string; customer_id: string; name: string; address: string; modelLocation: string;
}
export interface AssetRecord {
  id: string; site_id: string; name: string; serialNumber: string; category: string; installedOn: string;
}
export interface TechnicianRecord {
  id: string; name: string; specialty: string; hourlyRate: number; active: boolean;
}
export interface WorkOrderRecord {
  id: string; asset_id: string; title: string; description: string;
  status: WorkStatus; priority: Priority; dueOn: string; estimatedHours: number;
  createdAt: string; updatedAt: string;
}
export interface AssignmentRecord {
  id: string; workOrder_id: string; technician_id: string; assignedAt: string;
}
export interface PartRecord {
  id: string; sku: string; name: string; unitCost: number; stock: number; reorderAt: number;
}
export interface PartUsageRecord {
  id: string; workOrder_id: string; part_id: string; quantity: number; unitCost: number;
}
export interface WorkLogRecord {
  id: string; workOrder_id: string; message: string; createdAt: string;
}
export type UniversalAppSchema = {
  Customer: CustomerRecord; Site: SiteRecord; Asset: AssetRecord; Technician: TechnicianRecord;
  WorkOrder: WorkOrderRecord; Assignment: AssignmentRecord; Part: PartRecord;
  PartUsage: PartUsageRecord; WorkLog: WorkLogRecord;
};
export interface WorkspaceData {
  customers: CustomerRecord[]; sites: SiteRecord[]; assets: AssetRecord[];
  technicians: TechnicianRecord[]; workOrders: WorkOrderRecord[];
  assignments: AssignmentRecord[]; parts: PartRecord[]; usages: PartUsageRecord[]; logs: WorkLogRecord[];
}
export interface WorkOrderInput {
  assetId: string; title: string; description: string; priority: Priority;
  dueOn: string; estimatedHours: number;
}
export interface ServiceReport {
  openOrders: number; completedOrders: number; estimatedLabor: number;
  partsCost: number; lowStockParts: number;
  calloutFees: number;
}
export const statusLabels: Record<WorkStatus, string> = {
  planned: 'Planned', dispatched: 'Dispatched', 'in-progress': 'In progress',
  completed: 'Completed', cancelled: 'Cancelled',
};
export function nextStatus(status: WorkStatus): WorkStatus | undefined {
  switch (status) {
    case 'planned': return 'dispatched';
    case 'dispatched': return 'in-progress';
    case 'in-progress': return 'completed';
    default: return undefined;
  }
}
