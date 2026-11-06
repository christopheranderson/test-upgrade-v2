import { describe, expect, it } from 'vitest';
import { calendarDate, errorMessage, money } from './operations';
import { parseStores } from '@/queries/store-performance';
import { nextStatus } from '@rayfin-app/shared';
describe('presentation contracts', () => {
  it('keeps date-only source values on the same UTC calendar date', () => {
    expect(calendarDate('2023-01-01T00:00:00.000')).toBe('Jan 1, 2023');
    expect(calendarDate('2026-11-05T00:00:00.000Z')).toBe('Nov 5, 2026');
    expect(money(232243.90999999997)).toBe('$232,243.91');
  });
  it('maps terminal states without offering another lifecycle action', () => {
    expect(nextStatus('planned')).toBe('dispatched');
    expect(nextStatus('dispatched')).toBe('in-progress');
    expect(nextStatus('in-progress')).toBe('completed');
    expect(nextStatus('completed')).toBeUndefined();
    expect(nextStatus('cancelled')).toBeUndefined();
  });
  it('does not expose raw provider errors', () => {
    expect(errorMessage(new Error('server=private;token=secret'))).not.toContain('secret');
    expect(errorMessage(new Error('Not enough stock. Reload inventory.'))).toBe('Not enough stock. Reload inventory.');
  });
  it('maps by verified column names, not response column order', () => {
    const names = ['[Units]', '[Transactions]', '[Revenue]', 'Coffee Shop Sales[store_location]', '[PeriodEnd]', '[PeriodStart]'];
    const stores = parseStores({ columns: names.map(name => ({ name })), rows: [[70991, 50599, 232243.91, 'Astoria', '2023-06-30', '2023-01-01']] });
    expect(stores[0]).toMatchObject({ location: 'Astoria', units: 70991, revenue: 232243.91 });
  });
  it('rejects missing columns and malformed numeric values', () => {
    expect(() => parseStores({ columns: [], rows: [] })).toThrow('unexpected column');
    const names = ['Coffee Shop Sales[store_location]', '[Revenue]', '[Transactions]', '[Units]', '[PeriodStart]', '[PeriodEnd]'];
    expect(() => parseStores({ columns: names.map(name => ({ name })), rows: [['Astoria', 'not numeric', 1, 1, '2023-01-01', '2023-06-30']] })).toThrow('unexpected value');
  });
});
