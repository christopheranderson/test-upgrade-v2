import { authenticated, entity, text, uuid, one, many, date } from '@microsoft/rayfin-core';
import { Site } from './Site.js';
import { WorkOrder } from './WorkOrder.js';
@entity()
@authenticated('*')
export class Asset {
  @uuid() id!: string;
  @uuid() site_id!: string;
  @one(() => Site) site!: Site;
  @text({ max: 160 }) name!: string;
  @text({ max: 80 }) serialNumber!: string;
  @text({ max: 80 }) category!: string;
  @date() installedOn!: Date;
  @many(() => WorkOrder) workOrders?: WorkOrder[];
}
