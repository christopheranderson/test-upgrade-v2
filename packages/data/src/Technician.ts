import { authenticated, entity, text, uuid, decimal, boolean, many } from '@microsoft/rayfin-core';
import { Assignment } from './Assignment.js';
@entity()
@authenticated('*')
export class Technician {
  @uuid() id!: string;
  @text({ max: 160 }) name!: string;
  @text({ max: 120 }) specialty!: string;
  @decimal() hourlyRate!: number;
  @boolean() active!: boolean;
  @many(() => Assignment) assignments?: Assignment[];
}
