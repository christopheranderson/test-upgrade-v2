import query from './store-performance.dax?raw';
export function storePerformance() {
  return { connection: 'coffeesales', query };
}
export interface StorePerformance {
  location: string; revenue: number; transactions: number; units: number;
  periodStart: string; periodEnd: string;
}
export function parseStores(table: { columns: { name: string }[]; rows: unknown[][] }): StorePerformance[] {
  const index = (name: string) => {
    const position = table.columns.findIndex(column => column.name === name);
    if (position === -1) throw new Error('The sales model returned an unexpected column. Check the source schema.');
    return position;
  };
  const fields = ['Coffee Shop Sales[store_location]', '[Revenue]', '[Transactions]', '[Units]', '[PeriodStart]', '[PeriodEnd]'].map(index);
  return table.rows.map(row => {
    const [location, revenue, transactions, units, periodStart, periodEnd] = fields.map(i => row[i]);
    if (typeof location !== 'string' || typeof revenue !== 'number' || !Number.isFinite(revenue) ||
      typeof transactions !== 'number' || typeof units !== 'number' ||
      typeof periodStart !== 'string' || typeof periodEnd !== 'string') {
      throw new Error('The sales model returned an unexpected value. Check the source data.');
    }
    return { location, revenue, transactions, units, periodStart, periodEnd };
  });
}
