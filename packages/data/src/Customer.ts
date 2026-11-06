import { authenticated, entity, text, uuid, many } from '@microsoft/rayfin-core';
import { Site } from './Site.js';
@entity()
@authenticated('*')
export class Customer {
  @uuid() id!: string;
  @text({ max: 160 }) name!: string;
  @text({ max: 160 }) contact!: string;
  @text({ max: 200 }) email!: string;
  @text({ max: 40 }) serviceTier!: string;
  @many(() => Site) sites?: Site[];
}
