import { authenticated, entity, uuid, one, date } from '@microsoft/rayfin-core';
import { WorkOrder } from './WorkOrder.js';
import { Technician } from './Technician.js';
@entity()
@authenticated('*')
export class Assignment {
  @uuid() id!: string;
  @uuid() workOrder_id!: string;
  @one(() => WorkOrder) workOrder!: WorkOrder;
  @uuid() technician_id!: string;
  @one(() => Technician) technician!: Technician;
  @date() assignedAt!: Date;
}
