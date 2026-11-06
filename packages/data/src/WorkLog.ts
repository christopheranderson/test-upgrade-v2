import { authenticated, entity, uuid, text, date, one } from '@microsoft/rayfin-core';
import { WorkOrder } from './WorkOrder.js';
@entity()
@authenticated('*')
export class WorkLog {
  @uuid() id!: string;
  @uuid() workOrder_id!: string;
  @one(() => WorkOrder) workOrder!: WorkOrder;
  @text({ max: 1000 }) message!: string;
  @date() createdAt!: Date;
}
