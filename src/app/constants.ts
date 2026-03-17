import { getChildren } from '../utils/nodeUtils';
import { SQL_INCOMING_TABLE } from '../utils/dataEngine';

export const TABLE_DENSITY_STORAGE_KEY = 'nma-table-density';
export const DEFAULT_TABLE_DENSITY = 'comfortable';
export const DEFAULT_ENTANGLED_COLOR = '#facc15';
export const DEFAULT_INGESTION_MODE = 'manual';
export const DEFAULT_SQL_MODE = 'visual';
export const ASSET_TYPES = {
  EXPLORATION: 'exploration',
  RAW_DATASET: 'rawDataset',
  SQL: 'sql'
} as const;
export const VALID_ASSET_TYPES = new Set(Object.values(ASSET_TYPES));

export function normalizeExplorationName(value: any, fallback = 'Exploration') {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || fallback;
}

export function resolveAssetFallbackName(assetType: string) {
  if (assetType === ASSET_TYPES.RAW_DATASET) return 'Raw dataset';
  if (assetType === ASSET_TYPES.SQL) return 'SQL transformation';
  return 'Exploration';
}

export function resolveAssetType(asset: any) {
  return VALID_ASSET_TYPES.has(asset?.assetType) ? asset.assetType : ASSET_TYPES.EXPLORATION;
}

export const SESSION_STORAGE_KEY = 'nma-session-v1';
export const SESSION_VERSION = 1;
export const VALID_VIEW_MODES = new Set(['canvas', 'landing']);
export const VALID_LANDING_VIEW_MODES = new Set(['cards', 'graph']);
export const VALID_RENDER_MODES = new Set([
  'classic',
  'classicSmart',
  'entangledSmart',
  'entangled',
  'singleStream',
  'freeLayout',
  'mobile'
]);
export const MOBILE_UA_REGEX = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|BlackBerry|IEMobile|Opera Mini|webOS/i;

export const isMobileUserAgent = () => {
  if (typeof navigator === 'undefined') return false;
  if ((navigator as any).userAgentData?.mobile) return true;
  return MOBILE_UA_REGEX.test(navigator.userAgent || '');
};

export const readStoredTableDensity = () => {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_TABLE_DENSITY;
  try {
    const raw = window.localStorage.getItem(TABLE_DENSITY_STORAGE_KEY);
    if (raw === 'dense' || raw === 'comfortable') return raw;
  } catch {
    // Ignore storage errors.
  }
  return DEFAULT_TABLE_DENSITY;
};

export const sanitizeNodesForStorage = (nodesToSave: any[] = []) => {
  if (!Array.isArray(nodesToSave)) return [];
  return nodesToSave.map((node) => {
    if (!node || typeof node !== 'object') return node;
    if (node.type !== 'SOURCE') return node;
    const params = node.params || {};
    if (!Object.prototype.hasOwnProperty.call(params, '__files')) return node;
    return { ...node, params: { ...params, __files: [] } };
  });
};

export const sanitizeHistoryForStorage = (historyToSave: any[][] = []) => {
  if (!Array.isArray(historyToSave)) return [];
  return historyToSave
    .filter((entry) => Array.isArray(entry))
    .map((entry) => sanitizeNodesForStorage(entry));
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

export const escapeRegExp = (value: any) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const buildStableExternalTableName = (explorationId: string, nodeId: string) => (
  slugifySqlName(`exp_${explorationId}_${nodeId}`)
);

export const buildLegacyExternalTableName = (explorationName: string, branchLabel: string, usedNames?: Set<string>) => {
  const base = slugifySqlName(`exp_${explorationName}_${branchLabel}`);
  if (!usedNames) return base;
  return ensureUniqueSqlName(base, usedNames);
};

export const getLeafNodes = (nodesList: any[] = []) => nodesList.filter(
  (node) => getChildren(nodesList, node.id).length === 0
);

export const getDefaultStatsPanelRect = () => {
  const fallback = { x: 64, y: 96, width: 320, height: 520 };
  if (typeof window === 'undefined') return fallback;
  const width = fallback.width;
  const height = fallback.height;
  const x = Math.max(16, window.innerWidth - width - 32);
  const y = fallback.y;
  return { x, y, width, height };
};

export const isValidStatsPanelRect = (rect: any): rect is { x: number; y: number; width: number; height: number } => (
  rect
  && Number.isFinite(rect.x)
  && Number.isFinite(rect.y)
  && Number.isFinite(rect.width)
  && Number.isFinite(rect.height)
);

export const createInitialNodes = () => ([
  {
    id: 'node-start',
    parentId: null,
    type: 'SOURCE',
    title: 'Load Raw Data',
    description: 'Upload dataset',
    branchName: 'Main',
    isExpanded: true,
    params: {
      table: null,
      __files: [] as File[],
      ingestionMode: DEFAULT_INGESTION_MODE,
      inheritedTable: ''
    }
  }
]);

export const createInitialSqlNodes = () => ([
  {
    id: 'node-start',
    parentId: null,
    type: 'SOURCE',
    title: 'Select Input',
    description: 'Choose a dataset to transform',
    branchName: 'Main',
    isExpanded: true,
    params: {
      table: null,
      __files: [] as File[],
      ingestionMode: 'inherited',
      inheritedTable: ''
    }
  },
  {
    id: 'node-sql',
    parentId: 'node-start',
    type: 'JOIN',
    title: 'SQL Transformation',
    description: 'Write custom SQL to transform the data',
    branchName: 'Main',
    isExpanded: true,
    params: {
      sqlMode: 'custom',
      sqlText: '',
      joinType: 'LEFT',
      leftKey: '',
      rightKey: '',
      rightTable: ''
    }
  }
]);

export const readSessionState = () => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== SESSION_VERSION) return null;

    const history = Array.isArray(parsed.history)
      ? sanitizeHistoryForStorage(parsed.history)
      : [];
    const resolvedHistory = history.length ? history : [createInitialNodes()];
    const historyIndex = Number.isFinite(parsed.historyIndex)
      ? Math.max(0, Math.min(parsed.historyIndex, resolvedHistory.length - 1))
      : 0;
    const activeNodes = Array.isArray(resolvedHistory[historyIndex])
      ? resolvedHistory[historyIndex]
      : (resolvedHistory[0] || []);
    const selectedNodeId = typeof parsed.selectedNodeId === 'string'
      && activeNodes.some((node: any) => node.id === parsed.selectedNodeId)
      ? parsed.selectedNodeId
      : (activeNodes[0]?.id || 'node-start');

    const viewMode = VALID_VIEW_MODES.has(parsed.viewMode) ? parsed.viewMode : 'canvas';
    const renderMode = VALID_RENDER_MODES.has(parsed.renderMode) ? parsed.renderMode : 'classic';
    const landingViewMode = VALID_LANDING_VIEW_MODES.has(parsed.landingViewMode)
      ? parsed.landingViewMode
      : 'cards';
    const activeAssetType = VALID_ASSET_TYPES.has(parsed.activeAssetType)
      ? parsed.activeAssetType
      : ASSET_TYPES.EXPLORATION;
    const dataModel = parsed.dataModel
      && typeof parsed.dataModel === 'object'
      && parsed.dataModel.tables
      && Array.isArray(parsed.dataModel.order)
      ? parsed.dataModel
      : { tables: {}, order: [] };

    return {
      history: resolvedHistory,
      historyIndex,
      selectedNodeId,
      dataModel,
      rawDataName: typeof parsed.rawDataName === 'string' ? parsed.rawDataName : null,
      viewMode,
      renderMode,
      landingViewMode,
      dataModelSorts: parsed.dataModelSorts && typeof parsed.dataModelSorts === 'object' ? parsed.dataModelSorts : {},
      branchSelectionByNodeId: parsed.branchSelectionByNodeId && typeof parsed.branchSelectionByNodeId === 'object'
        ? parsed.branchSelectionByNodeId
        : {},
      isStatsCollapsed: parsed.isStatsCollapsed === true,
      isStatsDetached: parsed.isStatsDetached === true,
      statsPanelRect: isValidStatsPanelRect(parsed.statsPanelRect)
        ? parsed.statsPanelRect
        : getDefaultStatsPanelRect(),
      isPropertiesCollapsed: parsed.isPropertiesCollapsed === true,
      showDataModel: parsed.showDataModel === true,
      activeExplorationId: typeof parsed.activeExplorationId === 'string' ? parsed.activeExplorationId : null,
      activeAssetType
    };
  } catch {
    return null;
  }
};

export const writeSessionState = (snapshot: any) => {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (err) {
    console.warn('Unable to persist session state.', err);
    return false;
  }
};

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
    const childYs = children.map(child => assign(child.id, depth + 1));
    const y = childYs.reduce((sum, value) => sum + value, 0) / childYs.length;
    positions[nodeId] = { x: depth * columnGap, y };
    return y;
  };

  const roots = nodesToLayout.filter(node => node.parentId === null);
  roots.forEach(root => assign(root.id, 0));

  Object.keys(positions).forEach((id) => {
    positions[id] = {
      x: positions[id].x + offset.x,
      y: positions[id].y + offset.y
    };
  });

  return positions;
};
