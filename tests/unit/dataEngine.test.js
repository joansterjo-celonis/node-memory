import { describe, expect, it } from 'vitest';
import { createDataEngine } from '../../src/utils/dataEngine.js';

describe('data engine', () => {
  const dataModel = {
    tables: {
      orders: [
        { id: '1', region: 'West', amount: 10 },
        { id: '2', region: 'East', amount: 20 },
        { id: '3', region: 'West', amount: 5 }
      ],
      customers: [
        { customer_id: '1', name: 'A' },
        { customer_id: '3', name: 'C' }
      ]
    },
    order: ['orders', 'customers']
  };

  it('filters, aggregates, sorts, and joins rows', () => {
    const engine = createDataEngine(dataModel);
    engine.ensureQuery('source', { type: 'SOURCE', table: 'orders' });

    const parentKey = engine.getQueryKey('source');
    engine.ensureQuery('filter', {
      type: 'FILTER',
      parentId: 'source',
      parentKey,
      params: { field: 'region', operator: 'equals', value: 'West' }
    });

    expect(engine.getRowCount('filter')).toBe(2);
    const filtered = engine.getRows('filter', { start: 0, size: 2 });
    expect(filtered.map((row) => row.region)).toEqual(['West', 'West']);

    engine.ensureQuery('aggregate', {
      type: 'AGGREGATE',
      parentId: 'source',
      parentKey,
      params: { groupBy: 'region', fn: 'sum', metricField: 'amount' }
    });
    const aggregates = engine.getRows('aggregate', { start: 0, size: 10 });
    expect(aggregates).toEqual(expect.arrayContaining([
      { region: 'West', amount: 15 },
      { region: 'East', amount: 20 }
    ]));

    const sorted = engine.getRows('source', { start: 0, size: 3, sortBy: 'amount', sortDirection: 'desc' });
    expect(sorted[0].amount).toBe(20);

    engine.ensureQuery('join', {
      type: 'JOIN',
      parentId: 'source',
      parentKey,
      params: {
        rightTable: 'customers',
        leftKey: 'id',
        rightKey: 'customer_id',
        joinType: 'LEFT'
      }
    });
    const joined = engine.getRows('join', { start: 0, size: 3 });
    expect(joined[0]).toHaveProperty('customers_name');
  });

  it('applies multiple filters in a single node', () => {
    const engine = createDataEngine(dataModel);
    engine.ensureQuery('source', { type: 'SOURCE', table: 'orders' });

    const parentKey = engine.getQueryKey('source');
    engine.ensureQuery('filter-multi', {
      type: 'FILTER',
      parentId: 'source',
      parentKey,
      params: {
        filters: [
          { field: 'region', operator: 'equals', value: 'West' },
          { field: 'amount', operator: 'gt', value: 6 }
        ]
      }
    });

    expect(engine.getRowCount('filter-multi')).toBe(1);
    const rows = engine.getRows('filter-multi', { start: 0, size: 2 });
    expect(rows.map((row) => row.id)).toEqual(['1']);
  });
});
