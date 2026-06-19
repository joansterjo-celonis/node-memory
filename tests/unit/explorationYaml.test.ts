import { describe, it, expect } from 'vitest';
import {
  toYaml,
  fromYaml,
  summarize,
  EXPLORATION_STATE_VERSION,
} from '@/assets/exploration/state/explorationYaml';
import type { ExplorationStateSnapshot } from '@/assets/exploration/state/useExplorationState';

const buildSnapshot = (): ExplorationStateSnapshot => ({
  nodes: [
    {
      id: 'node-start',
      parentId: null,
      type: 'SOURCE',
      title: 'Load',
      branchName: 'Main',
      isExpanded: true,
      params: { table: 'orders', ingestionMode: 'api', __files: [] },
    },
    {
      id: 'f1',
      parentId: 'node-start',
      type: 'FILTER',
      title: 'Region = NA',
      isExpanded: true,
      params: {
        filters: [
          { id: 'x', field: 'region', operator: 'equals', value: 'NA', mode: 'operator' },
        ],
      },
    },
    {
      id: 'a1',
      parentId: 'f1',
      type: 'AGGREGATE',
      title: 'By region',
      isExpanded: true,
      params: { fn: 'sum', metricField: 'revenue' },
    },
    {
      id: 'c1',
      parentId: 'a1',
      type: 'COMPONENT',
      title: 'Revenue KPI',
      isExpanded: true,
      params: {
        subtype: 'KPI',
        fn: 'sum',
        metricField: 'revenue',
        assistantStatus: 'idle',
      },
    },
  ],
  selectedNodeId: 'c1',
  renderMode: 'classic',
  branchSelectionByNodeId: {},
  entangledColors: {},
});

describe('explorationYaml', () => {
  it('round-trips a snapshot through YAML without losing structural data', () => {
    const snap = buildSnapshot();
    const yaml = toYaml(snap);
    expect(typeof yaml).toBe('string');
    expect(yaml.length).toBeGreaterThan(0);

    const parsed = fromYaml(yaml);
    expect(parsed).not.toBeNull();
    expect(parsed!.version).toBe(EXPLORATION_STATE_VERSION);
    expect(parsed!.nodes).toHaveLength(snap.nodes.length);
    expect(parsed!.selection.nodeId).toBe(snap.selectedNodeId);
    expect(parsed!.renderMode).toBe(snap.renderMode);
  });

  it('strips transient node fields (isExpanded, __files, assistant runtime)', () => {
    const snap = buildSnapshot();
    const parsed = fromYaml(toYaml(snap))!;
    const source = parsed.nodes.find((n) => n.id === 'node-start')!;
    const component = parsed.nodes.find((n) => n.id === 'c1')!;
    expect('isExpanded' in source).toBe(false);
    expect('__files' in source.params).toBe(false);
    expect('assistantStatus' in component.params).toBe(false);
  });

  it('preserves every supported node type', () => {
    const snap = buildSnapshot();
    const parsed = fromYaml(toYaml(snap))!;
    const types = new Set(parsed.nodes.map((n) => n.type));
    expect(types.has('SOURCE')).toBe(true);
    expect(types.has('FILTER')).toBe(true);
    expect(types.has('AGGREGATE')).toBe(true);
    expect(types.has('COMPONENT')).toBe(true);
  });

  it('preserves filter chips verbatim', () => {
    const snap = buildSnapshot();
    const parsed = fromYaml(toYaml(snap))!;
    const filterNode = parsed.nodes.find((n) => n.id === 'f1')!;
    expect(filterNode.params.filters).toEqual([
      { id: 'x', field: 'region', operator: 'equals', value: 'NA', mode: 'operator' },
    ]);
  });

  it('produces deterministic output (stable key order)', () => {
    const snap = buildSnapshot();
    const a = toYaml(snap);
    const b = toYaml(snap);
    expect(a).toBe(b);
  });

  it('summarize() reports referenced tables and counts', () => {
    const snap = buildSnapshot();
    const summary = summarize(fromYaml(toYaml(snap))!);
    expect(summary.nodeCount).toBe(4);
    expect(summary.referencedTables).toContain('orders');
  });

  it('fromYaml() returns null on malformed input', () => {
    expect(fromYaml('not: [valid yaml')).toBeNull();
    expect(fromYaml('')).toBeNull();
  });

  it('fromYaml() rejects unknown version numbers', () => {
    const bogus = 'version: 99\nnodes: []\n';
    expect(fromYaml(bogus)).toBeNull();
  });
});
