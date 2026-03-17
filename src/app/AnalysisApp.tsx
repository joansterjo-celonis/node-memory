import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Empty } from '@/components/ui/empty';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem
} from '@/components/ui/dropdown-menu';
import { ColumnStatsPanel } from '../components/ColumnStatsPanel';
import { PropertiesPanel } from '../components/PropertiesPanel';
import HelpModal from '../components/HelpModal';
import { GraphMinimapPanel } from '../components/GraphMinimapPanel';
import WorkbenchDependencyGraph from '../components/WorkbenchDependencyGraph';
import ExplorationAssetView from './assets/ExplorationAssetView';
import RawDatasetAssetView from './assets/RawDatasetAssetView';
import SqlTransformationAssetView from './assets/SqlTransformationAssetView';
import {
  Layout,
  LayoutClassic,
  LayoutClassicSmart,
  LayoutEntangled,
  LayoutEntangledSmart,
  LayoutSingleStream,
  LayoutMobile,
  LayoutFree,
  Database,
  AppsIcon,
  Settings,
  Undo,
  Redo,
  TableIcon,
  X,
  Plus,
  Play,
  Save,
  ArrowLeft,
  Edit as EditIcon,
  QuestionCircle,
  MoreHorizontal
} from '../ui/icons';
import { parseCSVFile, readFileAsArrayBuffer, parseXLSX, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../utils/ingest';
import { getChildren, getCalculationOrder, getNodeResult, buildLeafCountMap } from '../utils/nodeUtils';
import { createDataEngine, SQL_INCOMING_TABLE } from '../utils/dataEngine';
import { normalizeFilters } from '../utils/filterUtils';
import {
  TABLE_DENSITY_STORAGE_KEY,
  DEFAULT_TABLE_DENSITY,
  DEFAULT_ENTANGLED_COLOR,
  DEFAULT_INGESTION_MODE,
  DEFAULT_SQL_MODE,
  ASSET_TYPES,
  VALID_ASSET_TYPES,
  normalizeExplorationName,
  resolveAssetFallbackName,
  resolveAssetType,
  SESSION_STORAGE_KEY,
  SESSION_VERSION,
  VALID_VIEW_MODES,
  VALID_LANDING_VIEW_MODES,
  VALID_RENDER_MODES,
  isMobileUserAgent,
  readStoredTableDensity,
  sanitizeNodesForStorage,
  sanitizeHistoryForStorage,
  slugifySqlName,
  ensureUniqueSqlName,
  escapeRegExp,
  buildStableExternalTableName,
  buildLegacyExternalTableName,
  getLeafNodes,
  getDefaultStatsPanelRect,
  isValidStatsPanelRect,
  createInitialNodes,
  createInitialSqlNodes,
  readSessionState,
  writeSessionState,
  buildDefaultFreeLayout
} from './constants';

const AnalysisApp = ({ themePreference = 'auto', onThemeChange }: { themePreference?: string; resolvedTheme?: string; onThemeChange?: (theme: string) => void }) => {
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
  const [lineageFocusNodeId, setLineageFocusNodeId] = useState(null);
  const [showAddMenuForId, setShowAddMenuForId] = useState(null);
  const [showInsertMenuForId, setShowInsertMenuForId] = useState(null);
  const [showDataModel, setShowDataModel] = useState(initialSession?.showDataModel ?? false);
  const [showHelp, setShowHelp] = useState(false);
  const [viewMode, setViewMode] = useState(initialSession?.viewMode ?? 'canvas');
  const [landingViewMode, setLandingViewMode] = useState(initialSession?.landingViewMode ?? 'cards');
  const [flattenModalEntry, setFlattenModalEntry] = useState(null);
  const [isFlattenModalOpen, setIsFlattenModalOpen] = useState(false);
  const [deleteModalState, setDeleteModalState] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const shouldAutoMobile = useMemo(() => isMobileUserAgent(), []);
  const [renderMode, setRenderMode] = useState(() => (
    shouldAutoMobile ? 'mobile' : (initialSession?.renderMode ?? 'classic')
  ));
  const [dataModelSorts, setDataModelSorts] = useState(initialSession?.dataModelSorts ?? {});
  const [explorations, setExplorations] = useState([]);
  const [activeExplorationId, setActiveExplorationId] = useState(initialSession?.activeExplorationId ?? null);
  const [activeAssetType, setActiveAssetType] = useState(
    initialSession?.activeAssetType ?? ASSET_TYPES.EXPLORATION
  );
  const [sqlDraftText, setSqlDraftText] = useState('');
  const [sqlDraftInput, setSqlDraftInput] = useState('');
  const [sqlDraftError, setSqlDraftError] = useState('');
  const [sqlDraftMode, setSqlDraftMode] = useState('custom');
  const [sqlDraftJoinType, setSqlDraftJoinType] = useState('LEFT');
  const [sqlDraftRightTable, setSqlDraftRightTable] = useState('');
  const [sqlDraftLeftKey, setSqlDraftLeftKey] = useState('');
  const [sqlDraftRightKey, setSqlDraftRightKey] = useState('');

  useEffect(() => {
    if (activeAssetType !== ASSET_TYPES.SQL) return;
    const sourceNode = nodes.find((node) => node.type === 'SOURCE');
    const sqlNode = nodes.find((node) => node.type === 'JOIN');
    const nextParams = sqlNode?.params || {};
    setSqlDraftText(nextParams?.sqlText || '');
    setSqlDraftInput(sourceNode?.params?.inheritedTable || '');
    setSqlDraftMode(nextParams?.sqlMode || 'custom');
    setSqlDraftJoinType(nextParams?.joinType || 'LEFT');
    setSqlDraftRightTable(nextParams?.rightTable || '');
    setSqlDraftLeftKey(nextParams?.leftKey || '');
    setSqlDraftRightKey(nextParams?.rightKey || '');
    setSqlDraftError('');
  }, [activeAssetType, activeExplorationId, historyIndex]);
  const [draftExplorationName, setDraftExplorationName] = useState(null);
  const [draftExplorationDescription, setDraftExplorationDescription] = useState(null);
  const [editingExplorationId, setEditingExplorationId] = useState(null);
  const [editingExplorationNameDraft, setEditingExplorationNameDraft] = useState('');
  const [editingExplorationDescriptionId, setEditingExplorationDescriptionId] = useState(null);
  const [editingExplorationDescriptionDraft, setEditingExplorationDescriptionDraft] = useState('');
  const [isEditingActiveName, setIsEditingActiveName] = useState(false);
  const [activeNameDraft, setActiveNameDraft] = useState('');
  const [isEditingActiveDescription, setIsEditingActiveDescription] = useState(false);
  const [activeDescriptionDraft, setActiveDescriptionDraft] = useState('');
  const [graphPlacementHints, setGraphPlacementHints] = useState({});
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
  const explorationNameInputRef = useRef(null);
  const explorationDescriptionInputRef = useRef(null);
  const activeNameInputRef = useRef(null);
  const activeDescriptionInputRef = useRef(null);
  const skipExplorationNameCommitRef = useRef(false);
  const skipExplorationDescriptionCommitRef = useRef(false);
  const skipActiveNameCommitRef = useRef(false);
  const skipActiveDescriptionCommitRef = useRef(false);
  const nodeIdCounterRef = useRef(0);
  const filterIdCounterRef = useRef(0);
  const canvasScrollRef = useRef(null);
  const pendingCenterNodeRef = useRef(null);
  const isMobileMode = renderMode === 'mobile';
  const isSmartMode = renderMode === 'classicSmart' || renderMode === 'entangledSmart';
  const isMinimapMode = (
    renderMode === 'classic'
    || renderMode === 'classicSmart'
    || renderMode === 'entangled'
    || renderMode === 'entangledSmart'
  );
  const lineageVisibleNodeIds = useMemo(() => {
    if (!lineageFocusNodeId) return null;
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    if (!nodesById.has(lineageFocusNodeId)) return null;
    const ids = new Set();
    let currentId = lineageFocusNodeId;
    while (currentId && nodesById.has(currentId)) {
      ids.add(currentId);
      currentId = nodesById.get(currentId)?.parentId;
    }
    return ids;
  }, [nodes, lineageFocusNodeId]);
  const renderNodes = useMemo(
    () => (lineageVisibleNodeIds ? nodes.filter((node) => lineageVisibleNodeIds.has(node.id)) : nodes),
    [nodes, lineageVisibleNodeIds]
  );
  const leafCountById = useMemo(
    () => (isSmartMode ? buildLeafCountMap(renderNodes, { treatCollapsedAsLeaf: true }) : null),
    [renderNodes, isSmartMode]
  );

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

  useEffect(() => {
    if (editingExplorationId) {
      explorationNameInputRef.current?.focus?.();
    }
  }, [editingExplorationId]);

  useEffect(() => {
    if (editingExplorationDescriptionId) {
      explorationDescriptionInputRef.current?.focus?.();
    }
  }, [editingExplorationDescriptionId]);

  useEffect(() => {
    if (isEditingActiveName) {
      activeNameInputRef.current?.focus?.();
    }
  }, [isEditingActiveName]);

  useEffect(() => {
    if (isEditingActiveDescription) {
      activeDescriptionInputRef.current?.focus?.();
    }
  }, [isEditingActiveDescription]);

  useEffect(() => {
    if (!shouldAutoMobile) return;
    setIsStatsDetached(false);
    setIsStatsCollapsed(true);
    setIsPropertiesCollapsed(true);
  }, [shouldAutoMobile]);

  useEffect(() => {
    if (!isMobileMode) return;
    if (isStatsDetached) {
      setIsStatsDetached(false);
    }
  }, [isMobileMode, isStatsDetached]);

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
          setPendingFiles([]);

          // If SOURCE node has no table selected, set default silently.
          const defaultTable = model.order[0] || null;
          const sourceNode = nodes.find(n => n.id === 'node-start');
          if (sourceNode) {
            const nextParams = { ...sourceNode.params, __files: [] };
            if (defaultTable) {
              nextParams.table = defaultTable;
            }
            updateNode('node-start', nextParams, false, true);
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

  const collectAncestorIds = (nodeId, nodesList = nodes) => {
    const ids = new Set();
    let current = findNodeById(nodeId, nodesList);
    while (current?.parentId) {
      const parent = findNodeById(current.parentId, nodesList);
      if (!parent || ids.has(parent.id)) break;
      ids.add(parent.id);
      current = parent;
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
  const normalizeAssetEntry = (entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const hasRawSnapshot = !!entry.datasetSnapshot;
    const hasSqlSnapshot = !!entry.sqlSnapshot || !!entry.sqlText || !!entry.sqlInputTable;
    let inferred = null;
    if (hasRawSnapshot) inferred = ASSET_TYPES.RAW_DATASET;
    if (hasSqlSnapshot) inferred = ASSET_TYPES.SQL;
    const existingType = VALID_ASSET_TYPES.has(entry.assetType) ? entry.assetType : null;
    let resolved = existingType || inferred || ASSET_TYPES.EXPLORATION;
    if (inferred && (!existingType || existingType === ASSET_TYPES.EXPLORATION)) {
      resolved = inferred;
    }
    if (resolved === entry.assetType) return entry;
    return { ...entry, assetType: resolved };
  };
  const loadExplorations = () => {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const raw = window.localStorage.getItem(EXPLORATION_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeAssetEntry) : [];
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
    if (!activeExplorationId) return;
    const target = explorations.find((item) => item.id === activeExplorationId);
    if (!target) return;
    const nextType = resolveAssetType(target);
    if (nextType !== activeAssetType) {
      setActiveAssetType(nextType);
    }
  }, [activeExplorationId, activeAssetType, explorations, resolveAssetType]);

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
        landingViewMode,
        dataModelSorts,
        branchSelectionByNodeId,
        isStatsCollapsed,
        isStatsDetached,
        statsPanelRect,
        isPropertiesCollapsed,
        showDataModel,
        activeExplorationId,
        activeAssetType
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
    landingViewMode,
    dataModelSorts,
    branchSelectionByNodeId,
    isStatsCollapsed,
    isStatsDetached,
    statsPanelRect,
    isPropertiesCollapsed,
    showDataModel,
    activeExplorationId,
    activeAssetType
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

  const buildNodeSpec = useCallback((node, parentKey, model) => {
    if (node.params?.isDataset && node.params?.isFlattened && Array.isArray(node.params?.datasetSnapshot?.rows)) {
      return { type: 'DATASET', params: { snapshot: node.params.datasetSnapshot } };
    }
    if (node.type === 'SOURCE') {
      const ingestionMode = node.params?.ingestionMode || DEFAULT_INGESTION_MODE;
      const inheritedTable = node.params?.inheritedTable || '';
      const table = ingestionMode === 'inherited'
        ? inheritedTable
        : (node.params?.table || model?.order?.[0]);
      return { type: 'SOURCE', table };
    }
    if (node.type === 'FILTER') {
      return { type: 'FILTER', parentId: node.parentId, parentKey, params: node.params };
    }
    if (node.type === 'AGGREGATE') {
      return { type: 'AGGREGATE', parentId: node.parentId, parentKey, params: node.params };
    }
    if (node.type === 'JOIN') {
      return { type: 'JOIN', parentId: node.parentId, parentKey, params: node.params };
    }
    return { type: 'FILTER', parentId: node.parentId, parentKey, params: {} };
  }, []);

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

  const ingestPendingFiles = (filesOverride) => {
    const filesToIngest = Array.isArray(filesOverride) && filesOverride.length > 0
      ? filesOverride
      : pendingFiles;
    if (!filesToIngest || filesToIngest.length === 0) {
      setLoadError('Please select one or more files to ingest.');
      return;
    }
    const oversizeFile = findOversizeFile(filesToIngest);
    if (oversizeFile) {
      setLoadError(`${oversizeFile.name || 'A file'} exceeds the ${MAX_UPLOAD_MB} MB per-file limit.`);
      return;
    }
    const totalBytes = getTotalFileBytes(filesToIngest);
    if (totalBytes > MAX_UPLOAD_BYTES) {
      setLoadError(`Total upload size exceeds ${MAX_UPLOAD_MB} MB limit.`);
      return;
    }
    setLoadError(null);
    if (Array.isArray(filesOverride) && filesOverride.length > 0) {
      setPendingFiles(filesToIngest);
    }
    setSelectedFiles([...filesToIngest]);
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
  const externalTableRegistry = useMemo(() => {
    const allByName = {};
    const allList = [];
    const datasets = [];
    const assetTables = [];
    const rawDatasetEntries = [];
    const sqlAssetEntries = [];
    const legacyUsedNames = new Set();
    const explorationMetaList = [];
    const explorationAssets = (explorations || []).filter((exp) => resolveAssetType(exp) === ASSET_TYPES.EXPLORATION);
    const rawDatasetAssets = (explorations || []).filter((exp) => resolveAssetType(exp) === ASSET_TYPES.RAW_DATASET);
    const sqlAssets = (explorations || []).filter((exp) => resolveAssetType(exp) === ASSET_TYPES.SQL);

    explorationAssets.forEach((exp) => {
      if (!exp) return;
      const nodesList = Array.isArray(exp.nodes) ? exp.nodes : [];
      if (nodesList.length === 0) return;
      const model = exp.dataModel || { tables: {}, order: [] };
      const leafNodes = getLeafNodes(nodesList);
      if (leafNodes.length === 0) return;
      const displayExpName = exp.name || exp.rawDataName || 'Exploration';
      const legacyExpName = exp.name || exp.rawDataName || 'Workbench';

      explorationMetaList.push({
        exp,
        nodesList,
        model,
        leafNodes,
        displayExpName,
        legacyExpName
      });

      leafNodes.forEach((leaf, index) => {
        const branchLabel = leaf.branchName || leaf.title || `Branch ${index + 1}`;
        const nodeTitle = leaf.title || branchLabel || 'Dataset';
        const displayName = `${displayExpName} / ${nodeTitle}`;
        const stableName = buildStableExternalTableName(exp.id, leaf.id);
        const legacyName = buildLegacyExternalTableName(legacyExpName, branchLabel, legacyUsedNames);
        const snapshot = leaf.params?.datasetSnapshot;
        const isDataset = !!leaf.params?.isDataset;
        const isFlattened = isDataset && !!leaf.params?.isFlattened && Array.isArray(snapshot?.rows);
        const resolvedRows = isFlattened ? snapshot.rows : [];
        const resolvedSchema = isFlattened
          ? (Array.isArray(snapshot?.schema) && snapshot.schema.length > 0
            ? snapshot.schema
            : (Array.isArray(snapshot?.rows) && snapshot.rows.length > 0
              ? Object.keys(snapshot.rows[0] || {})
              : []))
          : [];
        const resolvedRowCount = isFlattened
          ? (Number.isFinite(snapshot?.rowCount) ? snapshot.rowCount : resolvedRows.length)
          : 0;
        const entry = {
          name: stableName,
          legacyName,
          label: displayName,
          rows: resolvedRows,
          schema: resolvedSchema,
          rowCount: resolvedRowCount,
          assetType: ASSET_TYPES.EXPLORATION,
          assetId: exp.id,
          explorationId: exp.id,
          explorationName: displayExpName,
          explorationDescription: exp.description || '',
          explorationUpdatedAt: exp.updatedAt,
          nodeId: leaf.id,
          nodeTitle,
          branchName: leaf.branchName || '',
          isDataset,
          isFlattened,
          datasetName: nodeTitle
        };
        allByName[stableName] = entry;
        if (legacyName && !allByName[legacyName]) {
          allByName[legacyName] = entry;
        }
        allList.push(entry);
        if (entry.isDataset) {
          datasets.push(entry);
          assetTables.push(entry);
        }
      });
    });

    const registerEntry = (entry) => {
      if (!entry || !entry.name) return;
      allByName[entry.name] = entry;
      if (entry.legacyName && !allByName[entry.legacyName]) {
        allByName[entry.legacyName] = entry;
      }
      allList.push(entry);
    };

    rawDatasetAssets.forEach((asset) => {
      if (!asset?.id) return;
      const nodesList = Array.isArray(asset.nodes) ? asset.nodes : [];
      const sourceNode = nodesList.find((node) => node.type === 'SOURCE') || nodesList[0];
      const snapshot = asset.datasetSnapshot || {};
      const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
      const schema = Array.isArray(snapshot.schema)
        ? snapshot.schema
        : (rows.length > 0 ? Object.keys(rows[0] || {}) : []);
      const rowCount = Number.isFinite(snapshot.rowCount) ? snapshot.rowCount : rows.length;
      const label = asset.name || asset.rawDataName || 'Raw dataset';
      const nodeId = sourceNode?.id || 'node-start';
      const entry = {
        name: buildStableExternalTableName(asset.id, nodeId),
        legacyName: null,
        label,
        rows,
        schema,
        rowCount,
        assetType: ASSET_TYPES.RAW_DATASET,
        assetId: asset.id,
        assetName: asset.name || '',
        assetDescription: asset.description || '',
        assetUpdatedAt: asset.updatedAt,
        nodeId,
        nodeTitle: label,
        isDataset: true,
        isFlattened: true,
        datasetName: label
      };
      registerEntry(entry);
      assetTables.push(entry);
      rawDatasetEntries.push(entry);

      const model = asset.dataModel || { tables: {}, order: [] };
      const tableOrder = Array.isArray(model.order) ? model.order : [];
      if (tableOrder.length > 1) {
        tableOrder.forEach((tableName) => {
          const tableRows = Array.isArray(model.tables?.[tableName]) ? model.tables[tableName] : [];
          const tableSchema = tableRows.length > 0 ? Object.keys(tableRows[0] || {}) : [];
          const tableEntry = {
            name: buildStableExternalTableName(asset.id, `table_${tableName}`),
            legacyName: null,
            label: `${label} / ${tableName}`,
            rows: tableRows,
            schema: tableSchema,
            rowCount: tableRows.length,
            assetType: ASSET_TYPES.RAW_DATASET,
            assetId: asset.id,
            assetName: asset.name || '',
            assetDescription: asset.description || '',
            assetUpdatedAt: asset.updatedAt,
            nodeId: `table:${tableName}`,
            nodeTitle: tableName,
            isDataset: false,
            isFlattened: true,
            isAssetTable: true,
            datasetName: tableName
          };
          registerEntry(tableEntry);
        });
      }
    });

    sqlAssets.forEach((asset) => {
      if (!asset?.id) return;
      const nodesList = Array.isArray(asset.nodes) ? asset.nodes : [];
      const sqlNode = nodesList.find((node) => node.type === 'JOIN') || nodesList[0];
      const nodeId = sqlNode?.id || 'node-sql';
      const snapshot = asset.sqlSnapshot || {};
      const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
      const schema = Array.isArray(snapshot.schema)
        ? snapshot.schema
        : (rows.length > 0 ? Object.keys(rows[0] || {}) : []);
      const rowCount = Number.isFinite(snapshot.rowCount) ? snapshot.rowCount : rows.length;
      const label = asset.name || 'SQL transformation';
      const entry = {
        name: buildStableExternalTableName(asset.id, nodeId),
        legacyName: null,
        label,
        rows,
        schema,
        rowCount,
        assetType: ASSET_TYPES.SQL,
        assetId: asset.id,
        assetName: asset.name || '',
        assetDescription: asset.description || '',
        assetUpdatedAt: asset.updatedAt,
        nodeId,
        nodeTitle: label,
        isDataset: true,
        isFlattened: true,
        datasetName: label
      };
      registerEntry(entry);
      assetTables.push(entry);
      sqlAssetEntries.push(entry);
    });

    const entryByKey = new Map();
    allList.forEach((entry) => {
      if (entry?.explorationId && entry?.nodeId) {
        entryByKey.set(`${entry.explorationId}:${entry.nodeId}`, entry);
      }
    });

    const externalNameEntries = Object.entries(allByName).map(([name, entry]) => ({
      name,
      entry
    }));
    const getEntryOwnerId = (entry) => entry?.assetId || entry?.explorationId || null;
    const buildSqlMatchers = (ownerId) => (
      externalNameEntries
        .filter(({ entry }) => {
          const entryOwnerId = getEntryOwnerId(entry);
          return entryOwnerId && entryOwnerId !== ownerId;
        })
        .map(({ name, entry }) => ({
          entry,
          regex: new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i')
        }))
    );

    explorationMetaList.forEach(({ exp, nodesList, leafNodes }) => {
      if (!exp?.id) return;
      const nodesById = new Map(nodesList.map((node) => [node.id, node]));
      const sqlMatchers = buildSqlMatchers(exp.id);

      leafNodes.forEach((leaf) => {
        if (!leaf?.params?.isDataset) return;
        const key = `${exp.id}:${leaf.id}`;
        const entry = entryByKey.get(key);
        if (!entry) return;
        if (entry.isFlattened) {
          entry.dependencies = [];
          return;
        }
        const depsByKey = new Map();
        const addDependency = (depEntry) => {
          if (!depEntry?.name) return;
          const depOwnerId = getEntryOwnerId(depEntry);
          if (!depOwnerId || depOwnerId === exp.id) return;
          depsByKey.set(depEntry.name, depEntry);
        };
        let current = leaf;
        while (current) {
          if (current.type === 'SOURCE' && current.params?.ingestionMode === 'inherited') {
            const tableName = current.params?.inheritedTable || '';
            const depEntry = tableName ? allByName[tableName] : null;
            addDependency(depEntry);
          }
          if (current.type === 'JOIN') {
            const sqlMode = current.params?.sqlMode || 'visual';
            if (sqlMode === 'custom') {
              const sqlText = String(current.params?.sqlText || '');
              if (sqlText) {
                sqlMatchers.forEach(({ entry: depEntry, regex }) => {
                  if (regex.test(sqlText)) {
                    addDependency(depEntry);
                  }
                });
              }
            } else {
              const tableName = current.params?.rightTable || '';
              const depEntry = tableName ? allByName[tableName] : null;
              addDependency(depEntry);
            }
          }
          current = current.parentId ? nodesById.get(current.parentId) : null;
        }
        entry.dependencies = Array.from(depsByKey.values()).map((depEntry) => ({
          name: depEntry.name,
          label: depEntry.nodeTitle || depEntry.label,
          assetType: depEntry.assetType,
          assetId: depEntry.assetId || depEntry.explorationId,
          explorationName: depEntry.explorationName,
          explorationId: depEntry.explorationId,
          nodeId: depEntry.nodeId,
          nodeTitle: depEntry.nodeTitle,
          isDataset: depEntry.isDataset
        }));
      });
    });

    const dependenciesByExpId = new Map();
    explorationMetaList.forEach(({ exp, nodesList }) => {
      if (!exp?.id) return;
      const deps = new Set();
      const sqlMatchers = buildSqlMatchers(exp.id);
      nodesList.forEach((node) => {
        if (node.type === 'SOURCE' && node.params?.ingestionMode === 'inherited') {
          const tableName = node.params?.inheritedTable || '';
          const depEntry = tableName ? allByName[tableName] : null;
          const depOwnerId = getEntryOwnerId(depEntry);
          if (depOwnerId && depOwnerId !== exp.id) {
            deps.add(depOwnerId);
          }
        }
        if (node.type === 'JOIN') {
          const sqlMode = node.params?.sqlMode || 'visual';
          if (sqlMode === 'custom') {
            const sqlText = String(node.params?.sqlText || '');
            if (sqlText) {
              sqlMatchers.forEach(({ entry: depEntry, regex }) => {
                const depOwnerId = getEntryOwnerId(depEntry);
                if (regex.test(sqlText) && depOwnerId && depOwnerId !== exp.id) {
                  deps.add(depOwnerId);
                }
              });
            }
          } else {
            const tableName = node.params?.rightTable || '';
            const depEntry = tableName ? allByName[tableName] : null;
            const depOwnerId = getEntryOwnerId(depEntry);
            if (depOwnerId && depOwnerId !== exp.id) {
              deps.add(depOwnerId);
            }
          }
        }
      });
      dependenciesByExpId.set(exp.id, deps);
    });

    const metaById = new Map(explorationMetaList.map((meta) => [meta.exp.id, meta]));
    const indegree = new Map();
    const dependentsByExpId = new Map();
    explorationMetaList.forEach(({ exp }) => {
      if (exp?.id) indegree.set(exp.id, 0);
    });
    dependenciesByExpId.forEach((deps, expId) => {
      deps.forEach((depId) => {
        if (!indegree.has(depId) || !indegree.has(expId)) return;
        indegree.set(expId, (indegree.get(expId) || 0) + 1);
        const list = dependentsByExpId.get(depId) || [];
        list.push(expId);
        dependentsByExpId.set(depId, list);
      });
    });

    const queue = [];
    indegree.forEach((count, expId) => {
      if (count === 0) queue.push(expId);
    });
    const orderedIds = [];
    while (queue.length > 0) {
      const currentId = queue.shift();
      orderedIds.push(currentId);
      const dependents = dependentsByExpId.get(currentId) || [];
      dependents.forEach((depId) => {
        const nextCount = (indegree.get(depId) || 0) - 1;
        indegree.set(depId, nextCount);
        if (nextCount === 0) queue.push(depId);
      });
    }
    explorationMetaList.forEach(({ exp }) => {
      if (!exp?.id) return;
      if (!orderedIds.includes(exp.id)) {
        orderedIds.push(exp.id);
      }
    });

    orderedIds
      .map((expId) => metaById.get(expId))
      .filter(Boolean)
      .forEach(({ exp, nodesList, model, leafNodes }) => {
        if (!exp?.id) return;
        const externalTables = Object.entries(allByName).reduce((acc, [name, extEntry]) => {
          if (extEntry?.explorationId && extEntry.explorationId !== exp.id) {
            acc[name] = extEntry;
          }
          return acc;
        }, {});
        const engine = createDataEngine(model, { externalTables });
        const order = getCalculationOrder(nodesList);
        order.forEach((node) => {
          const parentKey = node.parentId ? engine.getQueryKey(node.parentId) : '';
          const spec = buildNodeSpec(node, parentKey, model);
          engine.ensureQuery(node.id, spec);
        });
        leafNodes.forEach((leaf) => {
          const entryKey = `${exp.id}:${leaf.id}`;
          const entry = entryByKey.get(entryKey);
          if (!entry || entry.isFlattened) return;
          const rowCount = engine.getRowCount(leaf.id);
          const rows = engine.getRows(leaf.id, { start: 0, size: rowCount });
          const schema = engine.getSchema(leaf.id);
          entry.rows = rows;
          entry.schema = schema;
          entry.rowCount = rowCount;
        });
      });

    const externalList = allList.filter((entry) => {
      const ownerId = getEntryOwnerId(entry);
      return ownerId ? ownerId !== activeExplorationId : true;
    });
    const externalByName = externalList.reduce((acc, entry) => {
      acc[entry.name] = entry;
      if (entry.legacyName && !acc[entry.legacyName]) {
        acc[entry.legacyName] = entry;
      }
      return acc;
    }, {});
    allList.sort((a, b) => a.label.localeCompare(b.label));
    externalList.sort((a, b) => a.label.localeCompare(b.label));
    datasets.sort((a, b) => (b.explorationUpdatedAt || '').localeCompare(a.explorationUpdatedAt || ''));
    assetTables.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    rawDatasetEntries.sort((a, b) => (b.assetUpdatedAt || '').localeCompare(a.assetUpdatedAt || ''));
    sqlAssetEntries.sort((a, b) => (b.assetUpdatedAt || '').localeCompare(a.assetUpdatedAt || ''));
    return {
      byName: externalByName,
      list: externalList,
      datasets,
      assetTables,
      rawDatasetEntries,
      sqlAssetEntries,
      allList,
      allByName,
      dependenciesByExpId,
      dependentsByExpId
    };
  }, [explorations, activeExplorationId, buildNodeSpec]);

  const dataEngine = useMemo(
    () => createDataEngine(dataModel, { externalTables: externalTableRegistry.byName }),
    [dataModel, externalTableRegistry.byName]
  );

  const chainData = useMemo(() => {
    const order = getCalculationOrder(nodes);
    const results = [];
    const validIds = new Set(nodes.map((node) => node.id));

    order.forEach((node) => {
      const parentKey = node.parentId ? dataEngine.getQueryKey(node.parentId) : '';
      let spec = null;

      spec = buildNodeSpec(node, parentKey, dataModel);

      const query = dataEngine.ensureQuery(node.id, spec);
      const sampleRows = dataEngine.getSampleRows(node.id, dataEngine.DEFAULT_SAMPLE_SIZE);

      results.push({
        nodeId: node.id,
        queryId: node.id,
        schema: query.schema || [],
        rowCount: query.rowCount || 0,
        error: query.error || '',
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
    tableShowStats: false,
    target: 100,
    joinType: 'LEFT',
    sqlMode: DEFAULT_SQL_MODE,
    sqlText: '',
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
    assistantPlan: [],
    ingestionMode: DEFAULT_INGESTION_MODE,
    inheritedTable: '',
    isDataset: false,
    datasetName: '',
    isFlattened: false,
    datasetSnapshot: null
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
    JOIN: 'SQL'
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

  const centerNodeInView = useCallback((nodeId) => {
    const container = canvasScrollRef.current;
    if (!container || !nodeId) return;
    const attemptCenter = (attempts) => {
      const nodeEl = container.querySelector(`[data-node-id="${nodeId}"]`);
      if (!nodeEl) {
        if (attempts < 3) {
          requestAnimationFrame(() => attemptCenter(attempts + 1));
        }
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const nodeRect = nodeEl.getBoundingClientRect();
      const offsetLeft = nodeRect.left - containerRect.left + container.scrollLeft;
      const offsetTop = nodeRect.top - containerRect.top + container.scrollTop;
      const targetLeft = offsetLeft + nodeRect.width / 2 - containerRect.width / 2;
      const targetTop = offsetTop + nodeRect.height / 2 - containerRect.height / 2;
      const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const nextLeft = Math.min(maxLeft, Math.max(0, targetLeft));
      const nextTop = Math.min(maxTop, Math.max(0, targetTop));
      container.scrollTo({ left: nextLeft, top: nextTop, behavior: 'smooth' });
    };
    attemptCenter(0);
  }, []);

  const handleSelect = (id, options = {}) => {
    const { expand = true, center = false } = options || {};
    if (center) {
      pendingCenterNodeRef.current = id;
    }
    setSelectedNodeId(id);
    if (!expand && !center) return;
    const ancestorIds = center ? collectAncestorIds(id) : null;
    const newNodes = nodes.map((node) => {
      if (node.id === id) {
        const nextNode = { ...node };
        if (expand) nextNode.isExpanded = true;
        if (center) nextNode.isBranchCollapsed = false;
        return nextNode;
      }
      if (center && ancestorIds?.has(node.id) && node.isBranchCollapsed) {
        return { ...node, isBranchCollapsed: false };
      }
      return node;
    });
    const newHistory = [...history];
    newHistory[historyIndex] = newNodes;
    setHistory(newHistory);
  };

  useEffect(() => {
    if (!pendingCenterNodeRef.current) return;
    const targetId = pendingCenterNodeRef.current;
    pendingCenterNodeRef.current = null;
    const frame = requestAnimationFrame(() => centerNodeInView(targetId));
    return () => cancelAnimationFrame(frame);
  }, [selectedNodeId, nodes, centerNodeInView]);

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

  const toggleDatasetForNode = useCallback((nodeId) => {
    if (!nodeId) return;
    const target = findNodeById(nodeId);
    if (!target) return;
    const nextIsDataset = !target.params?.isDataset;
    const idsToUpdate = new Set([nodeId]);
    if (target.entangledPeerId) idsToUpdate.add(target.entangledPeerId);
    const nextNodes = nodes.map((node) => {
      if (!idsToUpdate.has(node.id)) return node;
      const nextParams = {
        ...node.params,
        isDataset: nextIsDataset,
        isFlattened: nextIsDataset ? node.params?.isFlattened === true : false,
        datasetSnapshot: nextIsDataset ? node.params?.datasetSnapshot || null : null
      };
      return { ...node, params: nextParams };
    });
    updateNodes(nextNodes);
  }, [nodes, findNodeById, updateNodes]);

  const registerGraphPlacementHint = useCallback((targetId, sourceId) => {
    if (!targetId || !sourceId) return;
    setGraphPlacementHints((prev) => ({
      ...prev,
      [targetId]: sourceId
    }));
  }, []);

  const flattenDatasetEntry = useCallback((entry) => {
    if (!entry?.explorationId || !entry?.nodeId) return;
    const exp = explorations.find((item) => item.id === entry.explorationId);
    if (!exp) return;
    const nodesList = Array.isArray(exp.nodes) ? exp.nodes : [];
    if (nodesList.length === 0) return;
    const nodesById = new Map(nodesList.map((node) => [node.id, node]));
    const model = exp.dataModel || { tables: {}, order: [] };
    const externalTables = Object.entries(externalTableRegistry.allByName || {}).reduce((acc, [name, extEntry]) => {
      if (extEntry?.explorationId && extEntry.explorationId !== exp.id) {
        acc[name] = extEntry;
      }
      return acc;
    }, {});
    const engine = createDataEngine(model, { externalTables });
    const order = getCalculationOrder(nodesList);
    order.forEach((node) => {
      const parentKey = node.parentId ? engine.getQueryKey(node.parentId) : '';
      const spec = buildNodeSpec(node, parentKey, model);
      engine.ensureQuery(node.id, spec);
    });
    const rowCount = engine.getRowCount(entry.nodeId);
    const rows = engine.getRows(entry.nodeId, { start: 0, size: rowCount });
    const schema = engine.getSchema(entry.nodeId);
    const snapshot = {
      rows,
      schema,
      rowCount,
      createdAt: new Date().toISOString()
    };
    const datasetName = entry.datasetName || entry.nodeTitle || 'Dataset';
    const datasetCount = getLeafNodes(nodesList).filter((leaf) => leaf.params?.isDataset).length;
    const buildLineageNodes = () => {
      const lineageIds = new Set();
      let currentId = entry.nodeId;
      while (currentId && nodesById.has(currentId)) {
        lineageIds.add(currentId);
        const current = nodesById.get(currentId);
        currentId = current?.parentId;
      }
      return nodesList
        .filter((node) => lineageIds.has(node.id))
        .map((node) => {
          let nextNode = node;
          if (node.id === entry.nodeId) {
            nextNode = {
              ...node,
              title: datasetName,
              params: {
                ...node.params,
                isDataset: true,
                isFlattened: true,
                datasetName,
                datasetSnapshot: snapshot
              }
            };
          }
          if (nextNode.entangledPeerId && !lineageIds.has(nextNode.entangledPeerId)) {
            nextNode = {
              ...nextNode,
              entangledPeerId: undefined,
              entangledRootId: undefined,
              entangledColor: undefined
            };
          }
          return nextNode;
        });
    };
    if (datasetCount > 1) {
      const lineageNodes = buildLineageNodes();
      const now = new Date().toISOString();
      const stats = getExplorationStats(exp.dataModel || { tables: {}, order: [] });
      const newExplorationId = `exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const oldGraphId = `dataset:${entry.explorationId}:${entry.nodeId}`;
      const newGraphId = `dataset:${newExplorationId}:${entry.nodeId}`;
      const nextEntry = {
        id: newExplorationId,
        name: datasetName,
        description: '',
        createdAt: now,
        updatedAt: now,
        nodes: sanitizeNodesForStorage(lineageNodes),
        dataModel: exp.dataModel || { tables: {}, order: [] },
        rawDataName: datasetName,
        tableCount: stats.tableCount,
        rowCount: stats.rowCount,
        isFlattenedDataset: true
      };
      setExplorations((prev) => {
        const targetIndex = prev.findIndex(item => item.id === entry.explorationId);
        if (targetIndex === -1) {
          const nextExplorations = [nextEntry, ...prev];
          try {
            persistExplorations(nextExplorations);
          } catch (err) {
            // Ignore storage errors on flatten.
          }
          return nextExplorations;
        }
        const target = prev[targetIndex];
        const targetNodes = Array.isArray(target.nodes) ? target.nodes : [];
        let changed = false;
        const nextNodes = targetNodes.map((node) => {
          if (node.id !== entry.nodeId) return node;
          changed = true;
          const nextParams = {
            ...node.params,
            isDataset: false,
            isFlattened: false,
            datasetSnapshot: null
          };
          return { ...node, params: nextParams };
        });
        const nextTarget = changed
          ? { ...target, nodes: nextNodes, updatedAt: now }
          : target;
        const next = [...prev];
        next[targetIndex] = nextTarget;
        const nextExplorations = [nextEntry, ...next];
        try {
          persistExplorations(nextExplorations);
        } catch (err) {
          // Ignore storage errors on flatten.
        }
        if (changed && activeExplorationId === target.id) {
          replaceCurrentNodes(nextNodes);
        }
        return nextExplorations;
      });
      registerGraphPlacementHint(newGraphId, oldGraphId);
      return;
    }
    const lineageNodes = buildLineageNodes();
    const now = new Date().toISOString();
    const nextExplorations = explorations.map((item) => {
      if (item.id !== exp.id) return item;
      return {
        ...item,
        name: datasetName,
        description: '',
        rawDataName: datasetName,
        isFlattenedDataset: true,
        nodes: lineageNodes,
        updatedAt: now
      };
    });
    try {
      persistExplorations(nextExplorations);
    } catch (err) {
      // Ignore storage errors on flatten.
    }
    setExplorations(nextExplorations);
    if (activeExplorationId === exp.id) {
      updateNodes(lineageNodes);
      setRawDataName(datasetName);
    }
  }, [
    explorations,
    externalTableRegistry.allByName,
    activeExplorationId,
    buildNodeSpec,
    registerGraphPlacementHint,
    replaceCurrentNodes,
    updateNodes
  ]);

  const openFlattenModal = useCallback((entry) => {
    if (!entry || entry.isFlattened) return;
    setFlattenModalEntry(entry);
    setIsFlattenModalOpen(true);
  }, []);

  const closeFlattenModal = useCallback(() => {
    setIsFlattenModalOpen(false);
    setFlattenModalEntry(null);
  }, []);

  const confirmFlattenModal = useCallback(() => {
    if (flattenModalEntry) {
      flattenDatasetEntry(flattenModalEntry);
    }
    closeFlattenModal();
  }, [flattenDatasetEntry, flattenModalEntry, closeFlattenModal]);

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

  const runSqlDraft = useCallback(() => {
    const sourceNode = nodes.find((node) => node.type === 'SOURCE');
    const sqlNode = nodes.find((node) => node.type === 'JOIN');
    if (!sourceNode || !sqlNode) return;
    const nextInput = String(sqlDraftInput || '').trim();
    const nextSqlText = String(sqlDraftText || '').trim();
    const nextMode = sqlDraftMode || 'custom';
    if (!nextInput) {
      setSqlDraftError('Select an input dataset to run SQL.');
      return;
    }
    if (nextMode === 'custom' && !nextSqlText) {
      setSqlDraftError('Enter a SQL query to run.');
      return;
    }
    if (nextMode === 'visual') {
      if (!sqlDraftRightTable) {
        setSqlDraftError('Select a table to join.');
        return;
      }
      if (!sqlDraftLeftKey || !sqlDraftRightKey) {
        setSqlDraftError('Select join keys for both tables.');
        return;
      }
    }
    setSqlDraftError('');
    const visualSqlPreview = `SELECT * FROM ${SQL_INCOMING_TABLE}\n${sqlDraftJoinType || 'LEFT'} JOIN ${sqlDraftRightTable || '?'}\nON ${SQL_INCOMING_TABLE}.${sqlDraftLeftKey || '?'} = ${sqlDraftRightTable || '?'}.${sqlDraftRightKey || '?'}`;
    const nextNodes = nodes.map((node) => {
      if (node.id === sourceNode.id) {
        return {
          ...node,
          params: {
            ...node.params,
            ingestionMode: 'inherited',
            inheritedTable: nextInput
          }
        };
      }
      if (node.id === sqlNode.id) {
        return {
          ...node,
          params: {
            ...node.params,
            sqlMode: nextMode,
            sqlText: nextMode === 'visual' ? visualSqlPreview : nextSqlText,
            joinType: sqlDraftJoinType || node.params?.joinType || 'LEFT',
            rightTable: sqlDraftRightTable || node.params?.rightTable || '',
            leftKey: sqlDraftLeftKey || node.params?.leftKey || '',
            rightKey: sqlDraftRightKey || node.params?.rightKey || ''
          }
        };
      }
      return node;
    });
    updateNodes(nextNodes);
    setSelectedNodeId(sqlNode.id);
  }, [
    nodes,
    sqlDraftInput,
    sqlDraftText,
    sqlDraftMode,
    sqlDraftJoinType,
    sqlDraftRightTable,
    sqlDraftLeftKey,
    sqlDraftRightKey,
    updateNodes
  ]);

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

  const normalizeExplorationDescription = (value) => (
    typeof value === 'string' ? value.trim() : ''
  );
  const buildCopyLabel = (value, fallback) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return `${trimmed || fallback} copy`;
  };
  const buildLegacyToStableMap = useCallback((explorationList = []) => {
    const legacyUsedNames = new Set();
    const map = {};
    (explorationList || []).forEach((exp) => {
      if (!exp?.id) return;
      const legacyExpName = exp.name || exp.rawDataName || 'Workbench';
      const nodesList = Array.isArray(exp.nodes) ? exp.nodes : [];
      const leafNodes = getLeafNodes(nodesList);
      leafNodes.forEach((leaf, index) => {
        const branchLabel = leaf.branchName || leaf.title || `Branch ${index + 1}`;
        const legacyName = buildLegacyExternalTableName(legacyExpName, branchLabel, legacyUsedNames);
        const stableName = buildStableExternalTableName(exp.id, leaf.id);
        map[legacyName] = stableName;
      });
    });
    return map;
  }, []);

  const normalizeExternalTableRefs = useCallback((nodesList = [], legacyToStable = {}) => {
    if (!Array.isArray(nodesList) || nodesList.length === 0) {
      return { nodes: nodesList, changed: false };
    }
    let changed = false;
    const nextNodes = nodesList.map((node) => {
      if (!node?.params) return node;
      if (node.type === 'SOURCE' && node.params.ingestionMode === 'inherited') {
        const current = node.params.inheritedTable || '';
        const mapped = legacyToStable[current];
        if (mapped && mapped !== current) {
          changed = true;
          return { ...node, params: { ...node.params, inheritedTable: mapped } };
        }
      }
      if (node.type === 'JOIN') {
        const current = node.params.rightTable || '';
        const mapped = legacyToStable[current];
        if (mapped && mapped !== current) {
          changed = true;
          return { ...node, params: { ...node.params, rightTable: mapped } };
        }
      }
      return node;
    });
    return { nodes: nextNodes, changed };
  }, []);

  const getExplorationStats = (model) => {
    const order = model?.order || [];
    const rowCount = order.reduce((sum, name) => sum + ((model.tables?.[name] || []).length), 0);
    return { tableCount: order.length, rowCount };
  };
  const buildRawDatasetSnapshot = (model, sourceNode, timestamp) => {
    const order = model?.order || [];
    const tableName = sourceNode?.params?.table || order[0] || '';
    const rows = Array.isArray(model?.tables?.[tableName]) ? model.tables[tableName] : [];
    const schema = rows.length > 0 ? Object.keys(rows[0] || {}) : [];
    const visibleColumns = Array.isArray(sourceNode?.params?.visibleColumns)
      ? sourceNode.params.visibleColumns
      : [];
    const columnSet = new Set(schema);
    const resolvedColumns = (visibleColumns.length > 0 ? visibleColumns : schema)
      .filter((col) => columnSet.has(col));
    const filteredRows = resolvedColumns.length > 0
      ? rows.map((row) => resolvedColumns.reduce((acc, key) => {
        acc[key] = row?.[key];
        return acc;
      }, {}))
      : rows;
    return {
      tableName,
      rows: filteredRows,
      schema: resolvedColumns.length > 0 ? resolvedColumns : schema,
      rowCount: filteredRows.length,
      createdAt: timestamp
    };
  };

  const saveAsset = () => {
    setSaveError(null);
    const now = new Date().toISOString();
    const stats = getExplorationStats(dataModel);
    const existing = explorations.find(exp => exp.id === activeExplorationId);
    const assetType = existing
      ? resolveAssetType(existing)
      : (activeAssetType || ASSET_TYPES.EXPLORATION);
    const fallbackName = resolveAssetFallbackName(assetType);
    const baseName = normalizeExplorationName(draftExplorationName || rawDataName, fallbackName);
    const name = existing?.name || baseName;
    const description = existing?.description ?? normalizeExplorationDescription(draftExplorationDescription);
    const payload = {
      id: existing?.id || `exp-${Date.now()}`,
      assetType,
      name,
      description,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      nodes: sanitizeNodesForStorage(nodes),
      dataModel,
      rawDataName,
      tableCount: stats.tableCount,
      rowCount: stats.rowCount
    };

    if (assetType === ASSET_TYPES.RAW_DATASET) {
      const sourceNode = nodes.find((node) => node.type === 'SOURCE') || nodes[0];
      const snapshot = buildRawDatasetSnapshot(dataModel, sourceNode, now);
      payload.datasetSnapshot = snapshot;
      payload.tableCount = dataModel?.order?.length || 0;
      payload.rowCount = snapshot.rowCount || 0;
    }

    if (assetType === ASSET_TYPES.SQL) {
      const sourceNode = nodes.find((node) => node.type === 'SOURCE');
      const sqlNode = nodes.find((node) => node.type === 'JOIN');
      const sqlText = String(sqlNode?.params?.sqlText || '').trim();
      const inputTable = sourceNode?.params?.inheritedTable || '';
      const result = sqlNode ? getNodeResult(chainData, sqlNode.id) : null;
      const hasError = Boolean(result?.error);
      const rowCount = result?.rowCount || 0;
      const rows = result?.getRows ? result.getRows({ start: 0, size: rowCount }) : [];
      const schema = Array.isArray(result?.schema) ? result.schema : [];
      payload.sqlText = sqlText;
      payload.sqlInputTable = inputTable;
      if (sqlText && !hasError) {
        payload.sqlSnapshot = {
          rows,
          schema,
          rowCount,
          createdAt: now
        };
        payload.rowCount = rowCount;
        payload.tableCount = schema.length > 0 ? 1 : 0;
      } else if (hasError) {
        payload.sqlSnapshot = existing?.sqlSnapshot || null;
        const fallbackSchema = Array.isArray(existing?.sqlSnapshot?.schema) ? existing.sqlSnapshot.schema : [];
        const fallbackRowCount = Number.isFinite(existing?.sqlSnapshot?.rowCount)
          ? existing.sqlSnapshot.rowCount
          : 0;
        payload.rowCount = fallbackRowCount;
        payload.tableCount = fallbackSchema.length > 0 ? 1 : 0;
      } else {
        payload.sqlSnapshot = null;
        payload.rowCount = 0;
        payload.tableCount = 0;
      }
    }

    const next = existing
      ? explorations.map(exp => exp.id === payload.id ? payload : exp)
      : [payload, ...explorations];
    try {
      persistExplorations(next);
      setExplorations(next);
      setActiveExplorationId(payload.id);
      setActiveAssetType(assetType);
      setDraftExplorationName(null);
      setDraftExplorationDescription(null);
      setShowDataModel(false);
      setViewMode('landing');
    } catch (err) {
      setSaveError('Unable to save this asset. Storage may be full.');
    }
  };

  const updateAssetName = (id, nextName) => {
    setExplorations((prev) => {
      const target = prev.find(exp => exp.id === id);
      if (!target) {
        return prev;
      }
      const fallback = resolveAssetFallbackName(resolveAssetType(target));
      const safeName = normalizeExplorationName(nextName, fallback);
      if (target.name === safeName) {
        return prev;
      }
      const now = new Date().toISOString();
      const legacyToStable = buildLegacyToStableMap(prev);
      const next = prev.map((exp) => {
        const normalized = normalizeExternalTableRefs(exp.nodes || [], legacyToStable);
        const updates = exp.id === id ? { name: safeName, updatedAt: now } : {};
        if (!normalized.changed && Object.keys(updates).length === 0) {
          return exp;
        }
        return {
          ...exp,
          ...updates,
          nodes: normalized.changed ? normalized.nodes : exp.nodes
        };
      });
      if (activeExplorationId) {
        const normalizedActive = normalizeExternalTableRefs(nodes, legacyToStable);
        if (normalizedActive.changed) {
          replaceCurrentNodes(normalizedActive.nodes);
        }
      }
      try {
        persistExplorations(next);
      } catch (err) {
        // Ignore storage errors on rename.
      }
      return next;
    });
  };

  const updateAssetDescription = (id, nextDescription) => {
    const safeDescription = normalizeExplorationDescription(nextDescription);
    setExplorations((prev) => {
      const target = prev.find(exp => exp.id === id);
      if (!target || (target.description || '') === safeDescription) {
        return prev;
      }
      const now = new Date().toISOString();
      const next = prev.map(exp => (
        exp.id === id ? { ...exp, description: safeDescription, updatedAt: now } : exp
      ));
      try {
        persistExplorations(next);
      } catch (err) {
        // Ignore storage errors on description edit.
      }
      return next;
    });
  };

  const handleExplorationRename = (value) => {
    if (activeExplorationId) {
      updateAssetName(activeExplorationId, value);
      return;
    }
    setDraftExplorationName(value);
  };

  const handleExplorationDescriptionChange = (value) => {
    const safeDescription = normalizeExplorationDescription(value);
    if (activeExplorationId) {
      updateAssetDescription(activeExplorationId, safeDescription);
      return;
    }
    setDraftExplorationDescription(safeDescription);
  };

  const startEditingExplorationName = (id, currentName) => {
    setEditingExplorationId(id);
    setEditingExplorationNameDraft(currentName || 'Exploration');
  };

  const cancelEditingExplorationName = () => {
    setEditingExplorationId(null);
    setEditingExplorationNameDraft('');
  };

  const commitEditingExplorationName = (id) => {
    if (!id || editingExplorationId !== id) return;
    updateAssetName(id, editingExplorationNameDraft);
    cancelEditingExplorationName();
  };

  const startEditingExplorationDescription = (id, currentDescription) => {
    setEditingExplorationDescriptionId(id);
    setEditingExplorationDescriptionDraft(currentDescription || '');
  };

  const cancelEditingExplorationDescription = () => {
    setEditingExplorationDescriptionId(null);
    setEditingExplorationDescriptionDraft('');
  };

  const commitEditingExplorationDescription = (id) => {
    if (!id || editingExplorationDescriptionId !== id) return;
    updateAssetDescription(id, editingExplorationDescriptionDraft);
    cancelEditingExplorationDescription();
  };

  const startEditingActiveName = () => {
    setActiveNameDraft(explorationDisplayName);
    setIsEditingActiveName(true);
  };

  const cancelEditingActiveName = () => {
    setIsEditingActiveName(false);
    setActiveNameDraft('');
  };

  const commitEditingActiveName = () => {
    handleExplorationRename(activeNameDraft);
    cancelEditingActiveName();
  };

  const startEditingActiveDescription = () => {
    setActiveDescriptionDraft(explorationDescription);
    setIsEditingActiveDescription(true);
  };

  const cancelEditingActiveDescription = () => {
    setIsEditingActiveDescription(false);
    setActiveDescriptionDraft('');
  };

  const commitEditingActiveDescription = () => {
    handleExplorationDescriptionChange(activeDescriptionDraft);
    cancelEditingActiveDescription();
  };

  const goToExplorations = () => {
    cancelEditingActiveName();
    cancelEditingActiveDescription();
    setShowDataModel(false);
    setViewMode('landing');
  };

  const openAsset = (asset, options = {}) => {
    if (!asset) return;
    const assetType = resolveAssetType(asset);
    const fallbackNodes = assetType === ASSET_TYPES.SQL ? createInitialSqlNodes() : createInitialNodes();
    const nextNodes = asset.nodes || fallbackNodes;
    const focusNodeId = options.focusNodeId;
    const hasFocusNode = focusNodeId && nextNodes.some((node) => node.id === focusNodeId);
    const defaultSelected = assetType === ASSET_TYPES.SQL
      ? (nextNodes.find((node) => node.type === 'JOIN')?.id || 'node-sql')
      : (nextNodes[0]?.id || 'node-start');
    const nextSelectedId = hasFocusNode ? focusNodeId : defaultSelected;
    setLineageFocusNodeId(hasFocusNode ? focusNodeId : null);
    setHistory([nextNodes]);
    setHistoryIndex(0);
    setSelectedNodeId(nextSelectedId);
    setDataModel(asset.dataModel || { tables: {}, order: [] });
    setRawDataName(asset.rawDataName || asset.name || null);
    setLoadError(null);
    setSelectedFiles([]);
    setPendingFiles([]);
    setDraftExplorationName(null);
    setDraftExplorationDescription(null);
    setEditingExplorationId(null);
    setEditingExplorationDescriptionId(null);
    setEditingExplorationNameDraft('');
    setEditingExplorationDescriptionDraft('');
    setIsEditingActiveName(false);
    setIsEditingActiveDescription(false);
    setShowDataModel(false);
    setShowAddMenuForId(null);
    setShowInsertMenuForId(null);
    setActiveExplorationId(asset.id);
    setActiveAssetType(assetType);
    setViewMode('canvas');
  };

  const deleteAsset = (id) => {
    const next = explorations.filter(exp => exp.id !== id);
    try {
      persistExplorations(next);
    } catch (err) {
      // Ignore storage errors on delete.
    }
    setExplorations(next);
    if (activeExplorationId === id) {
      setActiveExplorationId(null);
      setActiveAssetType(ASSET_TYPES.EXPLORATION);
      setViewMode('landing');
    }
  };

  const duplicateAsset = (id, originGraphNodeId) => {
    if (!id) return;
    let createdGraphId = null;
    setExplorations((prev) => {
      const target = prev.find(exp => exp.id === id);
      if (!target) return prev;
      const assetType = resolveAssetType(target);
      const now = new Date().toISOString();
      const fallback = resolveAssetFallbackName(assetType);
      const copyName = normalizeExplorationName(
        buildCopyLabel(target.name || target.rawDataName, fallback),
        fallback
      );
      const copyId = `exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      createdGraphId = assetType === ASSET_TYPES.EXPLORATION ? `exp:${copyId}` : `${assetType}:${copyId}`;
      const nextEntry = {
        ...target,
        id: copyId,
        name: copyName,
        createdAt: now,
        updatedAt: now
      };
      const next = [nextEntry, ...prev];
      try {
        persistExplorations(next);
      } catch (err) {
        // Ignore storage errors on duplicate.
      }
      return next;
    });
    if (originGraphNodeId && createdGraphId) {
      registerGraphPlacementHint(createdGraphId, originGraphNodeId);
    }
  };

  const deleteDatasetEntry = (entry) => {
    if (!entry?.explorationId || !entry?.nodeId) return;
    setExplorations((prev) => {
      const targetIndex = prev.findIndex(exp => exp.id === entry.explorationId);
      if (targetIndex === -1) return prev;
      const target = prev[targetIndex];
      const nodesList = Array.isArray(target.nodes) ? target.nodes : [];
      let changed = false;
      const nextNodes = nodesList.map((node) => {
        if (node.id !== entry.nodeId) return node;
        changed = true;
        const nextParams = {
          ...node.params,
          isDataset: false,
          isFlattened: false,
          datasetSnapshot: null
        };
        return { ...node, params: nextParams };
      });
      if (!changed) return prev;
      const now = new Date().toISOString();
      const hasFlattenedDataset = nextNodes.some((node) => (
        node.params?.isFlattened && node.params?.datasetSnapshot
      ));
      const nextEntry = {
        ...target,
        nodes: nextNodes,
        updatedAt: now,
        ...(target.isFlattenedDataset && !hasFlattenedDataset ? { isFlattenedDataset: false } : {})
      };
      const next = [...prev];
      next[targetIndex] = nextEntry;
      try {
        persistExplorations(next);
      } catch (err) {
        // Ignore storage errors on dataset delete.
      }
      if (activeExplorationId === target.id) {
        replaceCurrentNodes(nextNodes);
      }
      return next;
    });
  };

  const getExplorationLabel = useCallback((expId) => {
    const match = explorations.find((item) => item.id === expId);
    if (!match) return 'Exploration';
    const fallback = resolveAssetFallbackName(resolveAssetType(match));
    return match?.name || match?.rawDataName || fallback;
  }, [explorations, resolveAssetType, resolveAssetFallbackName]);

  const formatDatasetLabel = useCallback((datasetName, explorationName) => {
    const resolvedExploration = explorationName || 'Exploration';
    const resolvedDataset = datasetName || 'Dataset';
    return `${resolvedExploration} / ${resolvedDataset}`;
  }, []);

  const getDatasetDisplayLabel = useCallback((entry) => {
    if (!entry) return 'Dataset';
    if (entry.assetType === ASSET_TYPES.RAW_DATASET) {
      return entry.label || entry.assetName || 'Raw dataset';
    }
    if (entry.assetType === ASSET_TYPES.SQL) {
      return entry.label || entry.assetName || 'SQL transformation';
    }
    const datasetName = entry.datasetName || entry.nodeTitle || '';
    if (datasetName) {
      return formatDatasetLabel(datasetName, entry.explorationName);
    }
    return entry.label || entry.name || 'Dataset';
  }, [formatDatasetLabel]);

  const buildExplorationDeleteDetails = useCallback((expId) => {
    const normalizeList = (items) => (
      Array.from(new Set((items || []).filter(Boolean))).sort((a, b) => a.localeCompare(b))
    );
    const target = explorations.find((item) => item.id === expId);
    if (!target) return { dependencies: [], dependents: [] };
    const nodesList = Array.isArray(target.nodes) ? target.nodes : [];
    const dependenciesByKey = new Map();
    const externalNameEntries = Object.entries(externalTableRegistry.allByName || {})
      .map(([name, entry]) => ({ name, entry }))
      .filter(({ entry }) => entry?.isDataset);
    const sqlMatchers = externalNameEntries.map(({ name, entry }) => ({
      entry,
      regex: new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i')
    }));
    const addDependencyEntry = (depEntry) => {
      const depOwnerId = depEntry?.assetId || depEntry?.explorationId;
      if (!depOwnerId || depOwnerId === expId) return;
      if (!depEntry.isDataset) return;
      dependenciesByKey.set(depEntry.name, depEntry);
    };
    nodesList.forEach((node) => {
      if (node.type === 'SOURCE' && node.params?.ingestionMode === 'inherited') {
        const tableName = node.params?.inheritedTable || '';
        const depEntry = tableName ? externalTableRegistry.allByName?.[tableName] : null;
        addDependencyEntry(depEntry);
      }
      if (node.type === 'JOIN') {
        const sqlMode = node.params?.sqlMode || 'visual';
        if (sqlMode === 'custom') {
          const sqlText = String(node.params?.sqlText || '');
          if (!sqlText) return;
          sqlMatchers.forEach(({ entry, regex }) => {
            if (regex.test(sqlText)) {
              addDependencyEntry(entry);
            }
          });
          return;
        }
        const tableName = node.params?.rightTable || '';
        const depEntry = tableName ? externalTableRegistry.allByName?.[tableName] : null;
        addDependencyEntry(depEntry);
      }
    });
    const dependencies = normalizeList(
      Array.from(dependenciesByKey.values()).map((depEntry) => getDatasetDisplayLabel(depEntry))
    );

    const targetEntries = (externalTableRegistry.allList || [])
      .filter((entry) => (entry?.assetId || entry?.explorationId) === expId);
    const targetNames = targetEntries
      .flatMap((entry) => [entry.name, entry.legacyName])
      .filter(Boolean)
      .map((name) => String(name).toLowerCase());
    const targetNameSet = new Set(targetNames);
    const sqlMatchersForTarget = targetNames.map((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i'));

    const dependentAssets = explorations
      .filter((asset) => asset?.id && asset.id !== expId)
      .filter((asset) => {
        const assetNodes = Array.isArray(asset.nodes) ? asset.nodes : [];
        return assetNodes.some((node) => {
          if (node.type === 'SOURCE' && node.params?.ingestionMode === 'inherited') {
            const tableName = String(node.params?.inheritedTable || '').toLowerCase();
            return targetNameSet.has(tableName);
          }
          if (node.type === 'JOIN') {
            const sqlMode = node.params?.sqlMode || 'visual';
            if (sqlMode === 'custom') {
              const sqlText = String(node.params?.sqlText || '');
              if (!sqlText) return false;
              return sqlMatchersForTarget.some((regex) => regex.test(sqlText));
            }
            const tableName = String(node.params?.rightTable || '').toLowerCase();
            return targetNameSet.has(tableName);
          }
          return false;
        });
      })
      .map((asset) => getExplorationLabel(asset.id));

    const originDatasets = (externalTableRegistry.datasets || [])
      .filter((entry) => entry?.explorationId === expId)
      .map((entry) => getDatasetDisplayLabel(entry));

    const dependentDatasets = (externalTableRegistry.datasets || [])
      .filter((entry) => entry?.explorationId && entry.explorationId !== expId)
      .filter((entry) => {
        const deps = Array.isArray(entry.dependencies) ? entry.dependencies : [];
        return deps.some((dep) => dep?.assetId === expId || dep?.explorationId === expId);
      })
      .map((entry) => getDatasetDisplayLabel(entry));

    const dependents = normalizeList([
      ...dependentAssets,
      ...originDatasets,
      ...dependentDatasets
    ]);
    return { dependencies, dependents };
  }, [externalTableRegistry, explorations, getDatasetDisplayLabel, getExplorationLabel]);

  const buildDatasetDeleteDetails = useCallback((entry) => {
    if (!entry?.explorationId || !entry?.nodeId) return { dependencies: [], dependents: [] };
    const normalizeList = (items) => (
      Array.from(new Set((items || []).filter(Boolean))).sort((a, b) => a.localeCompare(b))
    );
    const dependencies = normalizeList(
      (Array.isArray(entry.dependencies) ? entry.dependencies : []).map((dep) => (
        getDatasetDisplayLabel(dep)
      ))
    );
    const targetKey = `${entry.explorationId}:${entry.nodeId}`;
    const datasetDependents = (externalTableRegistry.datasets || [])
      .filter((candidate) => {
        if (!candidate?.explorationId || !candidate?.nodeId) return false;
        if (`${candidate.explorationId}:${candidate.nodeId}` === targetKey) return false;
        const deps = Array.isArray(candidate.dependencies) ? candidate.dependencies : [];
        return deps.some((dep) => (
          dep.explorationId === entry.explorationId && dep.nodeId === entry.nodeId
        ));
      })
      .map((candidate) => getDatasetDisplayLabel(candidate));
    const targetNames = [entry.name, entry.legacyName].filter(Boolean);
    const targetNameSet = new Set(targetNames.map((name) => String(name).toLowerCase()));
    const sqlMatchers = targetNames.map((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i'));
    const explorationDependents = explorations
      .filter((exp) => exp?.id && exp.id !== entry.explorationId)
      .filter((exp) => {
        const nodesList = Array.isArray(exp.nodes) ? exp.nodes : [];
        return nodesList.some((node) => {
          if (node.type === 'SOURCE' && node.params?.ingestionMode === 'inherited') {
            const tableName = String(node.params?.inheritedTable || '').toLowerCase();
            return targetNameSet.has(tableName);
          }
          if (node.type === 'JOIN') {
            const sqlMode = node.params?.sqlMode || 'visual';
            if (sqlMode === 'custom') {
              const sqlText = String(node.params?.sqlText || '');
              if (!sqlText) return false;
              return sqlMatchers.some((regex) => regex.test(sqlText));
            }
            const tableName = String(node.params?.rightTable || '').toLowerCase();
            return targetNameSet.has(tableName);
          }
          return false;
        });
      })
      .map((exp) => getExplorationLabel(exp.id));
    const dependents = normalizeList([...datasetDependents, ...explorationDependents]);
    return { dependencies, dependents };
  }, [externalTableRegistry, explorations, getDatasetDisplayLabel, getExplorationLabel]);

  const openDeleteExplorationModal = useCallback((expId) => {
    if (!expId) return;
    const target = explorations.find((item) => item.id === expId);
    const assetType = resolveAssetType(target);
    const title = getExplorationLabel(expId);
    const { dependencies, dependents } = buildExplorationDeleteDetails(expId);
    setDeleteModalState({
      type: 'asset',
      assetType,
      explorationId: expId,
      title,
      dependencies,
      dependents
    });
    setIsDeleteModalOpen(true);
  }, [buildExplorationDeleteDetails, explorations, getExplorationLabel, resolveAssetType]);

  const openDeleteDatasetModal = useCallback((entry) => {
    if (!entry?.explorationId || !entry?.nodeId) return;
    const title = formatDatasetLabel(entry.datasetName || entry.nodeTitle, entry.explorationName);
    const { dependencies, dependents } = buildDatasetDeleteDetails(entry);
    setDeleteModalState({
      type: 'dataset',
      datasetEntry: entry,
      title,
      dependencies,
      dependents
    });
    setIsDeleteModalOpen(true);
  }, [buildDatasetDeleteDetails, formatDatasetLabel]);

  const closeDeleteModal = useCallback(() => {
    setIsDeleteModalOpen(false);
    setDeleteModalState(null);
  }, []);

  const confirmDeleteModal = useCallback(() => {
    if (!deleteModalState) {
      closeDeleteModal();
      return;
    }
    if (deleteModalState.type === 'asset' && deleteModalState.explorationId) {
      deleteAsset(deleteModalState.explorationId);
    }
    if (deleteModalState.type === 'dataset') {
      deleteDatasetEntry(deleteModalState.datasetEntry);
    }
    closeDeleteModal();
  }, [deleteModalState, deleteAsset, deleteDatasetEntry, closeDeleteModal]);

  const duplicateDatasetEntry = (entry, originGraphNodeId) => {
    if (!entry?.explorationId || !entry?.nodeId) return;
    let createdGraphId = null;
    setExplorations((prev) => {
      const target = prev.find(exp => exp.id === entry.explorationId);
      if (!target) return prev;
      const nodesList = Array.isArray(target.nodes) ? target.nodes : [];
      if (nodesList.length === 0) return prev;
      const nodesById = new Map(nodesList.map((node) => [node.id, node]));
      if (!nodesById.has(entry.nodeId)) return prev;
      const copyName = buildCopyLabel(entry.datasetName || entry.nodeTitle, 'Dataset');

      const lineageIds = new Set();
      let currentId = entry.nodeId;
      while (currentId && nodesById.has(currentId)) {
        lineageIds.add(currentId);
        const current = nodesById.get(currentId);
        currentId = current?.parentId;
      }

      const lineageNodes = nodesList
        .filter((node) => lineageIds.has(node.id))
        .map((node) => {
          let nextNode = node;
          if (node.id === entry.nodeId) {
            const nextParams = {
              ...node.params,
              isDataset: true,
              datasetName: copyName
            };
            nextNode = {
              ...node,
              title: copyName,
              params: nextParams
            };
            const branchBase = typeof node.branchName === 'string' ? node.branchName.trim() : '';
            if (branchBase) {
              nextNode.branchName = `${branchBase} copy`;
            }
          }
          if (nextNode.entangledPeerId && !lineageIds.has(nextNode.entangledPeerId)) {
            nextNode = {
              ...nextNode,
              entangledPeerId: undefined,
              entangledRootId: undefined,
              entangledColor: undefined
            };
          }
          return nextNode;
        });

      const now = new Date().toISOString();
      const stats = getExplorationStats(target.dataModel || { tables: {}, order: [] });
      const newExplorationId = `exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      createdGraphId = `dataset:${newExplorationId}:${entry.nodeId}`;
      const nextEntry = {
        id: newExplorationId,
        name: copyName,
        description: target.description || '',
        createdAt: now,
        updatedAt: now,
        nodes: sanitizeNodesForStorage(lineageNodes),
        dataModel: target.dataModel || { tables: {}, order: [] },
        rawDataName: copyName,
        tableCount: stats.tableCount,
        rowCount: stats.rowCount,
        isFlattenedDataset: entry.isFlattened === true
      };
      const next = [nextEntry, ...prev];
      try {
        persistExplorations(next);
      } catch (err) {
        // Ignore storage errors on dataset duplicate.
      }
      return next;
    });
    if (originGraphNodeId && createdGraphId) {
      registerGraphPlacementHint(createdGraphId, originGraphNodeId);
    }
  };

  const startNewAsset = (type = ASSET_TYPES.EXPLORATION) => {
    const assetType = VALID_ASSET_TYPES.has(type) ? type : ASSET_TYPES.EXPLORATION;
    const nextNodes = assetType === ASSET_TYPES.SQL ? createInitialSqlNodes() : createInitialNodes();
    const defaultSelected = assetType === ASSET_TYPES.SQL
      ? (nextNodes.find((node) => node.type === 'JOIN')?.id || 'node-sql')
      : (nextNodes[0]?.id || 'node-start');
    setHistory([nextNodes]);
    setHistoryIndex(0);
    setSelectedNodeId(defaultSelected);
    setLineageFocusNodeId(null);
    setDataModel({ tables: {}, order: [] });
    setRawDataName(null);
    setLoadError(null);
    setSelectedFiles([]);
    setPendingFiles([]);
    setDraftExplorationName(null);
    setDraftExplorationDescription(null);
    setEditingExplorationId(null);
    setEditingExplorationDescriptionId(null);
    setEditingExplorationNameDraft('');
    setEditingExplorationDescriptionDraft('');
    setIsEditingActiveName(false);
    setIsEditingActiveDescription(false);
    setShowDataModel(false);
    setShowAddMenuForId(null);
    setShowInsertMenuForId(null);
    setActiveExplorationId(null);
    setActiveAssetType(assetType);
    setViewMode('canvas');
  };

  // -------------------------------------------------------------------
  // AI assistant helper (rule-based planner)
  // -------------------------------------------------------------------
  const escapeRegExpForAi = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      const escaped = escapeRegExpForAi(field);
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
    const sourceNode = nodes.find((node) => node.id === 'node-start');
    const ingestionMode = sourceNode?.params?.ingestionMode || DEFAULT_INGESTION_MODE;
    const inheritedTable = sourceNode?.params?.inheritedTable || '';
    if (ingestionMode === 'inherited') {
      if (!inheritedTable) {
        return { title: 'No inherited table', detail: 'Pick a saved end node from another exploration.' };
      }
      const inheritedEntry = externalTableRegistry.allByName?.[inheritedTable];
      const label = inheritedEntry?.label || inheritedTable;
      return { title: 'Inherited table', detail: `Using ${label} from another exploration.` };
    }
    if (isLoadingFile) return { title: 'Loading…', detail: 'Parsing files and building tables…', loading: true };
    if (loadError) return { title: 'Error', detail: loadError };
    const tableCount = dataModel.order.length;
    const totalRows = dataModel.order.reduce((sum, name) => sum + ((dataModel.tables[name] || []).length), 0);
    const fallbackLabel = activeAssetType === ASSET_TYPES.RAW_DATASET ? 'Raw dataset' : 'Dataset';
    const label = rawDataName || fallbackLabel;
    if (tableCount === 0) {
      return { title: 'No data', detail: 'Upload a CSV or Excel file to get started.' };
    }
    return { title: 'Connected', detail: `${label} loaded with ${tableCount} tables and ${totalRows} rows.` };
  })();

  const availableTables = useMemo(() => {
    const local = (dataModel.order || []).map((name) => ({
      name,
      label: name,
      source: 'local',
      sqlName: slugifySqlName(name)
    }));
    const externalEntries = [...(externalTableRegistry.assetTables || [])]
      .sort((a, b) => a.label.localeCompare(b.label));
    const external = externalEntries.map((entry) => ({
      name: entry.name,
      label: entry.label,
      source: 'external',
      explorationName: entry.explorationName,
      nodeTitle: entry.nodeTitle,
      isDataset: entry.isDataset,
      assetType: entry.assetType,
      assetId: entry.assetId,
      schema: entry.schema,
      rowCount: entry.rowCount,
      legacyName: entry.legacyName,
      isFlattened: entry.isFlattened
    }));
    return {
      incoming: SQL_INCOMING_TABLE,
      local,
      external
    };
  }, [dataModel.order, externalTableRegistry.assetTables]);

  const datasetEntries = externalTableRegistry.datasets || [];
  const explorationAssets = useMemo(() => (
    (explorations || []).filter((exp) => resolveAssetType(exp) === ASSET_TYPES.EXPLORATION)
  ), [explorations, resolveAssetType]);
  const rawDatasetAssets = useMemo(() => (
    (explorations || []).filter((exp) => resolveAssetType(exp) === ASSET_TYPES.RAW_DATASET)
  ), [explorations, resolveAssetType]);
  const sqlAssets = useMemo(() => (
    (explorations || []).filter((exp) => resolveAssetType(exp) === ASSET_TYPES.SQL)
  ), [explorations, resolveAssetType]);
  const visibleExplorations = useMemo(() => (
    explorationAssets.filter((exp) => exp && exp.isFlattenedDataset !== true)
  ), [explorationAssets]);

  const workbenchDependencyGraph = useMemo(() => {
    const explorationNodes = [];
    const rawDatasetNodes = [];
    const sqlAssetNodes = [];
    const edges = [];
    const datasetEntryByKey = new Map();
    const datasetNodeIdByKey = new Map();
    const explorationNodeIdById = new Map();
    const rawDatasetNodeIdById = new Map();
    const sqlNodeIdById = new Map();
    const explorationMetaById = new Map();
    const datasetEntriesList = externalTableRegistry.datasets || [];
    const rawDatasetEntriesById = new Map(
      (externalTableRegistry.rawDatasetEntries || []).map((entry) => [entry.assetId, entry])
    );
    const sqlAssetEntriesById = new Map(
      (externalTableRegistry.sqlAssetEntries || []).map((entry) => [entry.assetId, entry])
    );
    const edgeIds = new Set();
    const externalNameEntries = Object.entries(externalTableRegistry.allByName || {}).map(([name, entry]) => ({
      name,
      entry
    }));
    const getAssetGraphId = (assetType, assetId) => (
      assetType === ASSET_TYPES.EXPLORATION ? `exp:${assetId}` : `${assetType}:${assetId}`
    );
    const resolveEntryOwnerId = (entry) => entry?.assetId || entry?.explorationId || null;
    const buildSqlMatchers = (ownerId) => (
      externalNameEntries
        .filter(({ entry }) => {
          const entryOwnerId = resolveEntryOwnerId(entry);
          return entryOwnerId && entryOwnerId !== ownerId;
        })
        .map(({ name, entry }) => ({
          entry,
          regex: new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i')
        }))
    );

    (externalTableRegistry.allList || []).forEach((entry) => {
      if (!entry?.explorationId || !entry?.nodeId) return;
      datasetEntryByKey.set(`${entry.explorationId}:${entry.nodeId}`, entry);
    });

    explorationAssets.forEach((exp) => {
      if (!exp?.id) return;
      const nodesList = Array.isArray(exp.nodes) ? exp.nodes : [];
      const nodesById = new Map(nodesList.map((node) => [node.id, node]));
      explorationMetaById.set(exp.id, { nodesList, nodesById });
    });

    visibleExplorations.forEach((exp) => {
      if (!exp?.id) return;
      const graphId = getAssetGraphId(ASSET_TYPES.EXPLORATION, exp.id);
      explorationNodeIdById.set(exp.id, graphId);
      const order = exp.dataModel?.order || [];
      const tableCount = exp.tableCount ?? order.length;
      const rowCount = exp.rowCount ?? order.reduce(
        (sum, name) => sum + ((exp.dataModel?.tables?.[name] || []).length),
        0
      );
      const meta = explorationMetaById.get(exp.id);
      const nodesList = meta?.nodesList || [];
      const nodeCount = nodesList.length;
      const branchCount = nodesList.reduce((sum, node) => (
        getChildren(nodesList, node.id).length === 0 ? sum + 1 : sum
      ), 0);
      explorationNodes.push({
        id: graphId,
        type: 'exploration',
        assetId: exp.id,
        assetType: ASSET_TYPES.EXPLORATION,
        explorationId: exp.id,
        title: exp.name || 'Exploration',
        subtitle: exp.description || '',
        updatedAt: exp.updatedAt || exp.createdAt,
        tableCount,
        rowCount,
        nodeCount,
        branchCount,
        internalNodes: nodesList
      });
    });

    rawDatasetAssets.forEach((asset) => {
      if (!asset?.id) return;
      const graphId = getAssetGraphId(ASSET_TYPES.RAW_DATASET, asset.id);
      rawDatasetNodeIdById.set(asset.id, graphId);
      const entry = rawDatasetEntriesById.get(asset.id);
      const nodesList = Array.isArray(asset.nodes) ? asset.nodes : [];
      const rowCount = entry?.rowCount || 0;
      const columnCount = entry?.schema?.length || 0;
      rawDatasetNodes.push({
        id: graphId,
        type: ASSET_TYPES.RAW_DATASET,
        assetId: asset.id,
        title: asset.name || asset.rawDataName || 'Raw dataset',
        subtitle: asset.description || '',
        updatedAt: asset.updatedAt || asset.createdAt,
        rowCount,
        columnCount,
        internalNodes: nodesList
      });
    });

    sqlAssets.forEach((asset) => {
      if (!asset?.id) return;
      const graphId = getAssetGraphId(ASSET_TYPES.SQL, asset.id);
      sqlNodeIdById.set(asset.id, graphId);
      const entry = sqlAssetEntriesById.get(asset.id);
      const nodesList = Array.isArray(asset.nodes) ? asset.nodes : [];
      const rowCount = entry?.rowCount || 0;
      const columnCount = entry?.schema?.length || 0;
      sqlAssetNodes.push({
        id: graphId,
        type: ASSET_TYPES.SQL,
        assetId: asset.id,
        title: asset.name || 'SQL transformation',
        subtitle: asset.description || '',
        updatedAt: asset.updatedAt || asset.createdAt,
        rowCount,
        columnCount,
        internalNodes: nodesList
      });
    });

    const resolveLineageNodes = (meta, nodeId) => {
      if (!meta || !nodeId) return [];
      const { nodesList, nodesById } = meta;
      if (!Array.isArray(nodesList) || nodesList.length === 0 || !nodesById?.has?.(nodeId)) {
        return [];
      }
      const lineageIds = new Set();
      let currentId = nodeId;
      while (currentId && nodesById.has(currentId)) {
        lineageIds.add(currentId);
        currentId = nodesById.get(currentId)?.parentId;
      }
      return nodesList.filter((node) => lineageIds.has(node.id));
    };

    const datasetNodes = datasetEntriesList
      .map((entry) => {
        if (!entry) return null;
        const key = `${entry.explorationId}:${entry.nodeId}`;
        const nodeId = datasetNodeIdByKey.get(key) || `dataset:${key}`;
        datasetNodeIdByKey.set(key, nodeId);
        const explorationMeta = explorationMetaById.get(entry.explorationId);
        const lineageNodes = resolveLineageNodes(explorationMeta, entry.nodeId);
        const internalNodes = lineageNodes.length > 0
          ? lineageNodes
          : [{
            id: entry.nodeId,
            parentId: null,
            title: entry.nodeTitle || entry.datasetName || 'Dataset'
          }];
        return {
          id: nodeId,
          type: 'dataset',
          datasetEntry: entry,
          title: entry.datasetName || entry.nodeTitle || 'Dataset',
          subtitle: `From ${entry.explorationName || 'Exploration'}`,
          updatedAt: entry.explorationUpdatedAt,
          rowCount: entry.rowCount || 0,
          columnCount: entry.schema?.length || 0,
          internalNodes
        };
      })
      .filter(Boolean);

    const resolveProviderNodeId = (entry) => {
      if (!entry) return null;
      if (entry.assetType === ASSET_TYPES.RAW_DATASET) {
        return rawDatasetNodeIdById.get(entry.assetId);
      }
      if (entry.assetType === ASSET_TYPES.SQL) {
        return sqlNodeIdById.get(entry.assetId);
      }
      if (entry.explorationId && entry.nodeId) {
        const key = `${entry.explorationId}:${entry.nodeId}`;
        return datasetNodeIdByKey.get(key) || `dataset:${key}`;
      }
      return null;
    };

    const addOriginEdge = (entry) => {
      if (!entry?.isDataset) return;
      if (!entry.explorationId || !entry.nodeId) return;
      const explorationNodeId = explorationNodeIdById.get(entry.explorationId);
      if (!explorationNodeId) return;
      const datasetKey = `${entry.explorationId}:${entry.nodeId}`;
      const datasetNodeId = datasetNodeIdByKey.get(datasetKey);
      if (!datasetNodeId) return;
      const edgeId = `edge:origin:${datasetKey}`;
      if (edgeIds.has(edgeId)) return;
      edgeIds.add(edgeId);
      edges.push({
        id: edgeId,
        from: explorationNodeId,
        to: datasetNodeId,
        sourceAnchorId: entry.nodeId,
        targetAnchorId: entry.nodeId,
        kind: 'origin'
      });
    };

    const addEdge = (exp, node, entry, kind) => {
      if (!entry || !entry.isDataset || !exp?.id || !node?.id) return;
      const entryOwnerId = entry.assetId || entry.explorationId;
      if (entryOwnerId && entryOwnerId === exp.id) return;
      const explorationNodeId = explorationNodeIdById.get(exp.id);
      if (!explorationNodeId) return;
      const providerNodeId = resolveProviderNodeId(entry);
      if (!providerNodeId) return;
      const edgeId = `edge:${exp.id}:${node.id}:${entry.name || entry.nodeId}:${kind}`;
      if (edgeIds.has(edgeId)) return;
      edgeIds.add(edgeId);
      edges.push({
        id: edgeId,
        from: providerNodeId,
        to: explorationNodeId,
        sourceAnchorId: entry.nodeId,
        targetAnchorId: node.id,
        kind
      });
    };

    const addAssetUsageEdge = (assetId, assetNodeId, nodeId, entry, kind) => {
      if (!assetId || !assetNodeId || !nodeId || !entry || !entry.isDataset) return;
      const entryOwnerId = entry.assetId || entry.explorationId;
      if (entryOwnerId && entryOwnerId === assetId) return;
      const providerNodeId = resolveProviderNodeId(entry);
      if (!providerNodeId) return;
      const edgeId = `edge:${assetId}:${nodeId}:${entry.name || entry.nodeId}:${kind}`;
      if (edgeIds.has(edgeId)) return;
      edgeIds.add(edgeId);
      edges.push({
        id: edgeId,
        from: providerNodeId,
        to: assetNodeId,
        sourceAnchorId: entry.nodeId,
        targetAnchorId: nodeId,
        kind
      });
    };

    visibleExplorations.forEach((exp) => {
      if (!exp?.id) return;
      const nodesList = Array.isArray(exp.nodes) ? exp.nodes : [];
      const sqlMatchers = buildSqlMatchers(exp.id);
      nodesList.forEach((node) => {
        if (node.type === 'SOURCE' && node.params?.ingestionMode === 'inherited') {
          const tableName = node.params?.inheritedTable || '';
          if (!tableName) return;
          const entry = externalTableRegistry.allByName?.[tableName];
          addEdge(exp, node, entry, 'inherited');
        }
        if (node.type === 'JOIN') {
          const sqlMode = node.params?.sqlMode || 'visual';
          if (sqlMode === 'custom') {
            const sqlText = String(node.params?.sqlText || '');
            if (!sqlText) return;
            const depsByKey = new Map();
            sqlMatchers.forEach(({ entry, regex }) => {
              if (regex.test(sqlText)) {
                depsByKey.set(`${entry.explorationId}:${entry.nodeId}`, entry);
              }
            });
            depsByKey.forEach((entry) => addEdge(exp, node, entry, 'sql'));
            return;
          }
          const tableName = node.params?.rightTable || '';
          if (!tableName) return;
          const entry = externalTableRegistry.allByName?.[tableName];
          addEdge(exp, node, entry, 'join');
        }
      });
    });

    sqlAssets.forEach((asset) => {
      if (!asset?.id) return;
      const assetNodeId = sqlNodeIdById.get(asset.id);
      if (!assetNodeId) return;
      const nodesList = Array.isArray(asset.nodes) ? asset.nodes : [];
      const sqlMatchers = buildSqlMatchers(asset.id);
      nodesList.forEach((node) => {
        if (node.type === 'SOURCE' && node.params?.ingestionMode === 'inherited') {
          const tableName = node.params?.inheritedTable || '';
          if (!tableName) return;
          const entry = externalTableRegistry.allByName?.[tableName];
          addAssetUsageEdge(asset.id, assetNodeId, node.id, entry, 'inherited');
        }
        if (node.type === 'JOIN') {
          const sqlMode = node.params?.sqlMode || 'visual';
          if (sqlMode === 'custom') {
            const sqlText = String(node.params?.sqlText || '');
            if (!sqlText) return;
            sqlMatchers.forEach(({ entry, regex }) => {
              if (regex.test(sqlText)) {
                addAssetUsageEdge(asset.id, assetNodeId, node.id, entry, 'sql');
              }
            });
            return;
          }
          const tableName = node.params?.rightTable || '';
          if (!tableName) return;
          const entry = externalTableRegistry.allByName?.[tableName];
          addAssetUsageEdge(asset.id, assetNodeId, node.id, entry, 'join');
        }
      });
    });

    datasetEntriesList.forEach((entry) => {
      addOriginEdge(entry);
    });

    const addDatasetDependencyEdge = (sourceEntry, targetEntry) => {
      if (!sourceEntry || !targetEntry) return;
      if (!sourceEntry.isDataset || !targetEntry.isDataset) return;
      const sourceKey = `${sourceEntry.explorationId}:${sourceEntry.nodeId}`;
      const targetKey = `${targetEntry.explorationId}:${targetEntry.nodeId}`;
      if (!sourceKey || !targetKey || sourceKey === targetKey) return;
      const sourceNodeId = datasetNodeIdByKey.get(sourceKey);
      const targetNodeId = datasetNodeIdByKey.get(targetKey);
      if (!sourceNodeId || !targetNodeId) return;
      const edgeId = `edge:dataset:${sourceKey}:${targetKey}`;
      if (edgeIds.has(edgeId)) return;
      edgeIds.add(edgeId);
      edges.push({
        id: edgeId,
        from: sourceNodeId,
        to: targetNodeId,
        sourceAnchorId: sourceEntry.nodeId,
        targetAnchorId: targetEntry.nodeId,
        kind: 'dataset'
      });
    };

    datasetEntriesList.forEach((entry) => {
      if (!entry?.isDataset) return;
      const dependencies = Array.isArray(entry.dependencies) ? entry.dependencies : [];
      dependencies.forEach((dep) => {
        if (!dep?.isDataset || !dep.explorationId || !dep.nodeId) return;
        const depKey = `${dep.explorationId}:${dep.nodeId}`;
        const depEntry = datasetEntryByKey.get(depKey);
        if (!depEntry) return;
        addDatasetDependencyEdge(depEntry, entry);
      });
    });

    const anchorMap = new Map();
    const registerAnchor = (graphNodeId, internalNodeId, direction) => {
      if (!graphNodeId || !internalNodeId) return;
      const current = anchorMap.get(graphNodeId) || new Map();
      const next = current.get(internalNodeId) || { incoming: 0, outgoing: 0 };
      if (direction === 'incoming') {
        next.incoming += 1;
      } else if (direction === 'outgoing') {
        next.outgoing += 1;
      }
      current.set(internalNodeId, next);
      anchorMap.set(graphNodeId, current);
    };
    edges.forEach((edge) => {
      if (edge.from && edge.sourceAnchorId) {
        registerAnchor(edge.from, edge.sourceAnchorId, 'outgoing');
      }
      if (edge.to && edge.targetAnchorId) {
        registerAnchor(edge.to, edge.targetAnchorId, 'incoming');
      }
    });
    const anchorsByNodeId = {};
    anchorMap.forEach((value, key) => {
      const entries = {};
      value.forEach((meta, nodeId) => {
        entries[nodeId] = meta;
      });
      anchorsByNodeId[key] = entries;
    });

    return {
      nodes: [...explorationNodes, ...rawDatasetNodes, ...sqlAssetNodes, ...datasetNodes],
      edges,
      anchorsByNodeId
    };
  }, [
    explorationAssets,
    rawDatasetAssets,
    sqlAssets,
    visibleExplorations,
    externalTableRegistry.allByName,
    externalTableRegistry.allList,
    externalTableRegistry.datasets,
    externalTableRegistry.rawDatasetEntries,
    externalTableRegistry.sqlAssetEntries
  ]);

  const selectedResult = getNodeResult(chainData, selectedNodeId);
  const selectedSchema = selectedResult?.schema || [];
  const selectedData = selectedResult?.sampleRows || selectedResult?.data || [];
  const deleteModalDependencies = deleteModalState?.dependencies || [];
  const deleteModalDependents = deleteModalState?.dependents || [];
  const deleteModalTarget = deleteModalState?.title
    || (deleteModalState?.type === 'dataset'
      ? 'this dataset'
      : (deleteModalState?.assetType === ASSET_TYPES.RAW_DATASET
        ? 'this raw dataset'
        : (deleteModalState?.assetType === ASSET_TYPES.SQL ? 'this SQL transformation' : 'this exploration')));
  const deleteModalTypeLabel = deleteModalState?.type === 'dataset'
    ? 'dataset'
    : (deleteModalState?.assetType === ASSET_TYPES.RAW_DATASET
      ? 'raw dataset'
      : (deleteModalState?.assetType === ASSET_TYPES.SQL ? 'SQL transformation' : 'exploration'));

  const renderModeLabels = {
    classic: 'Classic',
    classicSmart: 'Classic smart',
    entangledSmart: 'Entangled smart',
    entangled: 'Entangled',
    singleStream: 'Single stream',
    mobile: 'Mobile',
    freeLayout: 'Free layout'
  };
  const renderModeIcons = {
    classic: LayoutClassic,
    classicSmart: LayoutClassicSmart,
    entangledSmart: LayoutEntangledSmart,
    entangled: LayoutEntangled,
    singleStream: LayoutSingleStream,
    mobile: LayoutMobile,
    freeLayout: LayoutFree
  };
  const renderModeIconSize = 14;
  const renderModeMenuLabel = (IconComponent: React.ComponentType<{ size?: number }>, label: string, tag?: React.ReactNode) => (
    <div className="flex items-center gap-2">
      <IconComponent size={renderModeIconSize} />
      <span>{label}</span>
      {tag}
    </div>
  );

  const newAssetMenu = {
    items: [
      { key: ASSET_TYPES.EXPLORATION, label: 'Exploration' },
      { key: ASSET_TYPES.RAW_DATASET, label: 'Raw dataset' },
      { key: ASSET_TYPES.SQL, label: 'SQL transformation' }
    ],
    onClick: ({ key }) => startNewAsset(key)
  };

  const buildCardMenu = (onDuplicate, onDelete, options = {}) => {
    const { onFlatten, isFlattened } = options;
    const items = [];
    if (onFlatten) {
      items.push({
        key: 'flatten',
        label: isFlattened ? 'Flattened' : 'Flatten dataset',
        disabled: isFlattened
      });
    }
    items.push(
      { key: 'duplicate', label: 'Duplicate' },
      { key: 'delete', label: 'Delete', danger: true }
    );
    return {
      items,
      onClick: ({ key }) => {
        if (key === 'flatten') onFlatten?.();
        if (key === 'duplicate') onDuplicate?.();
        if (key === 'delete') onDelete?.();
      }
    };
  };

  const renderExplorationEmpty = () => (
    <div className={`bg-white border border-gray-200 rounded-2xl text-center shadow-sm dark:bg-slate-900 dark:border-slate-700 ${isMobileMode ? 'p-6' : 'p-10'}`}>
      <Empty
        description={
          <div className="space-y-1">
            <div className="text-base font-semibold text-gray-900 dark:text-slate-100">No explorations yet</div>
            <span className="text-muted-foreground">Upload data, build a workflow, then Save & Exit to see it here.</span>
          </div>
        }
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className={isMobileMode ? 'w-full' : ''}>
              <Plus size={14} />
              Create new asset
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => startNewAsset(ASSET_TYPES.EXPLORATION)}>Exploration</DropdownMenuItem>
            <DropdownMenuItem onClick={() => startNewAsset(ASSET_TYPES.RAW_DATASET)}>Raw dataset</DropdownMenuItem>
            <DropdownMenuItem onClick={() => startNewAsset(ASSET_TYPES.SQL)}>SQL transformation</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Empty>
    </div>
  );

  const renderRawDatasetEmpty = () => (
    <div className={`bg-white border border-gray-200 rounded-2xl text-center shadow-sm dark:bg-slate-900 dark:border-slate-700 ${isMobileMode ? 'p-6' : 'p-8'}`}>
      <Empty
        description={(
          <div className="space-y-1">
            <div className="text-base font-semibold text-gray-900 dark:text-slate-100">No raw datasets yet</div>
            <span className="text-muted-foreground">Ingest a dataset and save it to reuse across explorations.</span>
          </div>
        )}
      >
        <Button onClick={() => startNewAsset(ASSET_TYPES.RAW_DATASET)} className={isMobileMode ? 'w-full' : ''}>
          <Plus size={14} />
          New raw dataset
        </Button>
      </Empty>
    </div>
  );

  const renderSqlAssetEmpty = () => (
    <div className={`bg-white border border-gray-200 rounded-2xl text-center shadow-sm dark:bg-slate-900 dark:border-slate-700 ${isMobileMode ? 'p-6' : 'p-8'}`}>
      <Empty
        description={(
          <div className="space-y-1">
            <div className="text-base font-semibold text-gray-900 dark:text-slate-100">No SQL transformations yet</div>
            <span className="text-muted-foreground">Build a reusable SQL transformation on top of any dataset.</span>
          </div>
        )}
      >
        <Button onClick={() => startNewAsset(ASSET_TYPES.SQL)} className={isMobileMode ? 'w-full' : ''}>
          <Plus size={14} />
          New SQL transformation
        </Button>
      </Empty>
    </div>
  );

  const renderExplorationCards = () => {
    const renderSectionHeader = (title, subtitle) => (
      <div className="flex flex-col gap-1">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
    );

    const renderExplorationGrid = () => (
      visibleExplorations.length === 0
        ? renderExplorationEmpty()
        : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleExplorations.map((exp) => {
            const order = exp.dataModel?.order || [];
            const tableCount = exp.tableCount ?? order.length;
            const rowCount = exp.rowCount ?? order.reduce((sum, name) => sum + ((exp.dataModel?.tables?.[name] || []).length), 0);
            const nodesList = Array.isArray(exp.nodes) ? exp.nodes : [];
            const nodeCount = nodesList.length;
            const branchCount = nodesList.reduce((sum, node) => (
              getChildren(nodesList, node.id).length === 0 ? sum + 1 : sum
            ), 0);
            const displayName = exp.name || 'Exploration';
            const description = exp.description || '';
            const descriptionLabel = description || 'Add a description';
            const descriptionTone = description
              ? 'text-slate-700 dark:text-slate-200'
              : 'text-slate-500 dark:text-slate-400 italic';
            const updated = exp.updatedAt ? new Date(exp.updatedAt).toLocaleString() : '';
            const updatedLabel = updated ? `Updated ${updated}` : 'Updated just now';
            const isEditingName = editingExplorationId === exp.id;
            const isEditingDescription = editingExplorationDescriptionId === exp.id;
            const cardMenu = buildCardMenu(
              () => duplicateAsset(exp.id),
              () => openDeleteExplorationModal(exp.id)
            );
            return (
              <Card
                key={exp.id}
                className="exploration-card group h-full rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/80 flex flex-col"
              >
                <CardHeader className="flex-row items-center justify-between space-y-0 gap-2" style={{ padding: '12px 16px' }}>
                  <CardTitle className="text-sm font-semibold p-0 m-0 w-full min-w-0">
                {(
                  <div className="exploration-card-title">
                    <div className="flex flex-col gap-1 w-full min-w-0">
                      <div className={`relative flex-1 min-w-0 group/exp-card-title ${cardTitleHeightClass}`}>
                        <div className={isEditingName ? 'opacity-0' : ''}>
                          <div
                            className={`exploration-card-title-text truncate text-slate-900 dark:text-slate-100 ${cardTitleTextClass} ${editableFieldPadding}`}
                            title={displayName}
                          >
                            {displayName}
                          </div>
                        </div>
                        {isEditingName && (
                          <input
                            ref={explorationNameInputRef}
                            className={`absolute inset-0 h-full w-full rounded-md border border-blue-400 bg-white/95 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-900 dark:text-slate-100 ${cardTitleTextClass} ${editableFieldPadding}`}
                            value={editingExplorationNameDraft}
                            onChange={(e) => setEditingExplorationNameDraft(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                skipExplorationNameCommitRef.current = true;
                                e.preventDefault();
                                commitEditingExplorationName(exp.id);
                              }
                              if (e.key === 'Escape') {
                                skipExplorationNameCommitRef.current = true;
                                e.preventDefault();
                                cancelEditingExplorationName();
                              }
                            }}
                            onBlur={() => {
                              if (skipExplorationNameCommitRef.current) {
                                skipExplorationNameCommitRef.current = false;
                                return;
                              }
                              commitEditingExplorationName(exp.id);
                            }}
                            aria-label="Rename exploration"
                          />
                        )}
                        {!isEditingName && (
                          <button
                            type="button"
                            className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 transition-opacity pointer-events-none group-hover/exp-card-title:opacity-100 group-hover/exp-card-title:pointer-events-auto ${editButtonClass}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingExplorationName(exp.id, displayName);
                            }}
                            aria-label="Rename exploration"
                          >
                            <EditIcon size={editIconSize} />
                          </button>
                        )}
                      </div>
                      <div className={`relative group/exp-card-desc w-full min-w-0 ${descriptionHeightClass}`}>
                        <div className={isEditingDescription ? 'opacity-0' : ''}>
                          <div
                            className={`truncate ${descriptionTextClass} ${descriptionTone} ${editableFieldPadding}`}
                            title={descriptionLabel}
                          >
                            {descriptionLabel}
                          </div>
                        </div>
                        {isEditingDescription && (
                          <input
                            ref={explorationDescriptionInputRef}
                            className={`absolute inset-0 h-full w-full rounded-md border border-blue-400 bg-white/95 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-900 dark:text-slate-100 ${descriptionTextClass} ${editableFieldPadding}`}
                            value={editingExplorationDescriptionDraft}
                            onChange={(e) => setEditingExplorationDescriptionDraft(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                skipExplorationDescriptionCommitRef.current = true;
                                e.preventDefault();
                                commitEditingExplorationDescription(exp.id);
                              }
                              if (e.key === 'Escape') {
                                skipExplorationDescriptionCommitRef.current = true;
                                e.preventDefault();
                                cancelEditingExplorationDescription();
                              }
                            }}
                            onBlur={() => {
                              if (skipExplorationDescriptionCommitRef.current) {
                                skipExplorationDescriptionCommitRef.current = false;
                                return;
                              }
                              commitEditingExplorationDescription(exp.id);
                            }}
                            aria-label="Edit exploration description"
                          />
                        )}
                        {!isEditingDescription && (
                          <button
                            type="button"
                            className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 transition-opacity pointer-events-none group-hover/exp-card-desc:opacity-100 group-hover/exp-card-desc:pointer-events-auto ${editButtonClass}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingExplorationDescription(exp.id, description);
                            }}
                            aria-label="Edit exploration description"
                          >
                            <EditIcon size={editIconSize} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                  </CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        aria-label="Exploration actions"
                      >
                        <MoreHorizontal size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {cardMenu.items.map((item) => (
                        <DropdownMenuItem
                          key={item.key}
                          onClick={() => cardMenu.onClick({ key: item.key })}
                          disabled={item.disabled}
                          className={item.danger ? 'text-destructive focus:text-destructive' : ''}
                        >
                          {item.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="p-4 flex flex-1 flex-col">
                <div className="flex w-full flex-1 flex-col">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-muted-foreground">
                      {updatedLabel}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="rounded-full px-2">
                        {tableCount} tables
                      </Badge>
                      <Badge variant="secondary" className="rounded-full px-2">
                        {rowCount} rows
                      </Badge>
                      <Badge variant="secondary" className="rounded-full px-2">
                        {nodeCount} nodes
                      </Badge>
                      <Badge variant="secondary" className="rounded-full px-2">
                        {branchCount} branches
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-auto w-full pt-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => openAsset(exp)}
                    >
                      <Play size={14} />
                      Open Exploration
                    </Button>
                  </div>
                </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        )
    );

    const renderRawDatasetGrid = () => (
      rawDatasetAssets.length === 0
        ? renderRawDatasetEmpty()
        : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rawDatasetAssets.map((asset) => {
            const snapshot = asset.datasetSnapshot || {};
            const rowCount = Number.isFinite(snapshot.rowCount) ? snapshot.rowCount : 0;
            const columnCount = Array.isArray(snapshot.schema) ? snapshot.schema.length : 0;
            const updated = asset.updatedAt ? new Date(asset.updatedAt).toLocaleString() : '';
            const updatedLabel = updated ? `Updated ${updated}` : 'Updated just now';
            const displayName = asset.name || asset.rawDataName || 'Raw dataset';
            const cardMenu = buildCardMenu(
              () => duplicateAsset(asset.id),
              () => openDeleteExplorationModal(asset.id)
            );
            return (
              <Card
                key={asset.id}
                className="raw-dataset-card group h-full rounded-2xl border border-blue-300/80 bg-blue-50/80 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-blue-600/70 dark:bg-blue-950/30 flex flex-col"
              >
                <CardHeader className="flex-row items-center justify-between space-y-0 gap-2" style={{ padding: '12px 16px' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <CardTitle className="text-sm font-semibold p-0 m-0 truncate">
                      {displayName}
                    </CardTitle>
                    <Badge variant="outline" className="rounded-full px-2 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30 shrink-0">
                      Raw dataset
                    </Badge>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        aria-label="Raw dataset actions"
                      >
                        <MoreHorizontal size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {cardMenu.items.map((item) => (
                        <DropdownMenuItem
                          key={item.key}
                          onClick={() => cardMenu.onClick({ key: item.key })}
                          disabled={item.disabled}
                          className={item.danger ? 'text-destructive focus:text-destructive' : ''}
                        >
                          {item.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="p-4 flex flex-1 flex-col">
                <div className="flex w-full flex-1 flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-muted-foreground">
                      {updatedLabel}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="rounded-full px-2">
                        {rowCount} rows
                      </Badge>
                      <Badge variant="secondary" className="rounded-full px-2">
                        {columnCount} columns
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-auto w-full pt-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => openAsset(asset)}
                    >
                      <Play size={14} />
                      Open Raw Dataset
                    </Button>
                  </div>
                </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        )
    );

    const renderSqlAssetGrid = () => (
      sqlAssets.length === 0
        ? renderSqlAssetEmpty()
        : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sqlAssets.map((asset) => {
            const snapshot = asset.sqlSnapshot || {};
            const rowCount = Number.isFinite(snapshot.rowCount) ? snapshot.rowCount : 0;
            const columnCount = Array.isArray(snapshot.schema) ? snapshot.schema.length : 0;
            const updated = asset.updatedAt ? new Date(asset.updatedAt).toLocaleString() : '';
            const updatedLabel = updated ? `Updated ${updated}` : 'Updated just now';
            const displayName = asset.name || 'SQL transformation';
            const inputEntry = asset.sqlInputTable ? externalTableRegistry.allByName?.[asset.sqlInputTable] : null;
            const inputLabel = inputEntry?.label || asset.sqlInputTable || 'No input selected';
            const cardMenu = buildCardMenu(
              () => duplicateAsset(asset.id),
              () => openDeleteExplorationModal(asset.id)
            );
            return (
              <Card
                key={asset.id}
                className="sql-asset-card group h-full rounded-2xl border border-fuchsia-300/80 bg-fuchsia-50/80 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-fuchsia-600/70 dark:bg-fuchsia-950/30 flex flex-col"
              >
                <CardHeader className="flex-row items-center justify-between space-y-0 gap-2" style={{ padding: '12px 16px' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <CardTitle className="text-sm font-semibold p-0 m-0 truncate text-slate-900 dark:text-slate-100">
                      {displayName}
                    </CardTitle>
                    <Badge variant="outline" className="rounded-full px-2 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/30 shrink-0">
                      SQL
                    </Badge>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        aria-label="SQL asset actions"
                      >
                        <MoreHorizontal size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {cardMenu.items.map((item) => (
                        <DropdownMenuItem
                          key={item.key}
                          onClick={() => cardMenu.onClick({ key: item.key })}
                          disabled={item.disabled}
                          className={item.danger ? 'text-destructive focus:text-destructive' : ''}
                        >
                          {item.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="p-4 flex flex-1 flex-col">
                <div className="flex w-full flex-1 flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-muted-foreground">
                      {updatedLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Input: {inputLabel}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="rounded-full px-2">
                        {rowCount} rows
                      </Badge>
                      <Badge variant="secondary" className="rounded-full px-2">
                        {columnCount} columns
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-auto w-full pt-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => openAsset(asset)}
                    >
                      <Play size={14} />
                      Open SQL Transformation
                    </Button>
                  </div>
                </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        )
    );

    return (
      <div className="space-y-10">
        <div className="space-y-4">
          {renderSectionHeader('Explorations', 'Node-based workflows and datasets.')}
          {renderExplorationGrid()}
        </div>
        <div className="space-y-4">
          {renderSectionHeader('Raw datasets', 'Ingested tables ready to reuse.')}
          {renderRawDatasetGrid()}
        </div>
        <div className="space-y-4">
          {renderSectionHeader('SQL transformations', 'Reusable SQL transformations.')}
          {renderSqlAssetGrid()}
        </div>
      </div>
    );
  };

  const renderExplorationGraph = () => (
    workbenchDependencyGraph.nodes.length === 0 ? renderExplorationEmpty() : (
      <WorkbenchDependencyGraph
        nodes={workbenchDependencyGraph.nodes}
        edges={workbenchDependencyGraph.edges}
        anchorsByNodeId={workbenchDependencyGraph.anchorsByNodeId}
        placementHints={graphPlacementHints}
        onOpenAsset={(assetId) => {
          const asset = explorations.find((item) => item.id === assetId);
          if (asset) openAsset(asset);
        }}
        onOpenDataset={(entry) => {
          if (!entry) return;
          const exp = explorations.find((item) => item.id === entry.explorationId);
          if (exp) openAsset(exp, { focusNodeId: entry.nodeId });
        }}
        onFlattenDataset={openFlattenModal}
        onDuplicateAsset={duplicateAsset}
        onDeleteAsset={openDeleteExplorationModal}
        onDuplicateDataset={duplicateDatasetEntry}
        onDeleteDataset={openDeleteDatasetModal}
        className={isLandingGraph ? 'flex-1 min-h-0' : ''}
      />
    )
  );

  const renderDatasetCards = () => (
    <div className="pt-6 space-y-4">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Saved datasets</div>
        <span className="text-xs text-muted-foreground">Dataset outputs saved from explorations.</span>
      </div>
      {datasetEntries.length === 0 ? (
        <div className={`mt-4 bg-white border border-gray-200 rounded-2xl text-center shadow-sm dark:bg-slate-900 dark:border-slate-700 ${isMobileMode ? 'p-6' : 'p-8'}`}>
          <Empty
            description={
              <div className="space-y-1">
                <div className="text-base font-semibold text-gray-900 dark:text-slate-100">No data sets yet</div>
                <span className="text-muted-foreground">Save an end node as a data set to surface it here.</span>
              </div>
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {datasetEntries.map((dataset) => {
            const datasetTitle = dataset.nodeTitle || 'Dataset';
            const updated = dataset.explorationUpdatedAt ? new Date(dataset.explorationUpdatedAt).toLocaleString() : '';
            const updatedLabel = updated ? `Updated ${updated}` : 'Updated just now';
            const columnCount = dataset.schema?.length || 0;
            const rowCount = dataset.rowCount || 0;
            const dependencies = Array.isArray(dataset.dependencies) ? dataset.dependencies : [];
            const descriptionLabel = dataset.explorationDescription || 'No description';
            const cardMenu = buildCardMenu(
              () => duplicateDatasetEntry(dataset),
              () => openDeleteDatasetModal(dataset),
              {
                onFlatten: () => openFlattenModal(dataset),
                isFlattened: dataset.isFlattened
              }
            );
            return (
              <Card
                key={`${dataset.explorationId}-${dataset.nodeId}`}
                className="dataset-card group h-full rounded-2xl border border-emerald-200/70 bg-white/95 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-emerald-700/60 dark:bg-slate-900/90 flex flex-col"
              >
                <CardHeader className="flex-row items-center justify-between space-y-0 gap-2" style={{ padding: '12px 16px' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <CardTitle className="text-sm font-semibold p-0 m-0 truncate text-slate-900 dark:text-slate-100">
                      {datasetTitle}
                    </CardTitle>
                    <Badge variant="outline" className="rounded-full px-2 bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30 shrink-0">
                      {dataset.isFlattened ? 'Flattened dataset' : 'Dataset'}
                    </Badge>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        aria-label="Dataset actions"
                      >
                        <MoreHorizontal size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {cardMenu.items.map((item) => (
                        <DropdownMenuItem
                          key={item.key}
                          onClick={() => cardMenu.onClick({ key: item.key })}
                          disabled={item.disabled}
                          className={item.danger ? 'text-destructive focus:text-destructive' : ''}
                        >
                          {item.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="p-4 flex flex-1 flex-col">
                <div className="flex w-full flex-1 flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-muted-foreground">
                      {updatedLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      From {dataset.explorationName || 'Exploration'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {descriptionLabel}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="rounded-full px-2">
                        {rowCount} rows
                      </Badge>
                      <Badge variant="secondary" className="rounded-full px-2">
                        {columnCount} columns
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                      Dependencies
                    </span>
                    {dependencies.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        No external dependencies.
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        {dependencies.map((dep) => (
                          <Badge
                            key={`${dep.assetId || dep.explorationId || dep.name}:${dep.nodeId || 'dep'}`}
                            variant={dep.isDataset ? 'outline' : 'secondary'}
                            className={`rounded-full px-2 ${dep.isDataset ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30' : ''}`}
                            title={dep.explorationName ? `From ${dep.explorationName}` : undefined}
                          >
                            {dep.label || 'Dependency'}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto w-full pt-1">
                    <div className="flex flex-col gap-2 w-full">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          const exp = explorations.find((item) => item.id === dataset.explorationId);
                          if (exp) {
                            openAsset(exp, { focusNodeId: dataset.nodeId });
                          }
                        }}
                      >
                        <Play size={14} />
                        Open Exploration
                      </Button>
                    </div>
                  </div>
                </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

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

  const activeExploration = explorations.find(exp => exp.id === activeExplorationId);
  const resolvedActiveAssetType = activeExploration ? resolveAssetType(activeExploration) : activeAssetType;
  const activeAssetFallback = resolveAssetFallbackName(resolvedActiveAssetType);
  const explorationDisplayName = activeExploration?.name || draftExplorationName || rawDataName || activeAssetFallback;
  const explorationDescription = activeExploration?.description ?? draftExplorationDescription ?? '';
  const isExplorationMode = resolvedActiveAssetType === ASSET_TYPES.EXPLORATION;
  const isRawDatasetMode = resolvedActiveAssetType === ASSET_TYPES.RAW_DATASET;
  const isSqlAssetMode = resolvedActiveAssetType === ASSET_TYPES.SQL;
  const explorationDescriptionLabel = explorationDescription || 'Add a description';
  const explorationDescriptionTone = explorationDescription
    ? 'text-gray-400 dark:text-slate-400'
    : 'text-gray-400 dark:text-slate-500 italic';
  const isFlattenedDataset = resolvedActiveAssetType === ASSET_TYPES.EXPLORATION && (
    activeExploration?.isFlattenedDataset === true
    || nodes.some((node) => node.params?.isFlattened && node.params?.datasetSnapshot)
  );
  const editButtonClass = 'inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-slate-600 shadow-sm transition hover:text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200';
  const landingSegmentBaseClass = '!font-medium !border transition-colors';
  const landingSegmentActiveClass = [
    '!bg-slate-700 !text-white !border-slate-700',
    'hover:!bg-slate-600 hover:!border-slate-600',
    'dark:!bg-slate-500/90 dark:!border-slate-400/80 dark:!text-white',
    'dark:hover:!bg-slate-400/90 dark:hover:!border-slate-400/90'
  ].join(' ');
  const landingSegmentInactiveClass = [
    '!bg-white !text-slate-700 !border-slate-200',
    'hover:!text-slate-900 hover:!border-slate-300',
    'dark:!bg-slate-900 dark:!text-slate-200 dark:!border-slate-700',
    'dark:hover:!text-slate-100 dark:hover:!border-slate-500/70'
  ].join(' ');
  const landingSegmentButtonClass = (isActive) => (
    `${landingSegmentBaseClass} ${isActive ? landingSegmentActiveClass : landingSegmentInactiveClass}`
  );
  const editIconSize = 12;
  const editableFieldPadding = 'pl-1 pr-8 py-0.5';
  const titleTextClass = isMobileMode ? 'text-base leading-5' : 'text-lg leading-6';
  const titleHeightClass = isMobileMode ? 'min-h-[24px]' : 'min-h-[28px]';
  const descriptionTextClass = 'text-xs leading-4';
  const descriptionHeightClass = 'min-h-[20px]';
  const cardTitleTextClass = 'text-sm font-semibold leading-5';
  const cardTitleHeightClass = 'min-h-[24px]';
  const dataModelCellPadding = tableDensity === 'dense' ? 'p-2' : 'p-3';
  const dataModelTextSize = tableDensity === 'dense' ? 'text-xs' : 'text-sm';
  const dataModelHeaderTextSize = tableDensity === 'dense' ? 'text-[11px]' : 'text-xs';
  const activeRenderModeLabel = renderModeLabels[renderMode] || 'Classic';
  const ActiveRenderModeIcon = renderModeIcons[renderMode] || LayoutClassic;
  const isLandingGraph = landingViewMode === 'graph';

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100 overflow-hidden">
      {/* 1. LEFT SIDEBAR */}
      {!isMobileMode && (
        <div className="w-16 flex-shrink-0 bg-white flex flex-col items-center text-slate-500 border-r border-gray-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 z-50">
          <div className="w-full h-16 bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Layout size={22} />
          </div>
          <div className="flex-1 w-full flex flex-col items-center py-6 gap-6">
            <div
              onClick={() => {
                goToExplorations();
              }}
              className={`p-2.5 rounded-lg cursor-pointer transition-colors relative group ${
                viewMode === 'landing' ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Explorations"
            >
              <AppsIcon size={20} />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="mt-auto p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors relative group">
                  <Settings size={20} />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right">
                <DropdownMenuLabel>Theme</DropdownMenuLabel>
                <DropdownMenuCheckboxItem checked={themePreference === 'light'} onCheckedChange={() => onThemeChange?.('light')}>Light</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={themePreference === 'dark'} onCheckedChange={() => onThemeChange?.('dark')}>Dark</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={themePreference === 'auto'} onCheckedChange={() => onThemeChange?.('auto')}>Auto (system)</DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Table density</DropdownMenuLabel>
                <DropdownMenuCheckboxItem checked={tableDensity === 'comfortable'} onCheckedChange={() => setTableDensity('comfortable')}>Less dense</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={tableDensity === 'dense'} onCheckedChange={() => setTableDensity('dense')}>More dense</DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* 2. MAIN CANVAS AREA */}
      <div className="flex-1 flex flex-col relative overflow-hidden min-h-0 bg-[#F8FAFC] dark:bg-slate-950">
        <header className={`bg-white border-b border-gray-200 flex items-center justify-between shadow-sm z-40 relative dark:bg-slate-900 dark:border-slate-700 ${isMobileMode ? 'flex-wrap gap-2 px-4 py-3' : 'h-16 px-8'}`}>
          <div className={`flex items-center gap-4 ${isMobileMode ? 'w-full justify-between' : ''}`}>
            <div className="flex items-center gap-3 min-w-0">
              {viewMode === 'canvas' && (
                <Button
                  size={isMobileMode ? 'sm' : 'default'}
                  variant="ghost"
                  onClick={goToExplorations}
                  className={`${isMobileMode ? 'h-8 w-8' : 'h-9 w-9'} p-0`}
                  style={{ padding: 0 }}
                  aria-label="Back to explorations"
                >
                  <ArrowLeft size={16} />
                </Button>
              )}
              <div className="min-w-0 flex flex-col gap-0.5">
                {viewMode === 'canvas' ? (
                  <div className={`relative group/exp-title min-w-0 ${titleHeightClass}`}>
                    <div className={isEditingActiveName ? 'opacity-0' : ''}>
                      <div
                        className={`truncate font-semibold text-gray-900 dark:text-slate-100 ${titleTextClass} ${editableFieldPadding}`}
                        title={explorationDisplayName}
                      >
                        {explorationDisplayName}
                      </div>
                    </div>
                    {isEditingActiveName && (
                      <input
                        ref={activeNameInputRef}
                        className={`absolute inset-0 h-full w-full rounded-md border border-blue-400 bg-white/95 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-900 dark:text-slate-100 ${titleTextClass} ${editableFieldPadding}`}
                        value={activeNameDraft}
                        onChange={(e) => setActiveNameDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            skipActiveNameCommitRef.current = true;
                            e.preventDefault();
                            commitEditingActiveName();
                          }
                          if (e.key === 'Escape') {
                            skipActiveNameCommitRef.current = true;
                            e.preventDefault();
                            cancelEditingActiveName();
                          }
                        }}
                        onBlur={() => {
                          if (skipActiveNameCommitRef.current) {
                            skipActiveNameCommitRef.current = false;
                            return;
                          }
                          commitEditingActiveName();
                        }}
                        aria-label="Rename exploration"
                      />
                    )}
                    {!isEditingActiveName && (
                      <button
                        type="button"
                        className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 transition-opacity pointer-events-none group-hover/exp-title:opacity-100 group-hover/exp-title:pointer-events-auto ${editButtonClass}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditingActiveName();
                        }}
                        aria-label="Rename exploration"
                      >
                        <EditIcon size={editIconSize} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className={`font-bold text-gray-900 dark:text-slate-100 ${isMobileMode ? 'text-base' : 'text-lg'}`}>Workbench</div>
                )}
                {!isMobileMode && (
                  viewMode === 'canvas' ? (
                    <div className={`relative group/exp-desc min-w-0 ${descriptionHeightClass}`}>
                      <div className={isEditingActiveDescription ? 'opacity-0' : ''}>
                        <div
                          className={`truncate ${descriptionTextClass} ${explorationDescriptionTone} ${editableFieldPadding}`}
                          title={explorationDescriptionLabel}
                        >
                          {explorationDescriptionLabel}
                        </div>
                      </div>
                      {isEditingActiveDescription && (
                        <input
                          ref={activeDescriptionInputRef}
                          className={`absolute inset-0 h-full w-full rounded-md border border-blue-400 bg-white/95 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-900 dark:text-slate-100 ${descriptionTextClass} ${editableFieldPadding}`}
                          value={activeDescriptionDraft}
                          onChange={(e) => setActiveDescriptionDraft(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              skipActiveDescriptionCommitRef.current = true;
                              e.preventDefault();
                              commitEditingActiveDescription();
                            }
                            if (e.key === 'Escape') {
                              skipActiveDescriptionCommitRef.current = true;
                              e.preventDefault();
                              cancelEditingActiveDescription();
                            }
                          }}
                          onBlur={() => {
                            if (skipActiveDescriptionCommitRef.current) {
                              skipActiveDescriptionCommitRef.current = false;
                              return;
                            }
                            commitEditingActiveDescription();
                          }}
                          aria-label="Edit exploration description"
                        />
                      )}
                      {!isEditingActiveDescription && (
                        <button
                          type="button"
                          className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 transition-opacity pointer-events-none group-hover/exp-desc:opacity-100 group-hover/exp-desc:pointer-events-auto ${editButtonClass}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingActiveDescription();
                          }}
                          aria-label="Edit exploration description"
                        >
                          <EditIcon size={editIconSize} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 dark:text-slate-400">Workbench</div>
                  )
                )}
              </div>
            </div>
            {isMobileMode && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={viewMode === 'landing' ? 'default' : 'outline'}
                  onClick={() => {
                    goToExplorations();
                  }}
                  aria-label="Explorations"
                >
                  <AppsIcon size={16} />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" aria-label="Settings"><Settings size={16} /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Theme</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem checked={themePreference === 'light'} onCheckedChange={() => onThemeChange?.('light')}>Light</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={themePreference === 'dark'} onCheckedChange={() => onThemeChange?.('dark')}>Dark</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={themePreference === 'auto'} onCheckedChange={() => onThemeChange?.('auto')}>Auto (system)</DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Table density</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem checked={tableDensity === 'comfortable'} onCheckedChange={() => setTableDensity('comfortable')}>Less dense</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={tableDensity === 'dense'} onCheckedChange={() => setTableDensity('dense')}>More dense</DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
          <div className={`flex items-center gap-3 ${isMobileMode ? 'w-full flex-wrap' : ''}`}>
            {viewMode === 'canvas' && (
              <div className="flex items-center gap-2 flex-wrap">
                {isMobileMode && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {!isSqlAssetMode && (
                      <Button
                        size="sm"
                        variant={isStatsCollapsed ? 'outline' : 'secondary'}
                        onClick={() => (isStatsCollapsed ? expandStatsPanel() : collapseStatsPanel())}
                      >
                        Stats
                      </Button>
                    )}
                    {!isSqlAssetMode && (
                      <Button
                        size="sm"
                        variant={isPropertiesCollapsed ? 'outline' : 'secondary'}
                        onClick={() => (isPropertiesCollapsed ? expandPropertiesPanel() : collapsePropertiesPanel())}
                      >
                        Properties
                      </Button>
                    )}
                  </div>
                )}
                <Button
                  size={isMobileMode ? 'sm' : 'default'}
                  variant="ghost"
                  onClick={() => setShowHelp(true)}
                  aria-label="Help"
                  title="Help"
                >
                  <QuestionCircle size={16} />
                </Button>
                <div className={`flex [&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-l-none ${isMobileMode ? '' : ''}`}>
                  <Button
                    size={isMobileMode ? 'sm' : 'default'}
                    variant="outline"
                    onClick={undo}
                    disabled={historyIndex === 0}
                    aria-label="Undo"
                  >
                    <Undo size={16} />
                  </Button>
                  <Button
                    size={isMobileMode ? 'sm' : 'default'}
                    variant="outline"
                    onClick={redo}
                    disabled={historyIndex === history.length - 1}
                    aria-label="Redo"
                  >
                    <Redo size={16} />
                  </Button>
                </div>
                {isExplorationMode && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size={isMobileMode ? 'sm' : 'default'}>
                        <ActiveRenderModeIcon size={renderModeIconSize} />
                        {activeRenderModeLabel}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuCheckboxItem checked={renderMode === 'classic'} onCheckedChange={() => setRenderMode('classic')}>
                        {renderModeMenuLabel(LayoutClassic, 'Classic')}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={renderMode === 'classicSmart'} onCheckedChange={() => setRenderMode('classicSmart')}>
                        {renderModeMenuLabel(LayoutClassicSmart, 'Classic smart')}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={renderMode === 'entangledSmart'} onCheckedChange={() => setRenderMode('entangledSmart')}>
                        {renderModeMenuLabel(LayoutEntangledSmart, 'Entangled smart')}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={renderMode === 'entangled'} onCheckedChange={() => setRenderMode('entangled')}>
                        {renderModeMenuLabel(LayoutEntangled, 'Entangled')}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={renderMode === 'singleStream'} onCheckedChange={() => setRenderMode('singleStream')}>
                        {renderModeMenuLabel(LayoutSingleStream, 'Single stream')}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={renderMode === 'mobile'} onCheckedChange={() => setRenderMode('mobile')}>
                        {renderModeMenuLabel(LayoutMobile, 'Mobile', <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30">Auto</Badge>)}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={renderMode === 'freeLayout'} onCheckedChange={() => setRenderMode('freeLayout')}>
                        {renderModeMenuLabel(LayoutFree, 'Free layout')}
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button size={isMobileMode ? 'sm' : 'default'} onClick={saveAsset}>
                  <Save size={14} />
                  Save & Exit
                </Button>
                {saveError && (
                  <span className="text-xs text-destructive">
                    {saveError}
                  </span>
                )}
              </div>
            )}
            {viewMode === 'landing' && (
              <div className={`flex items-center gap-3 flex-wrap ${isMobileMode ? 'w-full' : ''}`}>
                <div className={`flex [&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-l-none ${isMobileMode ? 'w-full' : ''}`}>
                  <Button
                    variant="outline"
                    onClick={() => setLandingViewMode('cards')}
                    className={`${landingSegmentButtonClass(landingViewMode === 'cards')} ${isMobileMode ? 'w-full' : ''}`}
                  >
                    Cards
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setLandingViewMode('graph')}
                    className={`${landingSegmentButtonClass(landingViewMode === 'graph')} ${isMobileMode ? 'w-full' : ''}`}
                  >
                    Dependency graph
                  </Button>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className={isMobileMode ? 'w-full' : ''}>
                      <Plus size={14} />
                      New Asset
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => startNewAsset(ASSET_TYPES.EXPLORATION)}>Exploration</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => startNewAsset(ASSET_TYPES.RAW_DATASET)}>Raw dataset</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => startNewAsset(ASSET_TYPES.SQL)}>SQL transformation</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </header>

        {viewMode === 'landing' ? (
          <div className={`flex-1 min-h-0 ${isLandingGraph ? 'overflow-hidden' : 'overflow-auto'} bg-slate-50 dark:bg-slate-950`}>
            <div className={isLandingGraph
              ? 'flex h-full min-h-0 flex-col'
              : `space-y-8 ${isMobileMode ? 'max-w-none px-4 py-6' : 'max-w-6xl mx-auto px-10 py-12'}`}
            >
              {landingViewMode === 'cards' ? renderExplorationCards() : renderExplorationGraph()}
              {!isLandingGraph && renderDatasetCards()}
              {/*
              {landingTab === 'explorations' ? (
                landingViewMode === 'cards' ? (
                explorations.length === 0 ? (
                <div className={`bg-white border border-gray-200 rounded-2xl text-center shadow-sm dark:bg-slate-900 dark:border-slate-700 ${isMobileMode ? 'p-6' : 'p-10'}`}>
                  <Empty
                    description={
                      <div className="space-y-1">
                        <div className="text-base font-semibold text-gray-900 dark:text-slate-100">No explorations yet</div>
                        <span className="text-muted-foreground">Upload data, build a workflow, then Save & Exit to see it here.</span>
                      </div>
                    }
                  >
                    <Button onClick={startNewExploration} className={isMobileMode ? 'w-full' : ''}>
                    <Plus size={14} />
                      Create new exploration
                    </Button>
                  </Empty>
                </div>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {explorations.map((exp) => {
                    const order = exp.dataModel?.order || [];
                    const tableCount = exp.tableCount ?? order.length;
                    const rowCount = exp.rowCount ?? order.reduce((sum, name) => sum + ((exp.dataModel?.tables?.[name] || []).length), 0);
                    const nodesList = Array.isArray(exp.nodes) ? exp.nodes : [];
                    const nodeCount = nodesList.length;
                    const branchCount = nodesList.reduce((sum, node) => (
                      getChildren(nodesList, node.id).length === 0 ? sum + 1 : sum
                    ), 0);
                    const displayName = exp.name || 'Exploration';
                    const description = exp.description || '';
                    const descriptionLabel = description;
                    const descriptionTone = description
                      ? 'text-slate-700 dark:text-slate-200'
                      : 'text-slate-500 dark:text-slate-400 italic';
                    const updated = exp.updatedAt ? new Date(exp.updatedAt).toLocaleString() : '';
                    const updatedLabel = updated ? `Updated ${updated}` : 'Updated just now';
                    const isEditingName = editingExplorationId === exp.id;
                    const isEditingDescription = editingExplorationDescriptionId === exp.id;
                    return (
                      <Card
                        key={exp.id}
                        size="sm"
                        variant="borderless"
                        className="exploration-card group h-full rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/80 flex flex-col"
                        styles={{
                          body: {
                            padding: 16,
                            display: 'flex',
                            flexDirection: 'column',
                            flex: 1,
                          },
                          header: { padding: '12px 16px' },
                        }}
                        title={(
                          <div className="exploration-card-title">
                            <div className="flex flex-col gap-1 w-full min-w-0">
                              <div className={`relative flex-1 min-w-0 group/exp-card-title ${cardTitleHeightClass}`}>
                                <div className={isEditingName ? 'opacity-0' : ''}>
                                  <div
                                    className={`exploration-card-title-text truncate text-slate-900 dark:text-slate-100 ${cardTitleTextClass} ${editableFieldPadding}`}
                                    title={displayName}
                                  >
                                    {displayName}
                                  </div>
                                </div>
                                {isEditingName && (
                                  <input
                                    ref={explorationNameInputRef}
                                    className={`absolute inset-0 h-full w-full rounded-md border border-blue-400 bg-white/95 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-900 dark:text-slate-100 ${cardTitleTextClass} ${editableFieldPadding}`}
                                    value={editingExplorationNameDraft}
                                    onChange={(e) => setEditingExplorationNameDraft(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        skipExplorationNameCommitRef.current = true;
                                        e.preventDefault();
                                        commitEditingExplorationName(exp.id);
                                      }
                                      if (e.key === 'Escape') {
                                        skipExplorationNameCommitRef.current = true;
                                        e.preventDefault();
                                        cancelEditingExplorationName();
                                      }
                                    }}
                                    onBlur={() => {
                                      if (skipExplorationNameCommitRef.current) {
                                        skipExplorationNameCommitRef.current = false;
                                        return;
                                      }
                                      commitEditingExplorationName(exp.id);
                                    }}
                                    aria-label="Rename exploration"
                                  />
                                )}
                                {!isEditingName && (
                                  <button
                                    type="button"
                                    className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 transition-opacity pointer-events-none group-hover/exp-card-title:opacity-100 group-hover/exp-card-title:pointer-events-auto ${editButtonClass}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingExplorationName(exp.id, displayName);
                                    }}
                                    aria-label="Rename exploration"
                                  >
                                    <EditIcon size={editIconSize} />
                                  </button>
                                )}
                              </div>
                              <div className={`relative group/exp-card-desc w-full min-w-0 ${descriptionHeightClass}`}>
                                <div className={isEditingDescription ? 'opacity-0' : ''}>
                                  <div
                                    className={`truncate ${descriptionTextClass} ${descriptionTone} ${editableFieldPadding}`}
                                    title={descriptionLabel}
                                  >
                                    {descriptionLabel}
                                  </div>
                                </div>
                                {isEditingDescription && (
                                  <input
                                    ref={explorationDescriptionInputRef}
                                    className={`absolute inset-0 h-full w-full rounded-md border border-blue-400 bg-white/95 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-900 dark:text-slate-100 ${descriptionTextClass} ${editableFieldPadding}`}
                                    value={editingExplorationDescriptionDraft}
                                    onChange={(e) => setEditingExplorationDescriptionDraft(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        skipExplorationDescriptionCommitRef.current = true;
                                        e.preventDefault();
                                        commitEditingExplorationDescription(exp.id);
                                      }
                                      if (e.key === 'Escape') {
                                        skipExplorationDescriptionCommitRef.current = true;
                                        e.preventDefault();
                                        cancelEditingExplorationDescription();
                                      }
                                    }}
                                    onBlur={() => {
                                      if (skipExplorationDescriptionCommitRef.current) {
                                        skipExplorationDescriptionCommitRef.current = false;
                                        return;
                                      }
                                      commitEditingExplorationDescription(exp.id);
                                    }}
                                    aria-label="Edit exploration description"
                                  />
                                )}
                                {!isEditingDescription && (
                                  <button
                                    type="button"
                                    className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 transition-opacity pointer-events-none group-hover/exp-card-desc:opacity-100 group-hover/exp-card-desc:pointer-events-auto ${editButtonClass}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingExplorationDescription(exp.id, description);
                                    }}
                                    aria-label="Edit exploration description"
                                  >
                                    <EditIcon size={editIconSize} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        extra={
                          <Button
                            variant="ghost"
                            size="sm"
                            danger
                            onClick={() => openDeleteExplorationModal(exp.id)}
                          >
                            Delete
                          </Button>
                        }
                      >
                        <div className="flex w-full flex-1 flex-col">
                          <div className="flex flex-col gap-2">
                            <span className="text-xs text-muted-foreground">
                              {updatedLabel}
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="rounded-full px-2">
                                {tableCount} tables
                              </Badge>
                              <Badge variant="secondary" className="rounded-full px-2">
                                {rowCount} rows
                              </Badge>
                              <Badge variant="secondary" className="rounded-full px-2">
                                {nodeCount} nodes
                              </Badge>
                              <Badge variant="secondary" className="rounded-full px-2">
                                {branchCount} branches
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-auto w-full pt-2">
                            <Button
                              variant="outline"
                              className="w-full"
                              className="w-full"
                              onClick={() => openExploration(exp)}
                            >
                              Open Exploration
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
                )
              ) : (
                explorations.length === 0 ? (
                  <div className={`bg-white border border-gray-200 rounded-2xl text-center shadow-sm dark:bg-slate-900 dark:border-slate-700 ${isMobileMode ? 'p-6' : 'p-10'}`}>
                    <Empty
                      description={
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-gray-900 dark:text-slate-100">No explorations yet</div>
                          <span className="text-muted-foreground">Upload data, build a workflow, then Save & Exit to see it here.</span>
                        </div>
                      }
                    >
                      <Button onClick={startNewExploration} className={isMobileMode ? 'w-full' : ''}>
                    <Plus size={14} />
                        Create new exploration
                      </Button>
                    </Empty>
                  </div>
                ) : (
                  <WorkbenchDependencyGraph
                    nodes={workbenchDependencyGraph.nodes}
                    edges={workbenchDependencyGraph.edges}
                    anchorsByNodeId={workbenchDependencyGraph.anchorsByNodeId}
                    placementHints={graphPlacementHints}
                    onOpenExploration={(explorationId) => {
                      const exp = explorations.find((item) => item.id === explorationId);
                      if (exp) openExploration(exp);
                    }}
                    onOpenDataset={(entry) => {
                      if (!entry) return;
                      const exp = explorations.find((item) => item.id === entry.explorationId);
                      if (exp) openExploration(exp, { focusNodeId: entry.nodeId });
                    }}
                    className={isLandingGraph ? 'flex-1 min-h-0' : ''}
                  />
                )
              ) : (
                <div className="pt-4">
                  {datasetEntries.length === 0 ? (
                    <div className={`mt-4 bg-white border border-gray-200 rounded-2xl text-center shadow-sm dark:bg-slate-900 dark:border-slate-700 ${isMobileMode ? 'p-6' : 'p-8'}`}>
                      <Empty
                        description={
                          <div className="space-y-1">
                            <div className="text-base font-semibold text-gray-900 dark:text-slate-100">No data sets yet</div>
                            <span className="text-muted-foreground">Save an end node as a data set to surface it here.</span>
                          </div>
                        }
                      />
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {datasetEntries.map((dataset) => {
                        const datasetTitle = dataset.nodeTitle || 'Dataset';
                        const updated = dataset.explorationUpdatedAt ? new Date(dataset.explorationUpdatedAt).toLocaleString() : '';
                        const updatedLabel = updated ? `Updated ${updated}` : 'Updated just now';
                        const columnCount = dataset.schema?.length || 0;
                        const rowCount = dataset.rowCount || 0;
                        const dependencies = Array.isArray(dataset.dependencies) ? dataset.dependencies : [];
                        const descriptionLabel = dataset.explorationDescription || 'No description';
                        return (
                          <Card
                            key={`${dataset.explorationId}-${dataset.nodeId}`}
                            size="sm"
                            variant="borderless"
                            className="dataset-card group h-full rounded-2xl border border-emerald-200/70 bg-white/95 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-emerald-700/60 dark:bg-slate-900/90 flex flex-col"
                            styles={{
                              body: {
                                padding: 16,
                                display: 'flex',
                                flexDirection: 'column',
                                flex: 1,
                              }
                            }}
                            title={(
                              <div className="flex items-center justify-between gap-2 w-full">
                                <div className="truncate text-slate-900 dark:text-slate-100 font-semibold">
                                  {datasetTitle}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="rounded-full px-2 bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30">
                                    {dataset.isFlattened ? 'Flattened dataset' : 'Dataset'}
                                  </Badge>
                                </div>
                              </div>
                            )}
                          >
                            <div className="flex w-full flex-1 flex-col gap-3">
                              <div className="flex flex-col gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {updatedLabel}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  From {dataset.explorationName || 'Exploration'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {descriptionLabel}
                                </span>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="secondary" className="rounded-full px-2">
                                    {rowCount} rows
                                  </Badge>
                                  <Badge variant="secondary" className="rounded-full px-2">
                                    {columnCount} columns
                                  </Badge>
                                </div>
                              </div>

                              <div className="flex flex-col gap-2">
                                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                                  Dependencies
                                </span>
                                {dependencies.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">
                                    No external dependencies.
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {dependencies.map((dep) => (
                                      <Badge
                                        key={`${dep.explorationId}:${dep.nodeId}`}
                                        variant={dep.isDataset ? 'outline' : 'secondary'}
                                        className={`rounded-full px-2 ${dep.isDataset ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30' : ''}`}
                                        title={dep.explorationName ? `From ${dep.explorationName}` : undefined}
                                      >
                                        {dep.label || 'Dependency'}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="mt-auto w-full pt-1">
                                <div className="flex flex-col gap-2 w-full">
                                  <Button
                                    variant="outline"
                                    className="w-full"
                                    className="w-full"
                                    onClick={() => {
                                      const exp = explorations.find((item) => item.id === dataset.explorationId);
                                      if (exp) {
                                        openAsset(exp, { focusNodeId: dataset.nodeId });
                                      }
                                    }}
                                  >
                                    Open Dataset
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="w-full"
                                    disabled={dataset.isFlattened}
                                    onClick={() => openFlattenModal(dataset)}
                                  >
                                    {dataset.isFlattened ? 'Flattened' : 'Flatten dataset'}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              */}
            </div>
          </div>
        ) : (
          isRawDatasetMode ? (
            <RawDatasetAssetView
              nodes={nodes}
              chainData={chainData}
              tableDensity={tableDensity}
              onTableSortChange={handleTableSortChange}
            />
          ) : isSqlAssetMode ? (
            <SqlTransformationAssetView
              nodes={nodes}
              chainData={chainData}
              tableDensity={tableDensity}
              sqlDraftInput={sqlDraftInput}
              sqlDraftText={sqlDraftText}
              sqlDraftError={sqlDraftError}
              sqlDraftMode={sqlDraftMode}
              sqlDraftJoinType={sqlDraftJoinType}
              sqlDraftRightTable={sqlDraftRightTable}
              sqlDraftLeftKey={sqlDraftLeftKey}
              sqlDraftRightKey={sqlDraftRightKey}
              setSqlDraftInput={setSqlDraftInput}
              setSqlDraftText={setSqlDraftText}
              setSqlDraftError={setSqlDraftError}
              setSqlDraftMode={setSqlDraftMode}
              setSqlDraftJoinType={setSqlDraftJoinType}
              setSqlDraftRightTable={setSqlDraftRightTable}
              setSqlDraftLeftKey={setSqlDraftLeftKey}
              setSqlDraftRightKey={setSqlDraftRightKey}
              runSqlDraft={runSqlDraft}
              externalTableRegistry={externalTableRegistry}
              activeExplorationId={activeExplorationId}
              explorations={explorations}
              assetTypes={ASSET_TYPES}
              onTableSortChange={handleTableSortChange}
            />
          ) : (
            <ExplorationAssetView
              renderMode={renderMode}
              renderNodes={renderNodes}
              selectedNodeId={selectedNodeId}
              chainData={chainData}
              tableDensity={tableDensity}
              isMobileMode={isMobileMode}
              isSmartMode={isSmartMode}
              leafCountById={leafCountById}
              branchSelectionByNodeId={branchSelectionByNodeId}
              onSelect={handleSelect}
              onAdd={addNode}
              onInsert={insertNode}
              onRemove={removeNode}
              onToggleExpand={toggleNodeExpansion}
              onToggleBranch={toggleBranchCollapse}
              onToggleDataset={toggleDatasetForNode}
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
              onToggleEntangle={toggleEntangledBranch}
              onSelectBranch={setBranchSelection}
              canvasScrollRef={canvasScrollRef}
              onCanvasClick={() => {
                setShowAddMenuForId(null);
                setShowInsertMenuForId(null);
              }}
            />
          )
        )}

        {viewMode === 'canvas' && isExplorationMode && isMinimapMode && !isMobileMode && (
          <GraphMinimapPanel
            nodes={renderNodes}
            chainData={chainData}
            selectedNodeId={selectedNodeId}
            onSelect={handleSelect}
            className="absolute left-4 top-20 z-40"
          />
        )}

        {viewMode === 'canvas' && !isMobileMode && (isStatsCollapsed || isPropertiesCollapsed) && (
          <div className="absolute right-4 top-20 flex flex-col gap-2 z-40">
            {isStatsCollapsed && !isSqlAssetMode && (
              <Button variant="outline" size="sm" onClick={expandStatsPanel}>
                Show Stats
              </Button>
            )}
            {isPropertiesCollapsed && !isSqlAssetMode && (
              <Button variant="outline" size="sm" onClick={expandPropertiesPanel}>
                Show Properties
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 3. COLUMN STATS PANEL */}
      {viewMode === 'canvas' && !isMobileMode && !isSqlAssetMode && !isStatsCollapsed && !isStatsDetached && (
        <ColumnStatsPanel
          node={nodes.find(n => n.id === selectedNodeId)}
          schema={selectedSchema}
          data={selectedData}
          rowCount={selectedResult?.rowCount || 0}
          getColumnStats={selectedResult?.getColumnStats}
          onCollapse={collapseStatsPanel}
          onToggleDetach={detachStatsPanel}
          isDetached={false}
          isMobile={false}
        />
      )}

      {viewMode === 'canvas' && isMobileMode && !isSqlAssetMode && (
        <Sheet open={!isStatsCollapsed} onOpenChange={(open) => { if (!open) collapseStatsPanel(); }}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-full">
          <ColumnStatsPanel
            node={nodes.find(n => n.id === selectedNodeId)}
            schema={selectedSchema}
            data={selectedData}
            rowCount={selectedResult?.rowCount || 0}
            getColumnStats={selectedResult?.getColumnStats}
            onCollapse={collapseStatsPanel}
            isDetached={false}
            isMobile
          />
          </SheetContent>
        </Sheet>
      )}

      {/* 4. PROPERTIES PANEL */}
      {viewMode === 'canvas' && !isMobileMode && !isPropertiesCollapsed && !isSqlAssetMode && (
        <PropertiesPanel
          node={nodes.find(n => n.id === selectedNodeId)}
          updateNode={updateNodeFromPanel}
          schema={selectedSchema}
          data={selectedData}
          assetType={resolvedActiveAssetType}
          dataModel={dataModel}
          availableTables={availableTables}
          sourceStatus={sourceStatus}
          onIngest={ingestPendingFiles}
          onClearData={clearIngestedData}
          onShowDataModel={() => setShowDataModel(true)}
          isFlattenedDataset={isFlattenedDataset}
          onCollapse={collapsePropertiesPanel}
          activeFilterIndex={activeFilterTarget?.nodeId === selectedNodeId ? activeFilterTarget.index : null}
          nodeResult={selectedResult}
          isMobile={false}
        />
      )}

      {viewMode === 'canvas' && isMobileMode && !isSqlAssetMode && (
        <Sheet open={!isPropertiesCollapsed} onOpenChange={(open) => { if (!open) collapsePropertiesPanel(); }}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-full">
          <PropertiesPanel
            node={nodes.find(n => n.id === selectedNodeId)}
            updateNode={updateNodeFromPanel}
            schema={selectedSchema}
            data={selectedData}
            assetType={resolvedActiveAssetType}
            dataModel={dataModel}
            availableTables={availableTables}
            sourceStatus={sourceStatus}
            onIngest={ingestPendingFiles}
            onClearData={clearIngestedData}
            onShowDataModel={() => setShowDataModel(true)}
            isFlattenedDataset={isFlattenedDataset}
            onCollapse={collapsePropertiesPanel}
            activeFilterIndex={activeFilterTarget?.nodeId === selectedNodeId ? activeFilterTarget.index : null}
            nodeResult={selectedResult}
            isMobile
          />
          </SheetContent>
        </Sheet>
      )}

      {viewMode === 'canvas' && !isMobileMode && !isSqlAssetMode && isStatsDetached && !isStatsCollapsed && (
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

      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} isMobile={isMobileMode} />

      <Dialog open={isDeleteModalOpen} onOpenChange={(open) => { if (!open) closeDeleteModal(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteModalState?.type === 'dataset'
                ? 'Delete dataset'
                : (deleteModalState?.assetType === ASSET_TYPES.RAW_DATASET
                  ? 'Delete raw dataset'
                  : (deleteModalState?.assetType === ASSET_TYPES.SQL ? 'Delete SQL transformation' : 'Delete exploration'))}
            </DialogTitle>
          </DialogHeader>
        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
          <div>
            This will delete{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {deleteModalTarget}
            </span>
            .
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Only this {deleteModalTypeLabel} will be deleted. Dependent items will not be removed.
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Dependencies ({deleteModalDependencies.length})
            </div>
            {deleteModalDependencies.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {deleteModalDependencies.map((item, index) => (
                  <li key={`dep-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-slate-400">No dependencies.</div>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Affected entities ({deleteModalDependents.length})
            </div>
            {deleteModalDependents.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {deleteModalDependents.map((item, index) => (
                  <li key={`dependent-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-slate-400">No affected entities.</div>
            )}
          </div>
        </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteModal}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteModal}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isFlattenModalOpen} onOpenChange={(open) => { if (!open) closeFlattenModal(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flatten dataset</DialogTitle>
          </DialogHeader>
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <div>
            This will keep only the lineage for{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {flattenModalEntry?.datasetName || flattenModalEntry?.nodeTitle || 'this dataset'}
            </span>{' '}
            and replace the exploration with a standalone dataset.
          </div>
          <div>
            The exploration will be renamed and any other branches will be removed.
          </div>
          {Array.isArray(flattenModalEntry?.dependencies) && flattenModalEntry.dependencies.length > 0 ? (
            <div className="text-xs text-slate-400">
              External dependencies: {flattenModalEntry.dependencies.length}
            </div>
          ) : (
            <div className="text-xs text-slate-400">No external dependencies.</div>
          )}
          <div className="text-xs text-slate-400">
            Rows: {flattenModalEntry?.rowCount ?? 0}
          </div>
        </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeFlattenModal}>Cancel</Button>
            <Button onClick={confirmFlattenModal}>Flatten dataset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. DATA MODEL MODAL */}
      <Dialog open={showDataModel} onOpenChange={(open) => { if (!open) setShowDataModel(false); }}>
        <DialogContent className={isMobileMode ? 'w-full max-w-full h-full max-h-full top-0 mt-0 rounded-none' : 'max-w-[980px]'} style={isMobileMode ? { padding: 0 } : undefined}>
          <DialogHeader>
            <DialogTitle asChild>
            <div className="flex items-center gap-2">
              <div className="bg-blue-100 p-2 rounded text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
                <Database size={20} />
              </div>
              <div>
                <div className="font-bold text-base text-gray-900 dark:text-slate-100">Data Model Preview</div>
                <div className="text-xs text-gray-500 dark:text-slate-400">Available tables and schemas</div>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className={`flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 ${isMobileMode ? 'p-4' : 'p-8'}`}>
          {dataModel.order.length === 0 ? (
            <Empty description="Upload a CSV/XLSX file to populate the data model." />
          ) : (
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${isMobileMode ? 'gap-4' : 'gap-6'}`}>
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
                  <Card key={tableName} className="shadow-sm">
                    <CardHeader className="p-3 flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-semibold">
                        <div className="flex items-center gap-2">
                          <TableIcon size={16} className="text-gray-400 dark:text-slate-500" />
                          {tableName.toUpperCase()}
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
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
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AnalysisApp;
