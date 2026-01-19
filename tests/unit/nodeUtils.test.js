import { describe, expect, it } from 'vitest';
import { getChildren, getCalculationOrder, calculateMetric } from '../../src/utils/nodeUtils.js';

describe('node utils', () => {
  it('returns children and calculation order', () => {
    const nodes = [
      { id: 'root', parentId: null },
      { id: 'child-a', parentId: 'root' },
      { id: 'child-b', parentId: 'root' },
      { id: 'grand', parentId: 'child-a' }
    ];

    expect(getChildren(nodes, 'root').map(n => n.id)).toEqual(['child-a', 'child-b']);
    expect(getCalculationOrder(nodes).map(n => n.id)).toEqual(['root', 'child-a', 'child-b', 'grand']);
  });

  it('calculates metrics', () => {
    const data = [{ val: 2 }, { val: 2 }, { val: 5 }];
    expect(calculateMetric(data, 'val', 'count')).toBe(3);
    expect(calculateMetric(data, 'val', 'count_distinct')).toBe(2);
    expect(calculateMetric(data, 'val', 'sum')).toBe(9);
    expect(calculateMetric(data, 'val', 'avg')).toBe(3);
    expect(calculateMetric(data, 'val', 'min')).toBe(2);
    expect(calculateMetric(data, 'val', 'max')).toBe(5);
  });
});
