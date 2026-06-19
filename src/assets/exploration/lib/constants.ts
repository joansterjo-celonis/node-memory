// Pruned subset of src/app/constants.ts for the Exploration asset.
// Session storage, exploration CRUD, ingestion-mode and landing-view
// constants are intentionally left behind in the host app.

import { getChildren } from './nodeUtils';
import { SQL_INCOMING_TABLE } from './dataEngine';

export const DEFAULT_TABLE_DENSITY = 'comfortable' as const;
export const DEFAULT_ENTANGLED_COLOR = '#facc15';

export const ASSET_TYPES = {
  EXPLORATION: 'exploration',
} as const;

export const VALID_RENDER_MODES = new Set([
  'classic',
  'classicSmart',
  'entangledSmart',
  'entangled',
  'singleStream',
  'freeLayout',
  'mobile',
]);

export type RenderMode =
  | 'classic'
  | 'classicSmart'
  | 'entangled'
  | 'entangledSmart'
  | 'singleStream'
  | 'freeLayout'
  | 'mobile';

export const MOBILE_UA_REGEX = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|BlackBerry|IEMobile|Opera Mini|webOS/i;

export const isMobileUserAgent = () => {
  if (typeof navigator === 'undefined') return false;
  if ((navigator as any).userAgentData?.mobile) return true;
  return MOBILE_UA_REGEX.test(navigator.userAgent || '');
};

export const slugifySqlName = (value: any) => {
  const raw = typeof value === 'string' ? value : String(value || '');
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return cleaned || 'table';
};

export const ensureUniqueSqlName = (base: string, used: Set<string>) => {
  let next = base;
  let suffix = 1;
  while (used.has(next) || next === SQL_INCOMING_TABLE) {
    suffix += 1;
    next = `${base}_${suffix}`;
  }
  used.add(next);
  return next;
};

export const escapeRegExp = (value: any) =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const buildStableExternalTableName = (explorationId: string, nodeId: string) =>
  slugifySqlName(`exp_${explorationId}_${nodeId}`);

export const buildLegacyExternalTableName = (
  explorationName: string,
  branchLabel: string,
  usedNames?: Set<string>
) => {
  const base = slugifySqlName(`exp_${explorationName}_${branchLabel}`);
  if (!usedNames) return base;
  return ensureUniqueSqlName(base, usedNames);
};

export const getLeafNodes = (nodesList: any[] = []) =>
  nodesList.filter((node) => getChildren(nodesList, node.id).length === 0);

export const getDefaultStatsPanelRect = () => {
  const fallback = { x: 64, y: 96, width: 320, height: 520 };
  if (typeof window === 'undefined') return fallback;
  const width = fallback.width;
  const height = fallback.height;
  const x = Math.max(16, window.innerWidth - width - 32);
  const y = fallback.y;
  return { x, y, width, height };
};

export const isValidStatsPanelRect = (
  rect: any
): rect is { x: number; y: number; width: number; height: number } =>
  rect &&
  Number.isFinite(rect.x) &&
  Number.isFinite(rect.y) &&
  Number.isFinite(rect.width) &&
  Number.isFinite(rect.height);

export const createInitialNodes = () => ([
  {
    id: 'node-start',
    parentId: null,
    type: 'SOURCE',
    title: 'Load Raw Data',
    description: 'Select dataset',
    branchName: 'Main',
    isExpanded: true,
    params: {
      table: null as string | null,
      ingestionMode: 'api',
      inheritedTable: '',
    },
  },
]);

export const buildDefaultFreeLayout = (nodesToLayout: any[]) => {
  const positions: Record<string, { x: number; y: number }> = {};
  const childrenByParent = new Map<string | null, any[]>();
  nodesToLayout.forEach((node) => {
    const list = childrenByParent.get(node.parentId) || [];
    list.push(node);
    childrenByParent.set(node.parentId, list);
  });

  const columnGap = 720;
  const rowGap = 380;
  const offset = { x: 80, y: 80 };
  let leafIndex = 0;

  const assign = (nodeId: string, depth: number): number => {
    const children = childrenByParent.get(nodeId) || [];
    if (children.length === 0) {
      const y = leafIndex * rowGap;
      positions[nodeId] = { x: depth * columnGap, y };
      leafIndex += 1;
      return y;
    }
    const childYs = children.map((child) => assign(child.id, depth + 1));
    const y = childYs.reduce((sum, value) => sum + value, 0) / childYs.length;
    positions[nodeId] = { x: depth * columnGap, y };
    return y;
  };

  const roots = nodesToLayout.filter((node) => node.parentId === null);
  roots.forEach((root) => assign(root.id, 0));

  Object.keys(positions).forEach((id) => {
    positions[id] = {
      x: positions[id].x + offset.x,
      y: positions[id].y + offset.y,
    };
  });

  return positions;
};

// Default params for newly-created nodes (mirrors AnalysisApp.tsx#getDefaultParams).
export const getDefaultParams = (subtype?: string) => ({
  subtype,
  operator: 'equals',
  fn: 'count',
  chartType: 'bar',
  chartAggFn: 'sum',
  chartBarGap: 0.2,
  chartColor: '#2563eb',
  chartOrientation: 'vertical',
  chartShowGrid: true,
  chartShowTooltip: true,
  chartShowPoints: false,
  chartStacked: false,
  chartCurve: 'linear',
  tableSortBy: '',
  tableSortDirection: '',
  tableShowStats: false,
  target: 100,
  joinType: 'LEFT',
  sqlMode: 'visual',
  sqlText: '',
  metrics: [] as any[],
  pivotRow: '',
  pivotColumn: '',
  pivotValue: '',
  pivotFn: 'count',
  assistantQuestion: '',
  assistantUseLLM: false,
  assistantStatus: 'idle',
  assistantSummary: '',
  assistantError: '',
  assistantLlmError: '',
  assistantPlan: [] as any[],
  ingestionMode: 'api',
  inheritedTable: '',
  isDataset: false,
  datasetName: '',
  isFlattened: false,
  datasetSnapshot: null as any,
});

export const COMPONENT_TITLE_BY_SUBTYPE: Record<string, string> = {
  TABLE: 'Table',
  PIVOT: 'Pivot Table',
  AI: 'AI Assistant',
  CHART: 'Chart',
  KPI: 'KPI',
  GAUGE: 'Gauge',
};

export const DEFAULT_NODE_TITLE_BY_TYPE: Record<string, string> = {
  FILTER: 'Filter Data',
  AGGREGATE: 'Aggregate',
  JOIN: 'SQL',
};

export const getComponentTitle = (subtype?: string) => {
  if (!subtype) return 'Component';
  const key = String(subtype).toUpperCase();
  return COMPONENT_TITLE_BY_SUBTYPE[key] || `${key} View`;
};

export const getDefaultNodeTitle = (type: string, subtype?: string) => {
  if (!type) return 'New Step';
  const key = String(type).toUpperCase();
  if (key === 'COMPONENT') return getComponentTitle(subtype);
  return DEFAULT_NODE_TITLE_BY_TYPE[key] || 'New Step';
};
