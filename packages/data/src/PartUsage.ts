import { authenticated, entity, uuid, int, decimal, one } from '@microsoft/rayfin-core';
import { Part } from './Part.js';
import { WorkOrder } from './WorkOrder.js';
@entity()
@authenticated('*')
export class PartUsage {
  @uuid() id!: string;
  @uuid() workOrder_id!: string;
  @one(() => WorkOrder) workOrder!: WorkOrder;
  @uuid() part_id!: string;
  @one(() => Part) part!: Part;
  @int() quantity!: number;
  @decimal() unitCost!: number;
}
