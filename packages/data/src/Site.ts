import { authenticated, entity, text, uuid, one, many } from '@microsoft/rayfin-core';
import { Customer } from './Customer.js';
import { Asset } from './Asset.js';
@entity()
@authenticated('*')
export class Site {
  @uuid() id!: string;
  @uuid() customer_id!: string;
  @one(() => Customer) customer!: Customer;
  @text({ max: 160 }) name!: string;
  @text({ max: 300 }) address!: string;
  @text({ max: 160 }) modelLocation!: string;
  @many(() => Asset) assets?: Asset[];
}
