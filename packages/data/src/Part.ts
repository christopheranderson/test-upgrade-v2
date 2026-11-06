import { authenticated, entity, text, uuid, decimal, int, many } from '@microsoft/rayfin-core';
import { PartUsage } from './PartUsage.js';
@entity()
@authenticated('*')
export class Part {
  @uuid() id!: string;
  @text({ max: 60 }) sku!: string;
  @text({ max: 160 }) name!: string;
  @decimal() unitCost!: number;
  @int() stock!: number;
  @int() reorderAt!: number;
  @many(() => PartUsage) usages?: PartUsage[];
}
