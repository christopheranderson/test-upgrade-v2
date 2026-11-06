import { authenticated, entity, text, uuid, one, many, date, decimal } from '@microsoft/rayfin-core';
import { Asset } from './Asset.js';
import { Assignment } from './Assignment.js';
import { PartUsage } from './PartUsage.js';
import { WorkLog } from './WorkLog.js';
@entity()
@authenticated('*')
export class WorkOrder {
  @uuid() id!: string;
  @uuid() asset_id!: string;
  @one(() => Asset) asset!: Asset;
  @text({ max: 200 }) title!: string;
  @text({ max: 2000 }) description!: string;
  @text({ max: 30 }) status!: string;
  @text({ max: 20 }) priority!: string;
  @date() dueOn!: Date;
  @decimal() estimatedHours!: number;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
  @many(() => Assignment) assignments?: Assignment[];
  @many(() => PartUsage) usages?: PartUsage[];
  @many(() => WorkLog) logs?: WorkLog[];
}
