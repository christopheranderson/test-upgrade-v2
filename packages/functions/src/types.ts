/**
 * Function schema types for RayfinClient.
 *
 * AUTO-GENERATED — do not edit manually.
 * Re-generated automatically when function source files change.
 *
 * If this file is not updating automatically, run:
 *   rayfin dev functions apply
 *
 * The schema is a closed object type: only the function names listed
 * below are accepted by RayfinClient.functions.<name>.invoke(...).
 * Adding, renaming, or changing the signature of a udf.func() call
 * regenerates this file and surfaces type errors at every consumer.
 *
 * IMPORTANT: This file must NOT import any Node.js packages — it is
 * resolved by the frontend app's TypeScript compiler.
 */

export type AppFunctionsSchema = {
  seedWorkspace: {
    input: Record<string, never>;
    output: { added: number };
  };
  saveWorkOrder: {
    input: { id: string; input: { assetId: string; title: string; description: string; priority: 'routine' | 'high' | 'urgent'; dueOn: string; estimatedHours: number } };
    output: { id: string; asset_id: string; title: string; description: string; status: 'planned' | 'dispatched' | 'in-progress' | 'completed' | 'cancelled'; priority: 'routine' | 'high' | 'urgent'; dueOn: string; estimatedHours: number; createdAt: string; updatedAt: string };
  };
  advanceWorkOrder: {
    input: { id: string; expected: string; target: string };
    output: { status: string };
  };
  assignTechnician: {
    input: { workOrderId: string; technicianId: string };
    output: { assigned: boolean };
  };
  usePart: {
    input: { workOrderId: string; partId: string; quantity: number };
    output: { reserved: number };
  };
  deleteWorkOrder: {
    input: { id: string };
    output: { deleted: boolean };
  };
  getServiceReport: {
    input: { siteId: string };
    output: { openOrders: number; completedOrders: number; estimatedLabor: number; partsCost: number; lowStockParts: number; calloutFees: number };
  };
};
