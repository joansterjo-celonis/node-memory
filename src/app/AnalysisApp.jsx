// src/app/AnalysisApp.js
// Main application component: ingestion, history, engine, and layout.
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Button, Card, Dropdown, Empty, Modal, Space, Tag, Typography } from 'antd';
import { ColumnStatsPanel } from '../components/ColumnStatsPanel';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { TreeNode, FreeLayoutCanvas } from '../components/TreeNode';
import { Layout, Database, AppsIcon, Settings, Undo, Redo, TableIcon, X, Plus, Trash2, Play, Save } from '../ui/icons';
import { parseCSVFile, readFileAsArrayBuffer, parseXLSX, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../utils/ingest';
import { getChildren, getCalculationOrder, getNodeResult } from '../utils/nodeUtils';
import { createDataEngine } from '../utils/dataEngine';
import { normalizeFilters } from '../utils/filterUtils';

const { Title, Text } = Typography;

const createInitialNodes = () => ([
  {
    id: 'node-start',
    parentId: null,
    type: 'SOURCE',
    title: 'Load Raw Data',
    description: 'Upload dataset',
    branchName: 'Main',
    isExpanded: true,
    params: { table: null, __files: [] }
  }
]);

const TABLE_DENSITY_STORAGE_KEY = 'nma-table-density';
const DEFAULT_TABLE_DENSITY = 'comfortable';
const DEFAULT_ENTANGLED_COLOR = '#facc15';
const SESSION_STORAGE_KEY = 'nma-session-v1';
const SESSION_VERSION = 1;
const VALID_VIEW_MODES = new Set(['canvas', 'landing']);
const VALID_RENDER_MODES = new Set(['classic', 'entangled', 'singleStream', 'freeLayout']);
const readStoredTableDensity = () => {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_TABLE_DENSITY;
  try {
    const raw = window.localStorage.getItem(TABLE_DENSITY_STORAGE_KEY);
    if (raw === 'dense' || raw === 'comfortable') return raw;
  } catch (err) {
    // Ignore storage errors.
  }
  return DEFAULT_TABLE_DENSITY;
};

const sanitizeNodesForStorage = (nodesToSave = []) => {
  if (!Array.isArray(nodesToSave)) return [];
  return nodesToSave.map((node) => {
    if (!node || typeof node !== 'object') return node;
    if (node.type !== 'SOURCE') return node;
    const params = node.params || {};
    if (!Object.prototype.hasOwnProperty.call(params, '__files')) return node;
    return { ...node, params: { ...params, __files: [] } };
  });
};

const sanitizeHistoryForStorage = (historyToSave = []) => {
  if (!Array.isArray(historyToSave)) return [];
  return historyToSave
    .filter((entry) => Array.isArray(entry))
    .map((entry) => sanitizeNodesForStorage(entry));
};

const getDefaultStatsPanelRect = () => {
  const fallback = { x: 64, y: 96, width: 320, height: 520 };
  if (typeof window === 'undefined') return fallback;
  const width = fallback.width;
  const height = fallback.height;
  const x = Math.max(16, window.innerWidth - width - 32);
  const y = fallback.y;
  return { x, y, width, height };
};

const isValidStatsPanelRect = (rect) => (
  rect
  && Number.isFinite(rect.x)
  && Number.isFinite(rect.y)
  && Number.isFinite(rect.width)
  && Number.isFinite(rect.height)
);

const readSessionState = () => {
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
      && activeNodes.some((node) => node.id === parsed.selectedNodeId)
      ? parsed.selectedNodeId
      : (activeNodes[0]?.id || 'node-start');

    const viewMode = VALID_VIEW_MODES.has(parsed.viewMode) ? parsed.viewMode : 'canvas';
    const renderMode = VALID_RENDER_MODES.has(parsed.renderMode) ? parsed.renderMode : 'classic';
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
      activeExplorationId: typeof parsed.activeExplorationId === 'string' ? parsed.activeExplorationId : null
    };
  } catch (err) {
    return null;
  }
};

const writeSessionState = (snapshot) => {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (err) {
    console.warn('Unable to persist session state.', err);
    return false;
  }
};

const buildDefaultFreeLayout = (nodesToLayout) => {
  const positions = {};
  const childrenByParent = new Map();
  nodesToLayout.forEach((node) => {
    const list = childrenByParent.get(node.parentId) || [];
    list.push(node);
    childrenByParent.set(node.parentId, list);
  });

  const columnGap = 720;
  const rowGap = 380;
  const offset = { x: 80, y: 80 };
  let leafIndex = 0;

  const assign = (nodeId, depth) => {
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

const AnalysisApp = ({ themePreference = 'auto', onThemeChange }) => {
  const initialSession = useMemo(() => readSessionState(), []);
  const initialHistory = initialSession?.history ?? [createInitialNodes()];
  const initialHistoryIndex = initialSession?.historyIndex ?? 0;
  const initialNodes = Array.isArray(initialHistory[initialHistoryIndex])
    ? initialHistory[initialHistoryIndex]
    : (initialHistory[0] || []);
  const initialSelectedNodeId = initialSession?.selectedNodeId ?? (initialNodes[0]?.id || 'node-start');
  const initialStatsPanelRect = initialSession?.statsPanelRect ?? getDefaultStatsPanelRect();
  // -------------------------------------------------------------------
  // Ingestion state
  // -------------------------------------------------------------------
  const [dataModel, setDataModel] = useState(initialSession?.dataModel ?? { tables: {}, order: [] });
  const [rawDataName, setRawDataName] = useState(initialSession?.rawDataName ?? null);
  const [loadError, setLoadError] = useState(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);

  const getTotalFileBytes = (files = []) =>
    files.reduce((sum, file) => sum + (file?.size || 0), 0);
  const findOversizeFile = (files = []) =>
    files.find((file) => (file?.size || 0) > MAX_UPLOAD_BYTES);

  // -------------------------------------------------------------------
  // History state (undo / redo)
  // -------------------------------------------------------------------
  const [history, setHistory] = useState(initialHistory);
  const [historyIndex, setHistoryIndex] = useState(initialHistoryIndex);
  const safeHistoryIndex = Math.max(0, Math.min(historyIndex, history.length - 1));
  const nodes = Array.isArray(history[safeHistoryIndex]) ? history[safeHistoryIndex] : [];

  const [selectedNodeId, setSelectedNodeId] = useState(initialSelectedNodeId);
  const [showAddMenuForId, setShowAddMenuForId] = useState(null);
  const [showInsertMenuForId, setShowInsertMenuForId] = useState(null);
  const [showDataModel, setShowDataModel] = useState(initialSession?.showDataModel ?? false);
  const [viewMode, setViewMode] = useState(initialSession?.viewMode ?? 'canvas');
  const [renderMode, setRenderMode] = useState(initialSession?.renderMode ?? 'classic');
  const [dataModelSorts, setDataModelSorts] = useState(initialSession?.dataModelSorts ?? {});
  const [explorations, setExplorations] = useState([]);
  const [activeExplorationId, setActiveExplorationId] = useState(initialSession?.activeExplorationId ?? null);
  const [saveError, setSaveError] = useState(null);
  const [tableDensity, setTableDensity] = useState(readStoredTableDensity);
  const [isStatsCollapsed, setIsStatsCollapsed] = useState(initialSession?.isStatsCollapsed ?? false);
  const [isStatsDetached, setIsStatsDetached] = useState(initialSession?.isStatsDetached ?? false);
  const [statsPanelRect, setStatsPanelRect] = useState(initialStatsPanelRect);
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(initialSession?.isPropertiesCollapsed ?? false);
  const [branchSelectionByNodeId, setBranchSelectionByNodeId] = useState(initialSession?.branchSelectionByNodeId ?? {});
  const [activeFilterTarget, setActiveFilterTarget] = useState(null);
  const statsDragStateRef = useRef(null);
  const statsDragFrameRef = useRef(null);
  const statsResizeStateRef = useRef(null);
  const statsResizeFrameRef = useRef(null);
  const nodeIdCounterRef = useRef(0);
  const filterIdCounterRef = useRef(0);

  const createNodeId = useCallback(() => `node-${Date.now()}-${nodeIdCounterRef.current++}`, []);
  const createFilterId = useCallback(() => `filter-${Date.now()}-${filterIdCounterRef.current++}`, []);

  useEffect(() => {
    if (!activeFilterTarget) return;
    if (activeFilterTarget.nodeId !== selectedNodeId) {
      setActiveFilterTarget(null);
    }
  }, [activeFilterTarget, selectedNodeId]);

  useEffect(() => {
    if (historyIndex !== safeHistoryIndex) {
      setHistoryIndex(safeHistoryIndex);
    }
  }, [historyIndex, safeHistoryIndex]);

  // -------------------------------------------------------------------
  // File ingestion pipeline (triggered by explicit "Ingest Data" button)
  // -------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!selectedFiles || selectedFiles.length === 0) {
        setIsLoadingFile(false);
        return;
      }

      setLoadError(null);
      setIsLoadingFile(true);

      try {
        // Allow UI to render progress state
        await new Promise(resolve => setTimeout(resolve, 50));

        const oversizeFile = findOversizeFile(selectedFiles);
        if (oversizeFile) {
          throw new Error(`${oversizeFile.name || 'A file'} exceeds the ${MAX_UPLOAD_MB} MB per-file limit.`);
        }
        const totalBytes = getTotalFileBytes(selectedFiles);
        if (totalBytes > MAX_UPLOAD_BYTES) {
          throw new Error(`Total upload size exceeds ${MAX_UPLOAD_MB} MB limit.`);
        }

        const tables = {};
        const order = [];
        const fileNames = [];

        const addTable = (name, rows) => {
          const base = name || 'data';
          let finalName = base;
          let suffix = 2;
          while (tables[finalName]) {
            finalName = `${base} (${suffix++})`;
          }
          tables[finalName] = rows;
          order.push(finalName);
        };

        for (const file of selectedFiles) {
          const name = file.name || 'Uploaded file';
          const lower = name.toLowerCase();
          const baseName = name.replace(/\.(csv|xlsx|xls)$/i, '') || 'data';
          fileNames.push(name);

          if ((file?.size || 0) > MAX_UPLOAD_BYTES) {
            throw new Error(`${name} exceeds the ${MAX_UPLOAD_MB} MB per-file limit.`);
          }

          if (lower.endsWith('.csv')) {
            const rows = await parseCSVFile(file);
            if (!rows || rows.length === 0) throw new Error(`No rows found in ${name}.`);
            addTable(baseName, rows);
          } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
            if (!window.XLSX) throw new Error('Excel parsing library failed to load. Please refresh and try again.');
            const buf = await readFileAsArrayBuffer(file);
            const workbookTables = parseXLSX(buf);
            const hasRows = Object.values(workbookTables).some(arr => Array.isArray(arr) && arr.length > 0);
            if (!hasRows) throw new Error(`No rows found in ${name}.`);
            Object.entries(workbookTables).forEach(([sheetName, rows]) => {
              if (!Array.isArray(rows) || rows.length === 0) return;
              addTable(`${baseName}:${sheetName}`, rows);
            });
          } else {
            throw new Error('Unsupported file type. Please upload CSV or XLSX.');
          }
        }

        if (!order.length) {
          throw new Error('No rows found in the uploaded files.');
        }

        if (!cancelled) {
          const model = { tables, order };
          setDataModel(model);
          setDataModelSorts({});
          setRawDataName(fileNames.length === 1 ? fileNames[0] : `${fileNames.length} files`);

          // If SOURCE node has no table selected, set default silently.
          const defaultTable = model.order[0] || null;
          if (defaultTable) {
            updateNode('node-start', { ...nodes.find(n => n.id === 'node-start').params, table: defaultTable }, false, true);
          }
        }
      } catch (err) {
        if (!cancelled) setLoadError(err?.message || String(err));
      } finally {
        if (!cancelled) setIsLoadingFile(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [selectedFiles]);

  // -------------------------------------------------------------------
  // History helpers
  // -------------------------------------------------------------------
  const updateNodes = (newNodes) => {
    const newHistory = history.slice(0, safeHistoryIndex + 1);
    newHistory.push(newNodes);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const replaceCurrentNodes = (newNodes) => {
    if (history.length === 0) {
      setHistory([newNodes]);
      setHistoryIndex(0);
      return;
    }
    const newHistory = [...history];
    newHistory[safeHistoryIndex] = newNodes;
    setHistory(newHistory);
  };

  const undo = () => { if (historyIndex > 0) setHistoryIndex(historyIndex - 1); };
  const redo = () => { if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1); };

  const findNodeById = (id, nodesList = nodes) => nodesList.find(node => node.id === id);

  const collectSubtreeIds = (rootId, nodesList = nodes) => {
    const ids = new Set();
    const stack = [rootId];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (ids.has(currentId)) continue;
      const current = findNodeById(currentId, nodesList);
      if (!current) continue;
      ids.add(currentId);
      const children = getChildren(nodesList, currentId);
      children.forEach(child => stack.push(child.id));
    }
    return ids;
  };

  const resolveEntangledColor = useCallback((rootId) => {
    if (!rootId) return DEFAULT_ENTANGLED_COLOR;
    const match = nodes.find((node) => node.entangledRootId === rootId && node.entangledColor);
    return match?.entangledColor || DEFAULT_ENTANGLED_COLOR;
  }, [nodes]);

  const updateEntangledGroupColor = useCallback((rootId, color) => {
    if (!rootId || !color || !Array.isArray(nodes)) return;
    let targetRootId = rootId;
    let fallbackIds = null;
    const hasDirectMatch = nodes.some((node) => node.entangledRootId === targetRootId);
    if (!hasDirectMatch) {
      const match = nodes.find((node) => (
        node.id === targetRootId || node.entangledPeerId === targetRootId
      ));
      if (match?.entangledRootId) {
        targetRootId = match.entangledRootId;
      } else if (match) {
        targetRootId = null;
        fallbackIds = new Set([match.id, match.entangledPeerId].filter(Boolean));
      }
    }
    if (!targetRootId && (!fallbackIds || fallbackIds.size === 0)) return;
    const nextNodes = nodes.map((node) => {
      if (targetRootId) {
        return node.entangledRootId === targetRootId ? { ...node, entangledColor: color } : node;
      }
      if (fallbackIds && (fallbackIds.has(node.id) || fallbackIds.has(node.entangledPeerId))) {
        return { ...node, entangledColor: color };
      }
      return node;
    });
    const changed = nextNodes.some((node, index) => node !== nodes[index]);
    if (!changed) return;
    updateNodes(nextNodes);
  }, [nodes, updateNodes]);

  const resolveNodeTitle = (parentId, branchName, fallbackTitle) => fallbackTitle;

  const EXPLORATION_STORAGE_KEY = 'nma-explorations';
  const loadExplorations = () => {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const raw = window.localStorage.getItem(EXPLORATION_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  };

  const persistExplorations = (next) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(EXPLORATION_STORAGE_KEY, JSON.stringify(next));
  };

  useEffect(() => {
    setExplorations(loadExplorations());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    const timeout = window.setTimeout(() => {
      const snapshot = {
        version: SESSION_VERSION,
        savedAt: new Date().toISOString(),
        history: sanitizeHistoryForStorage(history),
        historyIndex: safeHistoryIndex,
        selectedNodeId,
        dataModel,
        rawDataName,
        viewMode,
        renderMode,
        dataModelSorts,
        branchSelectionByNodeId,
        isStatsCollapsed,
        isStatsDetached,
        statsPanelRect,
        isPropertiesCollapsed,
        showDataModel,
        activeExplorationId
      };
      writeSessionState(snapshot);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    history,
    safeHistoryIndex,
    selectedNodeId,
    dataModel,
    rawDataName,
    viewMode,
    renderMode,
    dataModelSorts,
    branchSelectionByNodeId,
    isStatsCollapsed,
    isStatsDetached,
    statsPanelRect,
    isPropertiesCollapsed,
    showDataModel,
    activeExplorationId
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(TABLE_DENSITY_STORAGE_KEY, tableDensity);
    } catch (err) {
      // Ignore storage errors.
    }
  }, [tableDensity]);

  useEffect(() => {
    if (renderMode !== 'freeLayout') return;
    const needsLayout = nodes.some((node) => (
      !node.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)
    ));
    if (!needsLayout) return;
    const defaults = buildDefaultFreeLayout(nodes);
    const nextNodes = nodes.map((node) => {
      if (node.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.y)) {
        return node;
      }
      const fallback = defaults[node.id] || { x: 80, y: 80 };
      return { ...node, position: { x: fallback.x, y: fallback.y } };
    });
    replaceCurrentNodes(nextNodes);
  }, [renderMode, nodes, buildDefaultFreeLayout, replaceCurrentNodes]);

  // -------------------------------------------------------------------
  // Node updates (params + metadata)
  // -------------------------------------------------------------------
  const updateNode = (id, updates, isMeta = false, silent = false) => {
    const targetNode = findNodeById(id);
    let newNodes = nodes.map(n => {
      if (n.id !== id) return n;
      if (isMeta) return { ...n, ...updates };
      return { ...n, params: updates };
    });

    if (silent) {
      const newHistory = [...history];
      newHistory[historyIndex] = newNodes;
      setHistory(newHistory);
    } else {
      updateNodes(newNodes);
    }
  };

  // If user selects files, keep them pending until they click ingest
  const updateNodeFromPanel = (id, params, isMeta = false) => {
    if (id === 'node-start' && params && Object.prototype.hasOwnProperty.call(params, '__files')) {
      setPendingFiles(params.__files || []);
    }
    updateNode(id, params, isMeta);
  };

  const ingestPendingFiles = () => {
    if (!pendingFiles || pendingFiles.length === 0) {
      setLoadError('Please select one or more files to ingest.');
      return;
    }
    const oversizeFile = findOversizeFile(pendingFiles);
    if (oversizeFile) {
      setLoadError(`${oversizeFile.name || 'A file'} exceeds the ${MAX_UPLOAD_MB} MB per-file limit.`);
      return;
    }
    const totalBytes = getTotalFileBytes(pendingFiles);
    if (totalBytes > MAX_UPLOAD_BYTES) {
      setLoadError(`Total upload size exceeds ${MAX_UPLOAD_MB} MB limit.`);
      return;
    }
    setLoadError(null);
    setSelectedFiles([...pendingFiles]);
  };

  const clearIngestedData = () => {
    setIsLoadingFile(false);
    setDataModel({ tables: {}, order: [] });
    setDataModelSorts({});
    setRawDataName(null);
    setLoadError(null);
    setSelectedFiles([]);
    setPendingFiles([]);
    setShowDataModel(false);

    const sourceNode = nodes.find(node => node.id === 'node-start');
    if (sourceNode) {
      updateNode('node-start', { ...sourceNode.params, table: null, __files: [] });
    }
  };

  // -------------------------------------------------------------------
  // Panel controls (collapse + detach)
  // -------------------------------------------------------------------
  const clampStatsRect = useCallback((rect) => {
    if (typeof window === 'undefined') return rect;
    const padding = 12;
    const minWidth = 260;
    const minHeight = 240;
    const maxWidth = Math.max(minWidth, window.innerWidth - padding * 2);
    const maxHeight = Math.max(minHeight, window.innerHeight - padding * 2);
    const width = Math.min(Math.max(rect.width, minWidth), maxWidth);
    const height = Math.min(Math.max(rect.height, minHeight), maxHeight);
    const maxX = Math.max(padding, window.innerWidth - width - padding);
    const maxY = Math.max(padding, window.innerHeight - height - padding);
    const x = Math.min(Math.max(rect.x, padding), maxX);
    const y = Math.min(Math.max(rect.y, padding), maxY);
    return { x, y, width, height };
  }, []);

  const collapseStatsPanel = useCallback(() => {
    setIsStatsDetached(false);
    setIsStatsCollapsed(true);
  }, []);

  const expandStatsPanel = useCallback(() => {
    setIsStatsCollapsed(false);
  }, []);

  const detachStatsPanel = useCallback(() => {
    setIsStatsDetached(true);
    setIsStatsCollapsed(false);
    setStatsPanelRect((prev) => clampStatsRect(prev));
  }, [clampStatsRect]);

  const dockStatsPanel = useCallback(() => {
    setIsStatsDetached(false);
    setIsStatsCollapsed(false);
  }, []);

  const collapsePropertiesPanel = useCallback(() => {
    setIsPropertiesCollapsed(true);
  }, []);

  const expandPropertiesPanel = useCallback(() => {
    setIsPropertiesCollapsed(false);
  }, []);

  const handleStatsDragMove = useCallback((event) => {
    const state = statsDragStateRef.current;
    if (!state) return;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    if (statsDragFrameRef.current) return;
    statsDragFrameRef.current = requestAnimationFrame(() => {
      statsDragFrameRef.current = null;
      const latest = statsDragStateRef.current;
      if (!latest) return;
      const next = {
        ...latest.startRect,
        x: latest.startRect.x + (latest.lastX - latest.startX),
        y: latest.startRect.y + (latest.lastY - latest.startY)
      };
      setStatsPanelRect(clampStatsRect(next));
    });
  }, [clampStatsRect]);

  const handleStatsDragEnd = useCallback(() => {
    if (statsDragFrameRef.current) {
      cancelAnimationFrame(statsDragFrameRef.current);
      statsDragFrameRef.current = null;
    }
    statsDragStateRef.current = null;
    window.removeEventListener('pointermove', handleStatsDragMove);
    window.removeEventListener('pointerup', handleStatsDragEnd);
  }, [handleStatsDragMove]);

  const handleStatsDragStart = useCallback((event) => {
    if (!isStatsDetached) return;
    event.preventDefault();
    event.stopPropagation();
    statsDragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startRect: statsPanelRect
    };
    window.addEventListener('pointermove', handleStatsDragMove);
    window.addEventListener('pointerup', handleStatsDragEnd);
  }, [isStatsDetached, statsPanelRect, handleStatsDragMove, handleStatsDragEnd]);

  const handleStatsResizeMove = useCallback((event) => {
    const state = statsResizeStateRef.current;
    if (!state) return;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    if (statsResizeFrameRef.current) return;
    statsResizeFrameRef.current = requestAnimationFrame(() => {
      statsResizeFrameRef.current = null;
      const latest = statsResizeStateRef.current;
      if (!latest) return;
      const next = {
        ...latest.startRect,
        width: latest.startRect.width + (latest.lastX - latest.startX),
        height: latest.startRect.height + (latest.lastY - latest.startY)
      };
      setStatsPanelRect(clampStatsRect(next));
    });
  }, [clampStatsRect]);

  const handleStatsResizeEnd = useCallback(() => {
    if (statsResizeFrameRef.current) {
      cancelAnimationFrame(statsResizeFrameRef.current);
      statsResizeFrameRef.current = null;
    }
    statsResizeStateRef.current = null;
    window.removeEventListener('pointermove', handleStatsResizeMove);
    window.removeEventListener('pointerup', handleStatsResizeEnd);
  }, [handleStatsResizeMove]);

  const handleStatsResizeStart = useCallback((event) => {
    if (!isStatsDetached) return;
    event.preventDefault();
    event.stopPropagation();
    statsResizeStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startRect: statsPanelRect
    };
    window.addEventListener('pointermove', handleStatsResizeMove);
    window.addEventListener('pointerup', handleStatsResizeEnd);
  }, [isStatsDetached, statsPanelRect, handleStatsResizeMove, handleStatsResizeEnd]);

  useEffect(() => {
    if (!isStatsDetached) return;
    setStatsPanelRect((prev) => clampStatsRect(prev));
  }, [isStatsDetached, clampStatsRect]);

  useEffect(() => () => {
    window.removeEventListener('pointermove', handleStatsDragMove);
    window.removeEventListener('pointerup', handleStatsDragEnd);
    window.removeEventListener('pointermove', handleStatsResizeMove);
    window.removeEventListener('pointerup', handleStatsResizeEnd);
  }, [handleStatsDragMove, handleStatsDragEnd, handleStatsResizeMove, handleStatsResizeEnd]);

  // -------------------------------------------------------------------
  // Tree engine (process the graph of nodes)
  // -------------------------------------------------------------------
  const dataEngine = useMemo(() => createDataEngine(dataModel), [dataModel]);

  const chainData = useMemo(() => {
    const order = getCalculationOrder(nodes);
    const results = [];
    const validIds = new Set(nodes.map((node) => node.id));

    order.forEach((node) => {
      const parentKey = node.parentId ? dataEngine.getQueryKey(node.parentId) : '';
      let spec = null;

      if (node.type === 'SOURCE') {
        const table = node.params.table || dataModel.order[0];
        spec = { type: 'SOURCE', table };
      } else if (node.type === 'FILTER') {
        spec = { type: 'FILTER', parentId: node.parentId, parentKey, params: node.params };
      } else if (node.type === 'AGGREGATE') {
        spec = { type: 'AGGREGATE', parentId: node.parentId, parentKey, params: node.params };
      } else if (node.type === 'JOIN') {
        spec = { type: 'JOIN', parentId: node.parentId, parentKey, params: node.params };
      } else {
        spec = { type: 'FILTER', parentId: node.parentId, parentKey, params: {} };
      }

      const query = dataEngine.ensureQuery(node.id, spec);
      const sampleRows = dataEngine.getSampleRows(node.id, dataEngine.DEFAULT_SAMPLE_SIZE);

      results.push({
        nodeId: node.id,
        queryId: node.id,
        schema: query.schema || [],
        rowCount: query.rowCount || 0,
        data: sampleRows,
        sampleRows,
        getRowAt: (index, sortBy, sortDirection) => dataEngine.getRowAt(node.id, index, sortBy, sortDirection),
        getRows: (range, sortBy, sortDirection) =>
          dataEngine.getRows(node.id, { ...range, sortBy, sortDirection }),
        getMetric: (fn, field) => dataEngine.getMetric(node.id, fn, field),
        getPivotData: (specArgs) => dataEngine.getPivotData(node.id, specArgs),
        getAggregatedRows: (specArgs) => dataEngine.getAggregatedRows(node.id, specArgs),
        getSampleRows: (size, sortBy, sortDirection) => dataEngine.getSampleRows(node.id, size, sortBy, sortDirection),
        getColumnStats: (field) => dataEngine.getColumnStats(node.id, field)
      });
    });

    dataEngine.pruneQueries(validIds);
    return results;
  }, [nodes, dataModel, dataEngine]);

  // -------------------------------------------------------------------
  // Node operations (add/insert/remove/toggle)
  // -------------------------------------------------------------------
  const getDefaultParams = (subtype) => ({
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
    target: 100,
    joinType: 'LEFT',
    metrics: [],
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
    assistantPlan: []
  });

  const COMPONENT_TITLE_BY_SUBTYPE = {
    TABLE: 'Table',
    PIVOT: 'Pivot Table',
    AI: 'AI Assistant',
    CHART: 'Chart',
    KPI: 'KPI',
    GAUGE: 'Gauge'
  };

  const getComponentTitle = (subtype) => {
    if (!subtype) return 'Component';
    const key = String(subtype).toUpperCase();
    return COMPONENT_TITLE_BY_SUBTYPE[key] || `${key} View`;
  };

  const DEFAULT_NODE_TITLE_BY_TYPE = {
    FILTER: 'Filter Data',
    AGGREGATE: 'Aggregate',
    JOIN: 'SQL Join'
  };

  const getDefaultNodeTitle = (type, subtype) => {
    if (!type) return 'New Step';
    const key = String(type).toUpperCase();
    if (key === 'COMPONENT') return getComponentTitle(subtype);
    return DEFAULT_NODE_TITLE_BY_TYPE[key] || 'New Step';
  };

  const cloneSubtree = (rootId, newParentId) => {
    const mapping = new Map();
    const reverseMapping = new Map();
    const newNodes = [];
    const queue = [rootId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      const current = findNodeById(currentId);
      if (!current) continue;
      const newId = createNodeId();
      mapping.set(currentId, newId);
      reverseMapping.set(newId, currentId);
      const parentId = currentId === rootId ? newParentId : mapping.get(current.parentId);
      const cloned = {
        ...current,
        id: newId,
        parentId
      };
      delete cloned.entangledPeerId;
      delete cloned.entangledRootId;
      newNodes.push(cloned);
      const children = getChildren(nodes, currentId);
      children.forEach(child => queue.push(child.id));
    }

    return { newNodes, mapping, reverseMapping };
  };

  const addNode = (type, parentId, subtype = 'TABLE') => {
    const parent = findNodeById(parentId);
    if (!parent) return;
    const siblings = getChildren(nodes, parentId);
    const branchName = siblings.length > 0 ? `Fork ${siblings.length + 1}` : undefined;
    const fallbackTitle = getDefaultNodeTitle(type, subtype);
    const title = resolveNodeTitle(parentId, branchName, fallbackTitle);
    const newId = createNodeId();
    const entangledRootId = parent.entangledRootId;
    const entangledColor = entangledRootId ? resolveEntangledColor(entangledRootId) : undefined;

    let nextNodes = [...nodes];
    if (siblings.length === 1) {
      const existingChild = siblings[0];
      if (!existingChild.branchName) {
        const firstBranchLabel = 'Fork 1';
        nextNodes = nextNodes.map((node) => (
          node.id === existingChild.id ? { ...node, branchName: firstBranchLabel } : node
        ));
        if (existingChild.entangledPeerId) {
          nextNodes = nextNodes.map((node) => (
            node.id === existingChild.entangledPeerId ? { ...node, branchName: firstBranchLabel } : node
          ));
        }
      }
    }

    const newNode = {
      id: newId,
      parentId,
      type,
      title,
      branchName,
      titleIsCustom: false,
      isExpanded: true,
      params: getDefaultParams(subtype)
    };

    nextNodes.push(newNode);
    if (parent.entangledPeerId) {
      const peerId = createNodeId();
      const peerTitle = resolveNodeTitle(parent.entangledPeerId, branchName, fallbackTitle);
      newNode.entangledPeerId = peerId;
      newNode.entangledRootId = entangledRootId;
      newNode.entangledColor = entangledColor;
      nextNodes.push({
        ...newNode,
        id: peerId,
        parentId: parent.entangledPeerId,
        title: peerTitle,
        entangledPeerId: newId,
        entangledRootId,
        entangledColor
      });
    }

    updateNodes(nextNodes);
    setSelectedNodeId(newId);
    setShowAddMenuForId(null);
  };

  const insertNode = (type, parentId, subtype = 'TABLE', childId = null, insertPosition = null) => {
    const parent = findNodeById(parentId);
    if (!parent) return;
    const fallbackTitle = getDefaultNodeTitle(type, subtype);
    const title = resolveNodeTitle(parentId, undefined, fallbackTitle);
    const newId = createNodeId();
    const entangledRootId = parent.entangledRootId;
    const entangledColor = entangledRootId ? resolveEntangledColor(entangledRootId) : undefined;
    const targetChild = childId ? findNodeById(childId) : null;
    const shouldTargetChild = !!targetChild && targetChild.parentId === parentId;
    const nextPosition = (insertPosition && Number.isFinite(insertPosition.x) && Number.isFinite(insertPosition.y))
      ? { x: insertPosition.x, y: insertPosition.y }
      : null;
    const nodeTemplate = {
      type,
      title,
      titleIsCustom: false,
      isExpanded: true,
      params: getDefaultParams(subtype)
    };
    const newNode = {
      id: newId,
      parentId,
      ...nodeTemplate,
      ...(nextPosition ? { position: nextPosition } : {})
    };

    let updatedNodes = nodes.map((node) => {
      if (shouldTargetChild) {
        return node.id === targetChild.id ? { ...node, parentId: newId } : node;
      }
      return node.parentId === parentId ? { ...node, parentId: newId } : node;
    });

    if (parent.entangledPeerId) {
      const peerParentId = parent.entangledPeerId;
      const peerId = createNodeId();
      const peerTitle = resolveNodeTitle(peerParentId, undefined, fallbackTitle);
      const peerTargetChildId = shouldTargetChild ? targetChild.entangledPeerId : null;
      const peerTargetChild = peerTargetChildId ? findNodeById(peerTargetChildId) : null;
      const shouldTargetPeerChild = !!peerTargetChild && peerTargetChild.parentId === peerParentId;
      newNode.entangledPeerId = peerId;
      newNode.entangledRootId = entangledRootId;
      newNode.entangledColor = entangledColor;
      updatedNodes = updatedNodes.map((node) => {
        if (shouldTargetPeerChild) {
          return node.id === peerTargetChildId ? { ...node, parentId: peerId } : node;
        }
        return node.parentId === peerParentId ? { ...node, parentId: peerId } : node;
      });
      updatedNodes.push({
        id: peerId,
        parentId: peerParentId,
        ...nodeTemplate,
        title: peerTitle,
        entangledPeerId: newId,
        entangledRootId,
        entangledColor
      });
    }

    updatedNodes.push(newNode);
    updateNodes(updatedNodes);
    setSelectedNodeId(newId);
    setShowInsertMenuForId(null);
  };

  const removeNode = (id) => {
    const target = findNodeById(id);
    if (!target) return;
    const nodesToDelete = collectSubtreeIds(id);
    if (target.entangledPeerId) {
      collectSubtreeIds(target.entangledPeerId).forEach((peerId) => nodesToDelete.add(peerId));
    }
    const filtered = nodes.filter(n => !nodesToDelete.has(n.id));
    updateNodes(filtered);
    if (nodesToDelete.has(selectedNodeId)) setSelectedNodeId('node-start');
  };

  const toggleNodeExpansion = (id) => {
    const newNodes = nodes.map(n => n.id === id ? { ...n, isExpanded: !n.isExpanded } : n);
    const newHistory = [...history];
    newHistory[historyIndex] = newNodes;
    setHistory(newHistory);
  };

  const toggleBranchCollapse = (id) => {
    const newNodes = nodes.map(n => n.id === id ? { ...n, isBranchCollapsed: !n.isBranchCollapsed } : n);
    const newHistory = [...history];
    newHistory[historyIndex] = newNodes;
    setHistory(newHistory);
  };

  const handleSelect = (id, options = {}) => {
    const { expand = true } = options || {};
    setSelectedNodeId(id);
    if (!expand) return;
    const newNodes = nodes.map(n => n.id === id ? { ...n, isExpanded: true } : n);
    const newHistory = [...history];
    newHistory[historyIndex] = newNodes;
    setHistory(newHistory);
  };

  const toggleEntangledBranch = useCallback((id) => {
    const target = findNodeById(id);
    if (!target || !target.parentId) return;
    if (target.entangledPeerId) {
      const peer = findNodeById(target.entangledPeerId);
      if (!peer || peer.parentId !== target.parentId) return;
      const peerIds = collectSubtreeIds(peer.id);
      const selfIds = collectSubtreeIds(target.id);
      const nextNodes = nodes
        .filter(node => !peerIds.has(node.id))
        .map((node) => (
          selfIds.has(node.id)
            ? {
              ...node,
              entangledPeerId: undefined,
              entangledRootId: undefined,
              entangledColor: undefined
            }
            : node
        ));
      updateNodes(nextNodes);
      return;
    }

    const groupId = `entangled-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const entangledColor = DEFAULT_ENTANGLED_COLOR;
    const { newNodes, mapping, reverseMapping } = cloneSubtree(target.id, target.parentId);
    const updatedExisting = nodes.map((node) => {
      if (!mapping.has(node.id)) return node;
      return {
        ...node,
        entangledPeerId: mapping.get(node.id),
        entangledRootId: groupId,
        entangledColor
      };
    });
    const mirrored = newNodes.map((node) => {
      const originalId = reverseMapping.get(node.id);
      return {
        ...node,
        entangledPeerId: originalId,
        entangledRootId: groupId,
        entangledColor
      };
    });
    updateNodes([...updatedExisting, ...mirrored]);
  }, [nodes, findNodeById, collectSubtreeIds, cloneSubtree, updateNodes]);

  const setBranchSelection = useCallback((parentId, childId) => {
    if (!parentId || !childId) return;
    setBranchSelectionByNodeId(prev => (
      prev[parentId] === childId ? prev : { ...prev, [parentId]: childId }
    ));
  }, []);

  const renameBranch = useCallback((branchId, nextName) => {
    if (!branchId) return;
    const target = findNodeById(branchId);
    if (!target) return;
    const trimmed = typeof nextName === 'string' ? nextName.trim() : '';
    const currentName = target.branchName || '';
    const peer = target.entangledPeerId ? findNodeById(target.entangledPeerId) : null;
    const peerName = peer?.branchName || '';
    if (trimmed === currentName && trimmed === peerName) return;
    const idsToUpdate = new Set([branchId]);
    if (target.entangledPeerId) idsToUpdate.add(target.entangledPeerId);
    const nextNodes = nodes.map((node) => (
      idsToUpdate.has(node.id) ? { ...node, branchName: trimmed } : node
    ));
    updateNodes(nextNodes);
  }, [nodes, findNodeById, updateNodes]);

  const applyNodePositions = useCallback((positions, options = {}) => {
    if (!positions) return;
    let hasChanges = false;
    const nextNodes = nodes.map((node) => {
      const nextPosition = positions[node.id];
      if (!nextPosition) return node;
      if (node.position?.x === nextPosition.x && node.position?.y === nextPosition.y) return node;
      hasChanges = true;
      return { ...node, position: { x: nextPosition.x, y: nextPosition.y } };
    });
    if (!hasChanges) return;
    if (options.useHistory) {
      updateNodes(nextNodes);
    } else {
      replaceCurrentNodes(nextNodes);
    }
  }, [nodes, updateNodes, replaceCurrentNodes]);

  const updateNodePosition = useCallback((id, position) => {
    if (!id || !position) return;
    applyNodePositions({ [id]: position });
  }, [applyNodePositions]);

  const applyAutoLayout = useCallback((positions) => {
    applyNodePositions(positions, { useHistory: true });
  }, [applyNodePositions]);

  const buildInValue = (values) => values.map((value) => String(value)).join(', ');

  const addFilterToNode = (nodeId, filter, options = {}) => {
    if (!nodeId) return;
    const target = findNodeById(nodeId);
    if (!target) return;
    const existing = normalizeFilters(target.params);
    const nextFilters = [
      ...existing,
      { id: createFilterId(), field: '', operator: 'equals', value: '', mode: 'operator', ...filter }
    ];
    const nextParams = { ...target.params, filters: nextFilters };
    updateNode(nodeId, nextParams);
    const nextIndex = nextFilters.length - 1;
    if (options.focus) {
      setSelectedNodeId(nodeId);
      setActiveFilterTarget({ nodeId, index: nextIndex });
      if (options.openPanel !== false) expandPropertiesPanel();
    }
    return nextIndex;
  };

  const addFilterNode = ({ parentId, field, operator = 'equals', value, mode = 'operator' }) => {
    if (!parentId || !field) return;
    const parent = findNodeById(parentId);
    if (!parent) return;
    const newId = createNodeId();
    const entangledRootId = parent.entangledRootId;
    const entangledColor = entangledRootId ? resolveEntangledColor(entangledRootId) : undefined;
    const fallbackTitle = getDefaultNodeTitle('FILTER');
    const title = resolveNodeTitle(parentId, undefined, fallbackTitle);
    const filterPayload = { id: createFilterId(), field, operator, value, mode };
    const newNode = {
      id: newId,
      parentId,
      type: 'FILTER',
      title,
      titleIsCustom: false,
      isExpanded: true,
      params: { filters: [filterPayload] }
    };

    const nextNodes = [...nodes, newNode];
    if (parent.entangledPeerId) {
      const peerId = createNodeId();
      const peerTitle = resolveNodeTitle(parent.entangledPeerId, undefined, fallbackTitle);
      newNode.entangledPeerId = peerId;
      newNode.entangledRootId = entangledRootId;
      newNode.entangledColor = entangledColor;
      nextNodes.push({
        ...newNode,
        id: peerId,
        parentId: parent.entangledPeerId,
        title: peerTitle,
        entangledPeerId: newId,
        entangledRootId,
        entangledColor
      });
    }

    updateNodes(nextNodes);
    setSelectedNodeId(newId);
  };

  const updateFilterOnNode = (nodeId, filterIndex, updates) => {
    if (filterIndex == null || filterIndex < 0) return;
    const target = findNodeById(nodeId);
    if (!target) return;
    const existing = normalizeFilters(target.params);
    if (!existing[filterIndex]) return;
    const nextFilters = existing.map((filter, idx) => (
      idx === filterIndex ? { ...filter, ...updates } : filter
    ));
    updateNode(nodeId, { ...target.params, filters: nextFilters });
  };

  const removeFilterFromNode = (nodeId, filterIndex) => {
    if (filterIndex == null || filterIndex < 0) return;
    const target = findNodeById(nodeId);
    if (!target) return;
    const existing = normalizeFilters(target.params);
    if (!existing[filterIndex]) return;
    const nextFilters = existing.filter((_, idx) => idx !== filterIndex);
    updateNode(nodeId, { ...target.params, filters: nextFilters });
    setActiveFilterTarget((prev) => {
      if (!prev || prev.nodeId !== nodeId) return prev;
      if (prev.index === filterIndex) return null;
      if (prev.index > filterIndex) return { ...prev, index: prev.index - 1 };
      return prev;
    });
  };

  const handleChartDrillDown = (data, chartMeta, parentId) => {
    if (!data || !parentId) return;
    const xAxisField = chartMeta?.xAxis;
    if (!xAxisField) return;
    const payload = data.activePayload?.[0]?.payload;
    const clickedValue = payload?.__x;
    const selectionValues = data.selection?.values || (clickedValue !== undefined ? [clickedValue] : []);
    if (!selectionValues.length) return;
    const operator = selectionValues.length > 1 ? 'in' : 'equals';
    const value = operator === 'in' ? buildInValue(selectionValues) : selectionValues[0];
    addFilterNode({ parentId, field: xAxisField, operator, value, mode: 'attribute' });
  };

  const handleTableCellClick = (value, field, parentId) => {
    addFilterNode({ parentId, field, operator: 'equals', value, mode: 'attribute' });
  };

  const handleFilterCellAction = (action, payload) => {
    if (!payload) return;
    const { nodeId, field, value } = payload;
    if (!nodeId || !field) return;
    if (action === 'add-to-node') {
      addFilterToNode(nodeId, { field, operator: 'equals', value, mode: 'attribute' }, { focus: false });
      return;
    }
    if (action === 'create-node') {
      addFilterNode({ parentId: nodeId, field, operator: 'equals', value, mode: 'attribute' });
    }
  };

  const handleTableSortChange = (nodeId, sortBy, sortDirection) => {
    const targetNode = nodes.find(n => n.id === nodeId);
    if (!targetNode) return;
    const nextSortBy = sortBy || '';
    const nextSortDirection = nextSortBy ? (sortDirection || 'asc') : '';
    updateNode(nodeId, { ...targetNode.params, tableSortBy: nextSortBy, tableSortDirection: nextSortDirection });
  };

  const getSortedRows = (rows, sortBy, sortDirection) => {
    if (!sortBy || !sortDirection) return rows;
    const withIndex = rows.map((row, index) => ({ row, index }));
    const direction = sortDirection === 'asc' ? 1 : -1;
    withIndex.sort((a, b) => {
      const aRaw = a.row?.[sortBy];
      const bRaw = b.row?.[sortBy];
      if (aRaw == null && bRaw == null) return a.index - b.index;
      if (aRaw == null) return 1;
      if (bRaw == null) return -1;
      const aNum = Number(aRaw);
      const bNum = Number(bRaw);
      const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);
      if (bothNumeric) {
        if (aNum === bNum) return a.index - b.index;
        return (aNum - bNum) * direction;
      }
      const aText = String(aRaw);
      const bText = String(bRaw);
      const result = aText.localeCompare(bText, undefined, { numeric: true, sensitivity: 'base' });
      if (result === 0) return a.index - b.index;
      return result * direction;
    });
    return withIndex.map(item => item.row);
  };

  const handleDataModelSort = (tableName, column) => {
    setDataModelSorts((prev) => {
      const current = prev[tableName] || { sortBy: '', sortDirection: '' };
      if (current.sortBy !== column) {
        return { ...prev, [tableName]: { sortBy: column, sortDirection: 'asc' } };
      }
      if (current.sortDirection === 'asc') {
        return { ...prev, [tableName]: { sortBy: column, sortDirection: 'desc' } };
      }
      return { ...prev, [tableName]: { sortBy: '', sortDirection: '' } };
    });
  };

  const getExplorationStats = (model) => {
    const order = model?.order || [];
    const rowCount = order.reduce((sum, name) => sum + ((model.tables?.[name] || []).length), 0);
    return { tableCount: order.length, rowCount };
  };

  const saveExploration = () => {
    setSaveError(null);
    const now = new Date().toISOString();
    const stats = getExplorationStats(dataModel);
    const existing = explorations.find(exp => exp.id === activeExplorationId);
    const baseName = rawDataName || 'Exploration';
    const name = existing?.name || baseName;
    const payload = {
      id: existing?.id || `exp-${Date.now()}`,
      name,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      nodes: sanitizeNodesForStorage(nodes),
      dataModel,
      rawDataName,
      tableCount: stats.tableCount,
      rowCount: stats.rowCount
    };
    const next = existing
      ? explorations.map(exp => exp.id === payload.id ? payload : exp)
      : [payload, ...explorations];
    try {
      persistExplorations(next);
      setExplorations(next);
      setActiveExplorationId(payload.id);
      setShowDataModel(false);
      setViewMode('landing');
    } catch (err) {
      setSaveError('Unable to save this exploration. Storage may be full.');
    }
  };

  const openExploration = (exploration) => {
    if (!exploration) return;
    const nextNodes = exploration.nodes || createInitialNodes();
    setHistory([nextNodes]);
    setHistoryIndex(0);
    setSelectedNodeId(nextNodes[0]?.id || 'node-start');
    setDataModel(exploration.dataModel || { tables: {}, order: [] });
    setRawDataName(exploration.rawDataName || exploration.name || null);
    setLoadError(null);
    setSelectedFiles([]);
    setPendingFiles([]);
    setShowDataModel(false);
    setShowAddMenuForId(null);
    setShowInsertMenuForId(null);
    setActiveExplorationId(exploration.id);
    setViewMode('canvas');
  };

  const deleteExploration = (id) => {
    const next = explorations.filter(exp => exp.id !== id);
    try {
      persistExplorations(next);
    } catch (err) {
      // Ignore storage errors on delete.
    }
    setExplorations(next);
    if (activeExplorationId === id) {
      setActiveExplorationId(null);
    }
  };

  const startNewExploration = () => {
    const nextNodes = createInitialNodes();
    setHistory([nextNodes]);
    setHistoryIndex(0);
    setSelectedNodeId(nextNodes[0]?.id || 'node-start');
    setDataModel({ tables: {}, order: [] });
    setRawDataName(null);
    setLoadError(null);
    setSelectedFiles([]);
    setPendingFiles([]);
    setShowDataModel(false);
    setShowAddMenuForId(null);
    setShowInsertMenuForId(null);
    setActiveExplorationId(null);
    setViewMode('canvas');
  };

  // -------------------------------------------------------------------
  // AI assistant helper (rule-based planner)
  // -------------------------------------------------------------------
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalizeText = (value) => value.toLowerCase();
  const getStoredLlmSettings = () => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { baseUrl: '', model: '', apiKey: '' };
    }
    try {
      const raw = window.localStorage.getItem('node-memory-llm-settings');
      if (!raw) return { baseUrl: '', model: '', apiKey: '' };
      const parsed = JSON.parse(raw);
      return {
        baseUrl: parsed.baseUrl || '',
        model: parsed.model || '',
        apiKey: parsed.apiKey || ''
      };
    } catch (err) {
      return { baseUrl: '', model: '', apiKey: '' };
    }
  };

  const getNumericFields = (data, schema) => {
    const sample = data.slice(0, 50);
    return schema.filter((field) => sample.some((row) => {
      const raw = row[field];
      if (raw === null || raw === undefined || raw === '') return false;
      const num = Number(raw);
      return !Number.isNaN(num);
    }));
  };

  const matchFieldsInQuestion = (question, schema) => {
    const lower = normalizeText(question);
    return schema.filter((field) => {
      const raw = field.toLowerCase();
      const variants = [raw, raw.replace(/_/g, ' '), `${raw}s`];
      return variants.some((variant) => lower.includes(variant));
    });
  };

  const pickGroupField = (matches, nonNumeric, schema) => {
    if (matches.length === 0) return nonNumeric[0] || schema[0] || null;
    const nonNumericMatch = matches.find((field) => nonNumeric.includes(field));
    return nonNumericMatch || matches[0] || null;
  };

  const pickMetricField = (matches, numeric) => {
    const numericMatch = matches.find((field) => numeric.includes(field));
    return numericMatch || numeric[0] || '';
  };

  const parseFiltersFromQuestion = (question, schema) => {
    const filters = [];
    for (const field of schema) {
      const escaped = escapeRegExp(field);
      const pattern = new RegExp(`${escaped}\\s*(=|equals|is|>=|<=|>|<|at least|at most|above|below|greater than|less than)\\s*([\\w\\-\\.]+)`, 'i');
      const trailingPattern = new RegExp(`${escaped}[^0-9]{0,10}([0-9]+(?:\\.[0-9]+)?)\\s*(and\\s+above|or\\s+more|and\\s+below|or\\s+less)?`, 'i');
      const containsPattern = new RegExp(`${escaped}\\s*(contains|includes)\\s*([\\w\\-\\.]+)`, 'i');
      const match = question.match(pattern);
      if (match) {
        const operatorToken = match[1].toLowerCase();
        const value = match[2];
        const operator = operatorToken === '>' || operatorToken === 'greater than' || operatorToken === 'above'
          ? 'gt'
          : operatorToken === '<' || operatorToken === 'less than' || operatorToken === 'below'
            ? 'lt'
            : operatorToken === '>=' || operatorToken === 'at least'
              ? 'gte'
              : operatorToken === '<=' || operatorToken === 'at most'
                ? 'lte'
                : 'equals';
        filters.push({ field, operator, value });
        continue;
      }
      const trailingMatch = question.match(trailingPattern);
      if (trailingMatch) {
        const value = trailingMatch[1];
        const qualifier = (trailingMatch[2] || '').toLowerCase();
        const operator = qualifier.includes('above') || qualifier.includes('more') ? 'gte'
          : qualifier.includes('below') || qualifier.includes('less') ? 'lte'
            : 'equals';
        filters.push({ field, operator, value });
        continue;
      }
      const containsMatch = question.match(containsPattern);
      if (containsMatch) {
        filters.push({ field, operator: 'contains', value: containsMatch[2] });
      }
    }
    return filters;
  };

  const extractCandidateValues = (question) => {
    const quoted = Array.from(question.matchAll(/["']([^"']+)["']/g)).map(match => match[1]);
    const capitalized = Array.from(question.matchAll(/\b[A-Z][a-zA-Z0-9]+\b/g)).map(match => match[0]);
    const stop = new Set(['How', 'What', 'Which', 'Average', 'Count', 'Total', 'Show', 'Find', 'List', 'Models']);
    return [...new Set([...quoted, ...capitalized].filter(token => !stop.has(token)))];
  };

  const inferValueFiltersFromQuestion = (question, schema, data) => {
    const candidates = extractCandidateValues(question);
    if (!candidates.length || !data.length) return [];
    const filters = [];
    const usedFields = new Set();
    candidates.forEach((candidate) => {
      const lowerCandidate = candidate.toLowerCase();
      for (const field of schema) {
        if (usedFields.has(field)) continue;
        const hasMatch = data.slice(0, 50).some((row) => {
          const raw = row[field];
          if (raw === null || raw === undefined) return false;
          return String(raw).toLowerCase() === lowerCandidate;
        });
        if (hasMatch) {
          filters.push({ field, operator: 'equals', value: candidate });
          usedFields.add(field);
          break;
        }
      }
    });
    return filters;
  };

  const extractThreshold = (question) => {
    const lower = normalizeText(question);
    const numberMatch = lower.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!numberMatch) return null;
    const value = numberMatch[1];
    const operator = lower.includes('at least') || lower.includes('above') || lower.includes('greater than') || lower.includes('>=') || lower.includes('or more')
      ? 'gte'
      : lower.includes('at most') || lower.includes('below') || lower.includes('less than') || lower.includes('<=') || lower.includes('or less')
        ? 'lte'
        : null;
    return { value, operator };
  };

  const findFieldByKeyword = (schema, keywords) => {
    const lowerSchema = schema.map(field => ({ field, lower: field.toLowerCase() }));
    for (const keyword of keywords) {
      const match = lowerSchema.find((item) => item.lower.includes(keyword));
      if (match) return match.field;
    }
    return null;
  };

  const detectAggregation = (lower) => {
    if (lower.includes('distinct') || lower.includes('unique')) return 'count_distinct';
    if (lower.includes('average') || lower.includes('avg') || lower.includes('mean')) return 'avg';
    if (lower.includes('sum') || lower.includes('total')) return 'sum';
    if (lower.includes('minimum') || lower.includes('min')) return 'min';
    if (lower.includes('maximum') || lower.includes('max') || lower.includes('highest')) return 'max';
    if (lower.includes('count') || lower.includes('how many')) return 'count';
    return 'count';
  };

  const buildAssistantPlan = (question, schema, data) => {
    const trimmed = question.trim();
    if (!trimmed) {
      return { ok: false, error: 'Please enter a question so I can build a plan.' };
    }
    if (!schema || schema.length === 0) {
      return { ok: false, error: 'No columns available yet. Connect a data source first.' };
    }

    const lower = normalizeText(trimmed);
    const matchedFields = matchFieldsInQuestion(trimmed, schema);
    const numericFields = getNumericFields(data, schema);
    const nonNumericFields = schema.filter((field) => !numericFields.includes(field));
    const parsedFilters = parseFiltersFromQuestion(trimmed, schema);
    const inferredFilters = inferValueFiltersFromQuestion(trimmed, schema, data);
    const filters = [...parsedFilters, ...inferredFilters].filter((item, idx, arr) => (
      arr.findIndex(other => other.field === item.field && other.value === item.value) === idx
    ));
    const fn = detectAggregation(lower);

    const wantsPivot = lower.includes('pivot');
    const wantsChart = /(chart|graph|plot)/.test(lower);
    const wantsGauge = lower.includes('gauge');
    const wantsTable = /(table|list|rows|records)/.test(lower);
    const wantsKpi = /(kpi|metric|number|total|count|sum|avg|average|min|max|distinct)/.test(lower);
    const groupIntent = /(group by|by |per |each )/.test(lower);

    const countIntent = /(how many|number of|count)/.test(lower);
    const avgIntent = /(average|avg|mean)/.test(lower);
    const modelField = findFieldByKeyword(schema, ['model', 'sku', 'style', 'product']);
    const ratingField = findFieldByKeyword(schema, ['rating', 'score', 'stars', 'review']);
    const threshold = extractThreshold(trimmed);

    let view = 'TABLE';
    if (wantsPivot) view = 'PIVOT';
    else if (wantsChart) view = 'CHART';
    else if (wantsGauge) view = 'GAUGE';
    else if (wantsKpi) view = 'KPI';
    else if (wantsTable) view = 'TABLE';

    const groupField = groupIntent ? pickGroupField(matchedFields, nonNumericFields, schema) : null;
    const metricField = pickMetricField(matchedFields, numericFields);
    const fnDetected = /(distinct|unique|average|avg|mean|sum|total|minimum|min|maximum|max|count|how many)/.test(lower);
    const needsMetricField = ['sum', 'avg', 'min', 'max', 'count_distinct'].includes(fn);

    if (needsMetricField && !metricField) {
      return { ok: false, error: 'I could not find a numeric column for that aggregation.' };
    }

    const steps = [];
    const planSteps = [];

    if (filters.length) {
      filters.forEach((filter) => {
        steps.push({
          type: 'FILTER',
          params: { field: filter.field, operator: filter.operator, value: filter.value },
          title: 'Filter Data'
        });
        planSteps.push(`Filter ${filter.field} ${filter.operator} ${filter.value}`);
      });
    }

    const shouldAggregate = !!groupField && !wantsPivot && (fnDetected || view === 'CHART' || view === 'TABLE');
    let aggOutputField = null;
    if (shouldAggregate) {
      const aggFn = fnDetected ? fn : 'count';
      const aggParams = { groupBy: groupField, fn: aggFn, metricField: needsMetricField ? metricField : '' };
      aggOutputField = aggFn === 'count' ? 'Record Count' : metricField;
      steps.push({
        type: 'AGGREGATE',
        params: aggParams,
        title: 'Aggregate'
      });
      planSteps.push(aggFn === 'count'
        ? `Count records by ${groupField}`
        : `${aggFn} ${metricField} by ${groupField}`);
    }

    let componentParams = getDefaultParams(view);
    let componentTitle = `${view} View`;
    let hasCustomKpiMetrics = false;

    const averageModelPlan = avgIntent && countIntent && modelField && ratingField && threshold && threshold.operator;
    if (averageModelPlan) {
      const preFilters = steps.filter(step => step.type === 'FILTER');
      steps.length = 0;
      steps.push(...preFilters);
      steps.push({
        type: 'AGGREGATE',
        params: { groupBy: modelField, fn: 'avg', metricField: ratingField },
        title: 'Average Rating by Model'
      });
      steps.push({
        type: 'FILTER',
        params: { field: ratingField, operator: threshold.operator, value: threshold.value },
        title: 'Filter by Rating'
      });
      view = 'KPI';
      componentParams = getDefaultParams(view);
      componentTitle = 'KPI';
      componentParams.metrics = [{ id: `metric-${Date.now()}`, label: '', fn: 'count', field: '' }];
      hasCustomKpiMetrics = true;
      planSteps.push(`Average ${ratingField} by ${modelField}`);
      planSteps.push(`Filter ${ratingField} ${threshold.operator} ${threshold.value}`);
    }

    if (view === 'TABLE') {
      componentTitle = 'Table View';
    }

    if (view === 'PIVOT') {
      const pivotFields = matchedFields.length >= 2 ? matchedFields : schema.slice(0, 2);
      if (pivotFields.length < 2) {
        return { ok: false, error: 'Pivot tables need both a row and a column field.' };
      }
      const rowField = pivotFields[0];
      const columnField = pivotFields[1];
      if (needsMetricField && !metricField) {
        return { ok: false, error: 'Select a numeric field to compute the pivot values.' };
      }
      componentParams.pivotRow = rowField;
      componentParams.pivotColumn = columnField;
      componentParams.pivotValue = needsMetricField ? metricField : '';
      componentParams.pivotFn = fnDetected ? fn : 'count';
      componentTitle = 'Pivot Table';
      planSteps.push(`Pivot ${rowField} by ${columnField}`);
    }

    if (view === 'KPI') {
      componentTitle = componentTitle || 'KPI';
      if (!hasCustomKpiMetrics) {
        componentParams.metrics = [
          { id: `metric-${Date.now()}`, label: '', fn, field: needsMetricField ? metricField : '' }
        ];
        componentParams.fn = fn;
        componentParams.metricField = needsMetricField ? metricField : '';
        planSteps.push(needsMetricField
          ? `${fn} of ${metricField}`
          : 'Count records');
      }
    }

    if (view === 'GAUGE') {
      componentTitle = 'Gauge';
      componentParams.fn = fn;
      componentParams.metricField = needsMetricField ? metricField : '';
      planSteps.push(needsMetricField
        ? `${fn} of ${metricField}`
        : 'Count records');
    }

    if (view === 'CHART') {
      const xAxis = groupField || nonNumericFields[0] || matchedFields[0];
      const yAxis = shouldAggregate ? aggOutputField : (metricField || numericFields[0]);
      if (!xAxis || !yAxis) {
        return { ok: false, error: 'Charts need both a category and a numeric field.' };
      }
      componentTitle = 'Chart';
      componentParams.chartType = lower.includes('line') ? 'line' : 'bar';
      componentParams.xAxis = xAxis;
      componentParams.yAxis = yAxis;
      planSteps.push(`Chart ${yAxis} by ${xAxis}`);
    }

    steps.push({
      type: 'COMPONENT',
      params: componentParams,
      subtype: view,
      title: componentTitle
    });

    const summary = `Built ${steps.length} step${steps.length === 1 ? '' : 's'}: ${steps.map(s => s.title).join(' → ')}.`;
    return { ok: true, steps, planSteps, summary };
  };

  const extractJsonPayload = (text) => {
    if (!text) return null;
    const fenced = text.match(/```json([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch (err) {
        return null;
      }
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (err) {
        return null;
      }
    }
    return null;
  };

  const sanitizePlan = (payload) => {
    if (!payload || !Array.isArray(payload.steps)) return null;
    const steps = payload.steps
      .filter(step => step && typeof step.type === 'string')
      .map(step => ({
        type: step.type.toUpperCase(),
        subtype: step.subtype ? String(step.subtype).toUpperCase() : undefined,
        title: step.title || '',
        params: step.params || {}
      }))
      .filter(step => ['FILTER', 'AGGREGATE', 'JOIN', 'COMPONENT'].includes(step.type));
    if (!steps.length) return null;
    return {
      ok: payload.ok !== false,
      steps,
      planSteps: Array.isArray(payload.planSteps) ? payload.planSteps : [],
      summary: payload.summary || ''
    };
  };

  const validatePlanForQuestion = (plan, question) => {
    const lower = normalizeText(question);
    const hasAverage = /(average|avg|mean)/.test(lower);
    const hasThreshold = /([0-9]+(?:\.[0-9]+)?)/.test(lower)
      && /(above|below|>=|<=|greater|less|at least|at most|or more|or less)/.test(lower);
    const hasConditions = /(with|where|and|equals|is)/.test(lower) || hasThreshold;
    const hasFilter = plan.steps.some(step => step.type === 'FILTER');
    const hasAggregate = plan.steps.some(step => step.type === 'AGGREGATE');
    const hasComponent = plan.steps.some(step => step.type === 'COMPONENT');
    if (!hasComponent) return { ok: false, error: 'Plan missing a component step.' };
    if (hasConditions && !hasFilter) return { ok: false, error: 'Plan missing filter steps.' };
    if (hasAverage && !hasAggregate) return { ok: false, error: 'Plan missing aggregation for averages.' };
    return { ok: true };
  };

  const callLlmPlanner = async ({ question, schema, data }) => {
    const settings = getStoredLlmSettings();
    if (!settings.baseUrl || !settings.model || !settings.apiKey) {
      return { ok: false, error: 'LLM settings are missing.' };
    }

    const systemPrompt = [
      'You are a data analysis assistant.',
      'Return a JSON object only (no markdown).',
      'Schema is a list of column names, dataSample is example rows.',
      'If you cannot build a plan, return { "ok": false, "error": "reason" }.',
      'Always include FILTER steps for explicit conditions (names, categories, thresholds).',
      'If the question asks for averages/sums/min/max by a dimension, include an AGGREGATE step.',
      'If the question asks "how many" with a threshold on an average, use AGGREGATE then FILTER then KPI.',
      'Otherwise return:',
      '{ "ok": true, "summary": "...", "planSteps": ["..."], "steps": [',
      '{ "type": "FILTER", "title": "...", "params": { "field": "...", "operator": "equals|not_equals|contains|gt|lt|gte|lte", "value": "..." } },',
      '{ "type": "AGGREGATE", "title": "...", "params": { "groupBy": "...", "fn": "count|count_distinct|sum|avg|min|max", "metricField": "..." } },',
      '{ "type": "COMPONENT", "subtype": "TABLE|PIVOT|CHART|KPI|GAUGE", "title": "...", "params": { ... } } ] }',
      'Use only columns from schema. Keep params minimal.',
      'Example for: "How many models of Sneakers does Adidas have with an Average rating of 4.3 and above?"',
      '{ "ok": true, "summary": "Count models with avg rating >= 4.3 for Adidas Sneakers.",',
      '"planSteps": ["Filter brand = Adidas", "Filter category = Sneakers", "Average rating by model", "Filter rating >= 4.3", "Count models"],',
      '"steps": [',
      '{ "type": "FILTER", "title": "Filter Brand", "params": { "field": "brand", "operator": "equals", "value": "Adidas" } },',
      '{ "type": "FILTER", "title": "Filter Category", "params": { "field": "category", "operator": "equals", "value": "Sneakers" } },',
      '{ "type": "AGGREGATE", "title": "Average Rating by Model", "params": { "groupBy": "model", "fn": "avg", "metricField": "rating" } },',
      '{ "type": "FILTER", "title": "Filter by Rating", "params": { "field": "rating", "operator": "gte", "value": "4.3" } },',
      '{ "type": "COMPONENT", "subtype": "KPI", "title": "KPI", "params": { "metrics": [{ "fn": "count", "field": "" }] } }',
      '] }'
    ].join(' ');

    const body = {
      model: settings.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify({
            question,
            schema,
            dataSample: data.slice(0, 20)
          })
        }
      ]
    };

    try {
      const res = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const message = await res.text();
        let detail = message;
        try {
          const parsed = JSON.parse(message);
          detail = parsed?.error?.message || parsed?.message || message;
        } catch (err) {
          // keep raw message
        }
        return { ok: false, error: `LLM request failed (${res.status}). ${detail}` };
      }

      const payload = await res.json();
      const content = payload?.choices?.[0]?.message?.content;
      const parsed = extractJsonPayload(content);
      if (!parsed) return { ok: false, error: 'LLM response could not be parsed.' };
      if (parsed.ok === false) return { ok: false, error: parsed.error || 'LLM could not build a plan.' };
      const sanitized = sanitizePlan(parsed);
      if (!sanitized) return { ok: false, error: 'LLM plan was invalid.' };
      const validation = validatePlanForQuestion(sanitized, question);
      if (!validation.ok) return { ok: false, error: validation.error };
      return sanitized;
    } catch (err) {
      const message = err?.message || 'LLM request failed.';
      return { ok: false, error: `Network error: ${message}` };
    }
  };

  const applyAssistantPlan = (nodeId, plan, assistantUpdate) => {
    const baseNode = findNodeById(nodeId);
    if (!baseNode) return;
    const baseNodes = nodes.map((node) => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        params: { ...node.params, ...assistantUpdate }
      };
    });

    if (!plan || plan.length === 0) {
      updateNodes(baseNodes);
      return;
    }

    let parentId = nodeId;
    let peerParentId = baseNode.entangledPeerId;
    const entangledRootId = baseNode.entangledRootId;
    const entangledColor = entangledRootId ? resolveEntangledColor(entangledRootId) : undefined;
    const newNodes = [];
    const peerNodes = [];

    plan.forEach((step) => {
      const newId = createNodeId();
      const params = step.type === 'COMPONENT'
        ? { ...getDefaultParams(step.subtype), ...step.params, subtype: step.subtype }
        : { ...getDefaultParams(step.subtype || 'TABLE'), ...step.params };
      const fallbackTitle = step.title || getDefaultNodeTitle(step.type, step.subtype);
      const title = resolveNodeTitle(parentId, undefined, fallbackTitle);
      const newNode = {
        id: newId,
        parentId,
        type: step.type,
        title,
        titleIsCustom: false,
        isExpanded: true,
        params
      };

      if (peerParentId) {
        const peerId = createNodeId();
        const peerTitle = resolveNodeTitle(peerParentId, undefined, fallbackTitle);
        newNode.entangledPeerId = peerId;
        newNode.entangledRootId = entangledRootId;
        newNode.entangledColor = entangledColor;
        peerNodes.push({
          ...newNode,
          id: peerId,
          parentId: peerParentId,
          title: peerTitle,
          entangledPeerId: newId,
          entangledRootId,
          entangledColor
        });
        peerParentId = peerId;
      }

      newNodes.push(newNode);
      parentId = newId;
    });

    updateNodes([...baseNodes, ...newNodes, ...peerNodes]);
    setSelectedNodeId(newNodes[newNodes.length - 1]?.id || nodeId);
  };

  const handleAssistantRequest = async (nodeId, question) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const result = getNodeResult(chainData, nodeId);
    const schema = result?.schema || [];
    const data = result?.sampleRows || result?.data || [];
    const llmAttempted = node.params.assistantUseLLM === true;
    applyAssistantPlan(nodeId, [], {
      assistantQuestion: question,
      assistantStatus: 'loading',
      assistantError: '',
      assistantLlmError: '',
      assistantSummary: '',
      assistantPlan: []
    });

    let plan = null;
    let llmError = '';
    if (llmAttempted) {
      const llmPlan = await callLlmPlanner({ question, schema, data });
      if (llmPlan.ok) {
        plan = llmPlan;
      } else {
        plan = null;
        llmError = llmPlan.error || 'LLM unavailable.';
      }
    }

    const fallback = plan ? null : buildAssistantPlan(question, schema, data);
    const finalPlan = plan || fallback;

    if (!finalPlan || !finalPlan.ok) {
      applyAssistantPlan(nodeId, [], {
        assistantQuestion: question,
        assistantStatus: 'error',
        assistantError: finalPlan?.error || 'Unable to build a plan for that question.',
        assistantLlmError: llmAttempted ? llmError : '',
        assistantSummary: '',
        assistantPlan: []
      });
      return;
    }

    const summaryPrefix = plan
      ? ''
      : (llmAttempted
        ? (llmError ? `LLM unavailable: ${llmError}. ` : 'LLM unavailable. ')
        : 'LLM disabled. ');
    applyAssistantPlan(nodeId, finalPlan.steps, {
      assistantQuestion: question,
      assistantStatus: 'success',
      assistantError: '',
      assistantLlmError: llmAttempted ? llmError : '',
      assistantSummary: `${summaryPrefix}${finalPlan.summary || ''}`.trim(),
      assistantPlan: finalPlan.planSteps
    });
  };

  // -------------------------------------------------------------------
  // Derived status for SOURCE panel
  // -------------------------------------------------------------------
  const sourceStatus = (() => {
    if (isLoadingFile) return { title: 'Loading…', detail: 'Parsing files and building tables…', loading: true };
    if (loadError) return { title: 'Error', detail: loadError };
    const tableCount = dataModel.order.length;
    const totalRows = dataModel.order.reduce((sum, name) => sum + ((dataModel.tables[name] || []).length), 0);
    const label = rawDataName || 'Dataset';
    if (tableCount === 0) {
      return { title: 'No data', detail: 'Upload a CSV or Excel file to get started.' };
    }
    return { title: 'Connected', detail: `${label} loaded with ${tableCount} tables and ${totalRows} rows.` };
  })();

  const selectedResult = getNodeResult(chainData, selectedNodeId);
  const selectedSchema = selectedResult?.schema || [];
  const selectedData = selectedResult?.sampleRows || selectedResult?.data || [];

  const renderModeLabels = {
    classic: 'Classic',
    entangled: 'Entangled',
    singleStream: 'Single stream',
    freeLayout: 'Free layout'
  };
  const renderModeMenu = useMemo(() => ({
    items: [
      { key: 'classic', label: 'Classic' },
      {
        key: 'entangled',
        label: (
          <Space size="small">
            <span>Entangled</span>
            <Tag color="gold">Beta</Tag>
          </Space>
        )
      },
      {
        key: 'singleStream',
        label: (
          <Space size="small">
            <span>Single stream</span>
            <Tag color="gold">Beta</Tag>
          </Space>
        )
      },
      {
        key: 'freeLayout',
        label: (
          <Space size="small">
            <span>Free layout</span>
            <Tag color="gold">Beta</Tag>
          </Space>
        )
      }
    ],
    selectable: true,
    selectedKeys: [renderMode],
    onClick: ({ key }) => setRenderMode(key)
  }), [renderMode]);

  const settingsMenu = useMemo(() => ({
    items: [
      {
        key: 'theme',
        type: 'group',
        label: 'Theme',
        children: [
          { key: 'theme:light', label: 'Light' },
          { key: 'theme:dark', label: 'Dark' },
          { key: 'theme:auto', label: 'Auto (system)' }
        ]
      },
      {
        key: 'density',
        type: 'group',
        label: 'Table density',
        children: [
          { key: 'density:comfortable', label: 'Less dense' },
          { key: 'density:dense', label: 'More dense' }
        ]
      }
    ],
    selectable: true,
    selectedKeys: [
      `theme:${themePreference || 'auto'}`,
      `density:${tableDensity || DEFAULT_TABLE_DENSITY}`
    ],
    onClick: ({ key }) => {
      if (key.startsWith('theme:')) {
        const nextTheme = key.replace('theme:', '');
        if (onThemeChange && (nextTheme === 'light' || nextTheme === 'dark' || nextTheme === 'auto')) {
          onThemeChange(nextTheme);
        }
        return;
      }
      if (key.startsWith('density:')) {
        const nextDensity = key.replace('density:', '');
        if (nextDensity === 'dense' || nextDensity === 'comfortable') {
          setTableDensity(nextDensity);
        }
      }
    }
  }), [themePreference, onThemeChange, tableDensity]);

  const dataModelCellPadding = tableDensity === 'dense' ? 'p-2' : 'p-3';
  const dataModelTextSize = tableDensity === 'dense' ? 'text-xs' : 'text-sm';
  const dataModelHeaderTextSize = tableDensity === 'dense' ? 'text-[11px]' : 'text-xs';
  const activeRenderModeLabel = renderModeLabels[renderMode] || 'Classic';

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100 overflow-hidden">
      {/* 1. LEFT SIDEBAR */}
      <div className="w-16 flex-shrink-0 bg-white flex flex-col items-center text-slate-500 border-r border-gray-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 z-50">
        <div className="w-full h-16 bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
          <Layout size={22} />
        </div>
        <div className="flex-1 w-full flex flex-col items-center py-6 gap-6">
          <div
            onClick={() => {
              setShowDataModel(false);
              setViewMode('landing');
            }}
            className={`p-2.5 rounded-lg cursor-pointer transition-colors relative group ${
              viewMode === 'landing' ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Explorations"
          >
            <AppsIcon size={20} />
          </div>
          <Dropdown menu={settingsMenu} trigger={['click']} placement="rightBottom">
            <div className="mt-auto p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors relative group">
              <Settings size={20} />
            </div>
          </Dropdown>
        </div>
      </div>

      {/* 2. MAIN CANVAS AREA */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-[#F8FAFC] dark:bg-slate-950">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 justify-between shadow-sm z-40 relative dark:bg-slate-900 dark:border-slate-700">
          <div className="flex items-center gap-4">
            <div>
              <div className="font-bold text-gray-900 text-lg dark:text-slate-100">Node Memory Analytics</div>
              <div className="text-xs text-gray-400 dark:text-slate-400">Exploration workspace</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {viewMode === 'canvas' && (
              <Space size="small" align="center">
                <Space.Compact size="middle">
                  <Button
                    icon={<Undo size={16} />}
                    onClick={undo}
                    disabled={historyIndex === 0}
                    aria-label="Undo"
                  />
                  <Button
                    icon={<Redo size={16} />}
                    onClick={redo}
                    disabled={historyIndex === history.length - 1}
                    aria-label="Redo"
                  />
                </Space.Compact>
                <Dropdown menu={renderModeMenu} trigger={['click']} placement="bottomRight">
                  <Button icon={<Layout size={14} />}>
                    {activeRenderModeLabel}
                  </Button>
                </Dropdown>
                <Button type="primary" icon={<Save size={14} />} onClick={saveExploration}>
                  Save & Exit
                </Button>
                {saveError && (
                  <Text type="danger" style={{ fontSize: 12 }}>
                    {saveError}
                  </Text>
                )}
              </Space>
            )}
          </div>
        </header>

        {viewMode === 'landing' ? (
          <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
            <div className="max-w-6xl mx-auto px-10 py-12 space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <Title level={2} style={{ margin: 0 }}>Explorations</Title>
                  <Text type="secondary">Pick up where you left off or start something new.</Text>
                </div>
                <Button type="primary" icon={<Plus size={14} />} onClick={startNewExploration}>
                  New Exploration
                </Button>
              </div>

              {explorations.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center shadow-sm dark:bg-slate-900 dark:border-slate-700">
                  <Empty
                    description={
                      <div className="space-y-1">
                        <div className="text-base font-semibold text-gray-900 dark:text-slate-100">No explorations yet</div>
                        <Text type="secondary">Upload data, build a workflow, then Save & Exit to see it here.</Text>
                      </div>
                    }
                  >
                    <Button type="primary" icon={<Plus size={14} />} onClick={startNewExploration}>
                      Create your first exploration
                    </Button>
                  </Empty>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {explorations.map((exp) => {
                    const order = exp.dataModel?.order || [];
                    const tableCount = exp.tableCount ?? order.length;
                    const rowCount = exp.rowCount ?? order.reduce((sum, name) => sum + ((exp.dataModel?.tables?.[name] || []).length), 0);
                    const updated = exp.updatedAt ? new Date(exp.updatedAt).toLocaleString() : '';
                    const updatedLabel = updated ? `Updated ${updated}` : 'Updated just now';
                    return (
                      <Card
                        key={exp.id}
                        size="small"
                        className="shadow-sm"
                        title={
                          <Text strong ellipsis={{ tooltip: exp.name || 'Exploration' }}>
                            {exp.name || 'Exploration'}
                          </Text>
                        }
                        extra={
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<Trash2 size={14} />}
                            onClick={() => deleteExploration(exp.id)}
                          >
                            Delete
                          </Button>
                        }
                      >
                        <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {updatedLabel}
                          </Text>
                          <Space size="small" wrap>
                            <Tag color="blue">{tableCount} tables</Tag>
                            <Tag>{rowCount} rows</Tag>
                          </Space>
                          <Button
                            type="primary"
                            block
                            icon={<Play size={14} />}
                            onClick={() => openExploration(exp)}
                          >
                            Open Exploration
                          </Button>
                        </Space>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className={renderMode === 'freeLayout'
              ? 'flex-1 overflow-hidden bg-[url(\'https://www.transparenttextures.com/patterns/cubes.png\')] bg-slate-50 dark:bg-slate-950 dark:bg-none'
              : 'flex-1 overflow-auto bg-[url(\'https://www.transparenttextures.com/patterns/cubes.png\')] bg-slate-50 dark:bg-slate-950 dark:bg-none cursor-grab active:cursor-grabbing'}
            onClick={() => {
              setShowAddMenuForId(null);
              setShowInsertMenuForId(null);
            }}
          >
            {renderMode === 'freeLayout' ? (
              <FreeLayoutCanvas
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                chainData={chainData}
                tableDensity={tableDensity}
                onSelect={handleSelect}
                onAdd={addNode}
                onInsert={insertNode}
                onRemove={removeNode}
                onToggleExpand={toggleNodeExpansion}
                onToggleBranch={toggleBranchCollapse}
                onDrillDown={handleChartDrillDown}
                onTableCellClick={handleTableCellClick}
                onTableSortChange={handleTableSortChange}
                onAssistantRequest={handleAssistantRequest}
                onAddFilter={addFilterToNode}
                onUpdateFilter={updateFilterOnNode}
                onRemoveFilter={removeFilterFromNode}
                onFilterCellAction={handleFilterCellAction}
                showAddMenuForId={showAddMenuForId}
                setShowAddMenuForId={setShowAddMenuForId}
                showInsertMenuForId={showInsertMenuForId}
                setShowInsertMenuForId={setShowInsertMenuForId}
                onUpdateNodePosition={updateNodePosition}
                onAutoLayout={applyAutoLayout}
                onEntangledColorChange={updateEntangledGroupColor}
                onRenameBranch={renameBranch}
              />
            ) : (
              <div className="min-w-full inline-flex justify-center p-20 items-start min-h-full">
                <TreeNode
                  nodeId="node-start"
                  nodes={nodes}
                  selectedNodeId={selectedNodeId}
                  chainData={chainData}
                  tableDensity={tableDensity}
                  onSelect={handleSelect}
                  onAdd={addNode}
                  onInsert={insertNode}
                  onRemove={removeNode}
                  onToggleExpand={toggleNodeExpansion}
                  onToggleBranch={toggleBranchCollapse}
                  onDrillDown={handleChartDrillDown}
                  onTableCellClick={handleTableCellClick}
                  onTableSortChange={handleTableSortChange}
                  onAssistantRequest={handleAssistantRequest}
                  onAddFilter={addFilterToNode}
                  onUpdateFilter={updateFilterOnNode}
                  onRemoveFilter={removeFilterFromNode}
                  onFilterCellAction={handleFilterCellAction}
                  showAddMenuForId={showAddMenuForId}
                  setShowAddMenuForId={setShowAddMenuForId}
                  showInsertMenuForId={showInsertMenuForId}
                  setShowInsertMenuForId={setShowInsertMenuForId}
                  renderMode={renderMode}
                  branchSelectionByNodeId={branchSelectionByNodeId}
                  onSelectBranch={setBranchSelection}
                  onRenameBranch={renameBranch}
                  onToggleEntangle={toggleEntangledBranch}
                  onEntangledColorChange={updateEntangledGroupColor}
                />
              </div>
            )}
          </div>
        )}

        {viewMode === 'canvas' && (isStatsCollapsed || isPropertiesCollapsed) && (
          <div className="absolute right-4 top-20 flex flex-col gap-2 z-40">
            {isStatsCollapsed && (
              <Button size="small" onClick={expandStatsPanel}>
                Show Stats
              </Button>
            )}
            {isPropertiesCollapsed && (
              <Button size="small" onClick={expandPropertiesPanel}>
                Show Properties
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 3. COLUMN STATS PANEL */}
      {viewMode === 'canvas' && !isStatsCollapsed && !isStatsDetached && (
        <ColumnStatsPanel
          node={nodes.find(n => n.id === selectedNodeId)}
          schema={selectedSchema}
          data={selectedData}
          rowCount={selectedResult?.rowCount || 0}
          getColumnStats={selectedResult?.getColumnStats}
          onCollapse={collapseStatsPanel}
          onToggleDetach={detachStatsPanel}
          isDetached={false}
        />
      )}

      {/* 4. PROPERTIES PANEL */}
      {viewMode === 'canvas' && !isPropertiesCollapsed && (
        <PropertiesPanel
          node={nodes.find(n => n.id === selectedNodeId)}
          updateNode={updateNodeFromPanel}
          schema={selectedSchema}
          data={selectedData}
          dataModel={dataModel}
          sourceStatus={sourceStatus}
          onIngest={ingestPendingFiles}
          onClearData={clearIngestedData}
          onShowDataModel={() => setShowDataModel(true)}
          onCollapse={collapsePropertiesPanel}
            activeFilterIndex={activeFilterTarget?.nodeId === selectedNodeId ? activeFilterTarget.index : null}
        />
      )}

      {viewMode === 'canvas' && isStatsDetached && !isStatsCollapsed && (
        <div
          className="fixed bg-white border border-gray-200 shadow-2xl rounded-xl overflow-hidden dark:bg-slate-900 dark:border-slate-700 z-50"
          style={{
            left: statsPanelRect.x,
            top: statsPanelRect.y,
            width: statsPanelRect.width,
            height: statsPanelRect.height
          }}
        >
          <ColumnStatsPanel
            node={nodes.find(n => n.id === selectedNodeId)}
            schema={selectedSchema}
            data={selectedData}
            rowCount={selectedResult?.rowCount || 0}
            getColumnStats={selectedResult?.getColumnStats}
            onCollapse={collapseStatsPanel}
            onToggleDetach={dockStatsPanel}
            isDetached
            dragHandleProps={{ onPointerDown: handleStatsDragStart }}
          />
          <div
            className="absolute bottom-1 right-1 h-3 w-3 cursor-se-resize bg-gray-200 rounded-sm dark:bg-slate-700"
            onPointerDown={handleStatsResizeStart}
          />
        </div>
      )}

      {/* 5. DATA MODEL MODAL */}
      <Modal
        open={showDataModel}
        onCancel={() => setShowDataModel(false)}
        footer={null}
        width={980}
        centered
        closeIcon={<X size={16} />}
        styles={{ body: { padding: 0 } }}
        title={
          <Space align="center">
            <div className="bg-blue-100 p-2 rounded text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
              <Database size={20} />
            </div>
            <div>
              <div className="font-bold text-base text-gray-900 dark:text-slate-100">Data Model Preview</div>
              <div className="text-xs text-gray-500 dark:text-slate-400">Available tables and schemas</div>
            </div>
          </Space>
        }
      >
        <div className="flex-1 overflow-auto p-8 bg-slate-50 dark:bg-slate-950">
          {dataModel.order.length === 0 ? (
            <Empty description="Upload a CSV/XLSX file to populate the data model." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {dataModel.order.map((tableName) => {
                const baseRow = (dataModel.tables[tableName] || [])[0] || {};
                const rows = Object.keys(baseRow).map((col) => ({
                  column: col,
                  sample: String(baseRow[col] ?? '')
                }));
                const sortState = dataModelSorts[tableName] || { sortBy: '', sortDirection: '' };
                const sortedRows = getSortedRows(rows, sortState.sortBy, sortState.sortDirection);
                const resolveIndicator = (columnKey) => {
                  if (sortState.sortBy !== columnKey) return '';
                  return sortState.sortDirection === 'asc' ? '^' : 'v';
                };
                return (
                  <Card
                    key={tableName}
                    size="small"
                    className="shadow-sm"
                    bodyStyle={{ padding: 0 }}
                    title={
                      <Space size="small">
                        <TableIcon size={16} className="text-gray-400 dark:text-slate-500" />
                        {tableName.toUpperCase()}
                      </Space>
                    }
                  >
                    <div className="p-0">
                      <table className={`w-full text-left ${dataModelTextSize}`}>
                        <thead className={`bg-gray-50 text-gray-500 uppercase dark:bg-slate-800 dark:text-slate-300 ${dataModelHeaderTextSize}`}>
                          <tr>
                            {['column', 'sample'].map((columnKey) => (
                              <th
                                key={columnKey}
                                role="button"
                                aria-sort={sortState.sortBy === columnKey
                                  ? (sortState.sortDirection === 'asc' ? 'ascending' : 'descending')
                                  : 'none'}
                                onClick={() => handleDataModelSort(tableName, columnKey)}
                                className={`${dataModelCellPadding} font-semibold cursor-pointer hover:text-blue-600 dark:hover:text-blue-300`}
                              >
                                <span className="inline-flex items-center gap-1">
                                  {columnKey === 'column' ? 'Column' : 'Sample'}
                                  {resolveIndicator(columnKey) && (
                                    <span className="text-[10px] text-gray-400 dark:text-slate-500">{resolveIndicator(columnKey)}</span>
                                  )}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                          {sortedRows.map((row) => (
                            <tr key={row.column}>
                              <td className={`${dataModelCellPadding} font-medium text-gray-700 dark:text-slate-200`}>{row.column}</td>
                              <td className={`${dataModelCellPadding} text-gray-400 dark:text-slate-400 truncate max-w-[100px]`}>{row.sample}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-auto p-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400">
                      {(dataModel.tables[tableName] || []).length} total records
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AnalysisApp;
