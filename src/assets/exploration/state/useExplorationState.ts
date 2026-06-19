// Exploration state hook. Distilled from src/app/AnalysisApp.tsx.
// Owns: node graph, undo/redo history, selection, branch selection/collapse,
// entangled group color, filter helpers, node CRUD, free-layout positions.
// Does NOT own: data model, data engine, persistence. Those live in
// data/useKnowledgeModelTables.ts and the host-provided callbacks.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getChildren } from '../lib/nodeUtils';
import { normalizeFilters } from '../lib/filterUtils';
import {
  DEFAULT_ENTANGLED_COLOR,
  createInitialNodes,
  getDefaultParams,
  getDefaultNodeTitle,
  buildDefaultFreeLayout,
} from '../lib/constants';

export interface ExplorationNode {
  id: string;
  parentId: string | null;
  type: 'SOURCE' | 'FILTER' | 'AGGREGATE' | 'SORT' | 'LIMIT' | 'JOIN' | 'COMPONENT';
  title: string;
  titleIsCustom?: boolean;
  branchName?: string;
  description?: string;
  isExpanded?: boolean;
  isBranchCollapsed?: boolean;
  position?: { x: number; y: number };
  entangledPeerId?: string;
  entangledRootId?: string;
  entangledColor?: string;
  params: Record<string, any>;
}

export interface UseExplorationStateOptions {
  initialNodes?: ExplorationNode[];
  initialSelectedNodeId?: string;
  initialRenderMode?: string;
  initialBranchSelection?: Record<string, string>;
  initialEntangledColors?: Record<string, string>;
}

export interface ExplorationStateSnapshot {
  nodes: ExplorationNode[];
  selectedNodeId: string;
  renderMode: string;
  branchSelectionByNodeId: Record<string, string>;
  entangledColors: Record<string, string>;
}

const createId = (prefix: string, counter: { current: number }) =>
  `${prefix}-${Date.now()}-${counter.current++}`;

export function useExplorationState(options: UseExplorationStateOptions = {}) {
  const {
    initialNodes,
    initialSelectedNodeId,
    initialRenderMode = 'classic',
    initialBranchSelection = {},
    initialEntangledColors = {},
  } = options;

  const seedNodes = (initialNodes && initialNodes.length > 0 ? initialNodes : createInitialNodes()) as ExplorationNode[];

  // --- History (undo / redo) ---------------------------------------------
  const [history, setHistory] = useState<ExplorationNode[][]>([seedNodes]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const safeHistoryIndex = Math.max(0, Math.min(historyIndex, history.length - 1));
  const nodes = history[safeHistoryIndex] || [];

  const [selectedNodeId, setSelectedNodeId] = useState<string>(
    initialSelectedNodeId || seedNodes[0]?.id || 'node-start'
  );
  const [renderMode, setRenderMode] = useState<string>(initialRenderMode);
  const [branchSelectionByNodeId, setBranchSelectionByNodeId] =
    useState<Record<string, string>>(initialBranchSelection);
  const [entangledColors, setEntangledColors] =
    useState<Record<string, string>>(initialEntangledColors);

  // --- Menu + filter UI state --------------------------------------------
  const [showAddMenuForId, setShowAddMenuForId] = useState<string | null>(null);
  const [showInsertMenuForId, setShowInsertMenuForId] = useState<string | null>(null);
  const [activeFilterTarget, setActiveFilterTarget] = useState<{ nodeId: string; index: number } | null>(null);
  const [lineageFocusNodeId, setLineageFocusNodeId] = useState<string | null>(null);

  const nodeIdCounterRef = useRef(0);
  const filterIdCounterRef = useRef(0);
  const createNodeId = useCallback(() => createId('node', nodeIdCounterRef), []);
  const createFilterId = useCallback(() => createId('filter', filterIdCounterRef), []);

  // --- History helpers ----------------------------------------------------
  const commitNodes = useCallback(
    (next: ExplorationNode[]) => {
      setHistory((prev) => {
        const slice = prev.slice(0, safeHistoryIndex + 1);
        slice.push(next);
        return slice;
      });
      setHistoryIndex(safeHistoryIndex + 1);
    },
    [safeHistoryIndex]
  );

  const replaceCurrentNodes = useCallback(
    (next: ExplorationNode[]) => {
      setHistory((prev) => {
        if (prev.length === 0) return [next];
        const clone = [...prev];
        clone[safeHistoryIndex] = next;
        return clone;
      });
    },
    [safeHistoryIndex]
  );

  const undo = useCallback(() => {
    setHistoryIndex((i) => Math.max(0, i - 1));
  }, []);
  const redo = useCallback(() => {
    setHistoryIndex((i) => Math.min(history.length - 1, i + 1));
  }, [history.length]);
  const canUndo = safeHistoryIndex > 0;
  const canRedo = safeHistoryIndex < history.length - 1;

  // --- Graph helpers ------------------------------------------------------
  const findNodeById = useCallback(
    (id: string, list: ExplorationNode[] = nodes) => list.find((n) => n.id === id),
    [nodes]
  );

  const collectSubtreeIds = useCallback(
    (rootId: string, list: ExplorationNode[] = nodes) => {
      const ids = new Set<string>();
      const stack = [rootId];
      while (stack.length > 0) {
        const currentId = stack.pop()!;
        if (ids.has(currentId)) continue;
        const current = findNodeById(currentId, list);
        if (!current) continue;
        ids.add(currentId);
        getChildren(list, currentId).forEach((child: any) => stack.push(child.id));
      }
      return ids;
    },
    [nodes, findNodeById]
  );

  const resolveEntangledColor = useCallback(
    (rootId: string | undefined) => {
      if (!rootId) return DEFAULT_ENTANGLED_COLOR;
      if (entangledColors[rootId]) return entangledColors[rootId];
      const match = nodes.find((n) => n.entangledRootId === rootId && n.entangledColor);
      return match?.entangledColor || DEFAULT_ENTANGLED_COLOR;
    },
    [nodes, entangledColors]
  );

  const cloneSubtree = useCallback(
    (rootId: string, newParentId: string | null) => {
      const mapping = new Map<string, string>();
      const reverseMapping = new Map<string, string>();
      const newNodes: ExplorationNode[] = [];
      const queue = [rootId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const current = findNodeById(currentId);
        if (!current) continue;
        const newId = createNodeId();
        mapping.set(currentId, newId);
        reverseMapping.set(newId, currentId);
        const parentId = currentId === rootId ? newParentId : mapping.get(current.parentId!) || null;
        const cloned: ExplorationNode = {
          ...current,
          id: newId,
          parentId,
        };
        delete cloned.entangledPeerId;
        delete cloned.entangledRootId;
        newNodes.push(cloned);
        getChildren(nodes, currentId).forEach((child: any) => queue.push(child.id));
      }

      return { newNodes, mapping, reverseMapping };
    },
    [nodes, findNodeById, createNodeId]
  );

  // --- Node CRUD ----------------------------------------------------------
  const updateNode = useCallback(
    (id: string, updates: any, isMeta = false, silent = false) => {
      const next = nodes.map((n) => {
        if (n.id !== id) return n;
        if (isMeta) return { ...n, ...updates };
        return { ...n, params: updates };
      });
      if (silent) replaceCurrentNodes(next);
      else commitNodes(next);
    },
    [nodes, commitNodes, replaceCurrentNodes]
  );

  const addNode = useCallback(
    (type: string, parentId: string, subtype: string = 'TABLE') => {
      const parent = findNodeById(parentId);
      if (!parent) return;
      const siblings = getChildren(nodes, parentId) as any[];
      const branchName = siblings.length > 0 ? `Fork ${siblings.length + 1}` : undefined;
      const fallbackTitle = getDefaultNodeTitle(type, subtype);
      const newId = createNodeId();
      const entangledRootId = parent.entangledRootId;
      const entangledColor = entangledRootId ? resolveEntangledColor(entangledRootId) : undefined;

      let next: ExplorationNode[] = [...nodes];
      if (siblings.length === 1) {
        const existing = siblings[0];
        if (!existing.branchName) {
          const firstLabel = 'Fork 1';
          next = next.map((n) =>
            n.id === existing.id ? { ...n, branchName: firstLabel } : n
          );
          if (existing.entangledPeerId) {
            next = next.map((n) =>
              n.id === existing.entangledPeerId ? { ...n, branchName: firstLabel } : n
            );
          }
        }
      }

      const newNode: ExplorationNode = {
        id: newId,
        parentId,
        type: type as any,
        title: fallbackTitle,
        branchName,
        titleIsCustom: false,
        isExpanded: true,
        params: getDefaultParams(subtype),
      };
      next.push(newNode);

      if (parent.entangledPeerId) {
        const peerId = createNodeId();
        newNode.entangledPeerId = peerId;
        newNode.entangledRootId = entangledRootId;
        newNode.entangledColor = entangledColor;
        next.push({
          ...newNode,
          id: peerId,
          parentId: parent.entangledPeerId,
          entangledPeerId: newId,
          entangledRootId,
          entangledColor,
        });
      }

      commitNodes(next);
      setSelectedNodeId(newId);
      setShowAddMenuForId(null);
    },
    [nodes, findNodeById, createNodeId, resolveEntangledColor, commitNodes]
  );

  const insertNode = useCallback(
    (
      type: string,
      parentId: string,
      subtype: string = 'TABLE',
      childId: string | null = null,
      insertPosition: { x: number; y: number } | null = null
    ) => {
      const parent = findNodeById(parentId);
      if (!parent) return;
      const fallbackTitle = getDefaultNodeTitle(type, subtype);
      const newId = createNodeId();
      const entangledRootId = parent.entangledRootId;
      const entangledColor = entangledRootId ? resolveEntangledColor(entangledRootId) : undefined;
      const targetChild = childId ? findNodeById(childId) : null;
      const shouldTargetChild = !!targetChild && targetChild.parentId === parentId;
      const pos =
        insertPosition && Number.isFinite(insertPosition.x) && Number.isFinite(insertPosition.y)
          ? { x: insertPosition.x, y: insertPosition.y }
          : null;

      const newNode: ExplorationNode = {
        id: newId,
        parentId,
        type: type as any,
        title: fallbackTitle,
        titleIsCustom: false,
        isExpanded: true,
        params: getDefaultParams(subtype),
        ...(pos ? { position: pos } : {}),
      };

      let next = nodes.map((n) => {
        if (shouldTargetChild) {
          return n.id === targetChild!.id ? { ...n, parentId: newId } : n;
        }
        return n.parentId === parentId ? { ...n, parentId: newId } : n;
      });

      if (parent.entangledPeerId) {
        const peerParentId = parent.entangledPeerId;
        const peerId = createNodeId();
        const peerTargetChildId = shouldTargetChild ? targetChild!.entangledPeerId : null;
        const peerTargetChild = peerTargetChildId ? findNodeById(peerTargetChildId) : null;
        const shouldTargetPeerChild =
          !!peerTargetChild && peerTargetChild.parentId === peerParentId;
        newNode.entangledPeerId = peerId;
        newNode.entangledRootId = entangledRootId;
        newNode.entangledColor = entangledColor;
        next = next.map((n) => {
          if (shouldTargetPeerChild) {
            return n.id === peerTargetChildId ? { ...n, parentId: peerId } : n;
          }
          return n.parentId === peerParentId ? { ...n, parentId: peerId } : n;
        });
        next.push({
          ...newNode,
          id: peerId,
          parentId: peerParentId,
          entangledPeerId: newId,
          entangledRootId,
          entangledColor,
        });
      }

      next.push(newNode);
      commitNodes(next);
      setSelectedNodeId(newId);
      setShowInsertMenuForId(null);
    },
    [nodes, findNodeById, createNodeId, resolveEntangledColor, commitNodes]
  );

  const removeNode = useCallback(
    (id: string) => {
      const target = findNodeById(id);
      if (!target) return;
      const toDelete = collectSubtreeIds(id);
      if (target.entangledPeerId) {
        collectSubtreeIds(target.entangledPeerId).forEach((peerId) => toDelete.add(peerId));
      }
      const filtered = nodes.filter((n) => !toDelete.has(n.id));
      commitNodes(filtered);
      if (toDelete.has(selectedNodeId)) setSelectedNodeId('node-start');
    },
    [nodes, findNodeById, collectSubtreeIds, commitNodes, selectedNodeId]
  );

  const toggleNodeExpansion = useCallback(
    (id: string) => {
      const next = nodes.map((n) => (n.id === id ? { ...n, isExpanded: !n.isExpanded } : n));
      replaceCurrentNodes(next);
    },
    [nodes, replaceCurrentNodes]
  );

  const toggleBranchCollapse = useCallback(
    (id: string) => {
      const next = nodes.map((n) =>
        n.id === id ? { ...n, isBranchCollapsed: !n.isBranchCollapsed } : n
      );
      replaceCurrentNodes(next);
    },
    [nodes, replaceCurrentNodes]
  );

  // --- Free layout positions ---------------------------------------------
  const applyNodePositions = useCallback(
    (positions: Record<string, { x: number; y: number }>, opts?: { useHistory?: boolean }) => {
      if (!positions) return;
      let changed = false;
      const next = nodes.map((n) => {
        const p = positions[n.id];
        if (!p) return n;
        if (n.position?.x === p.x && n.position?.y === p.y) return n;
        changed = true;
        return { ...n, position: { x: p.x, y: p.y } };
      });
      if (!changed) return;
      if (opts?.useHistory) commitNodes(next);
      else replaceCurrentNodes(next);
    },
    [nodes, commitNodes, replaceCurrentNodes]
  );

  const updateNodePosition = useCallback(
    (id: string, position: { x: number; y: number }) => {
      applyNodePositions({ [id]: position });
    },
    [applyNodePositions]
  );

  const applyAutoLayout = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      applyNodePositions(positions, { useHistory: true });
    },
    [applyNodePositions]
  );

  // Seed free-layout positions when entering freeLayout mode.
  useEffect(() => {
    if (renderMode !== 'freeLayout') return;
    const needsLayout = nodes.some(
      (n) => !n.position || !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y)
    );
    if (!needsLayout) return;
    const defaults = buildDefaultFreeLayout(nodes);
    const next = nodes.map((n) => {
      if (n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y)) return n;
      const fallback = defaults[n.id] || { x: 80, y: 80 };
      return { ...n, position: { x: fallback.x, y: fallback.y } };
    });
    replaceCurrentNodes(next);
  }, [renderMode, nodes, replaceCurrentNodes]);

  // --- Entangled branches -------------------------------------------------
  const toggleEntangledBranch = useCallback(
    (id: string) => {
      const target = findNodeById(id);
      if (!target || !target.parentId) return;
      if (target.entangledPeerId) {
        const peer = findNodeById(target.entangledPeerId);
        if (!peer || peer.parentId !== target.parentId) return;
        const peerIds = collectSubtreeIds(peer.id);
        const selfIds = collectSubtreeIds(target.id);
        const next = nodes
          .filter((n) => !peerIds.has(n.id))
          .map((n) =>
            selfIds.has(n.id)
              ? {
                  ...n,
                  entangledPeerId: undefined,
                  entangledRootId: undefined,
                  entangledColor: undefined,
                }
              : n
          );
        commitNodes(next);
        return;
      }
      const groupId = `entangled-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const color = DEFAULT_ENTANGLED_COLOR;
      const { newNodes, mapping, reverseMapping } = cloneSubtree(target.id, target.parentId);
      const updatedExisting = nodes.map((n) => {
        if (!mapping.has(n.id)) return n;
        return {
          ...n,
          entangledPeerId: mapping.get(n.id),
          entangledRootId: groupId,
          entangledColor: color,
        };
      });
      const mirrored = newNodes.map((n) => {
        const originalId = reverseMapping.get(n.id);
        return {
          ...n,
          entangledPeerId: originalId,
          entangledRootId: groupId,
          entangledColor: color,
        };
      });
      commitNodes([...updatedExisting, ...mirrored]);
    },
    [nodes, findNodeById, collectSubtreeIds, cloneSubtree, commitNodes]
  );

  const updateEntangledGroupColor = useCallback(
    (rootId: string, color: string) => {
      if (!rootId || !color) return;
      setEntangledColors((prev) => ({ ...prev, [rootId]: color }));
      const next = nodes.map((n) =>
        n.entangledRootId === rootId ? { ...n, entangledColor: color } : n
      );
      const changed = next.some((n, i) => n !== nodes[i]);
      if (changed) commitNodes(next);
    },
    [nodes, commitNodes]
  );

  // --- Branch selection + rename -----------------------------------------
  const setBranchSelection = useCallback((parentId: string, childId: string) => {
    if (!parentId || !childId) return;
    setBranchSelectionByNodeId((prev) =>
      prev[parentId] === childId ? prev : { ...prev, [parentId]: childId }
    );
  }, []);

  const renameBranch = useCallback(
    (branchId: string, nextName: string) => {
      if (!branchId) return;
      const target = findNodeById(branchId);
      if (!target) return;
      const trimmed = typeof nextName === 'string' ? nextName.trim() : '';
      const peer = target.entangledPeerId ? findNodeById(target.entangledPeerId) : null;
      if (trimmed === (target.branchName || '') && trimmed === (peer?.branchName || '')) return;
      const idsToUpdate = new Set([branchId]);
      if (target.entangledPeerId) idsToUpdate.add(target.entangledPeerId);
      const next = nodes.map((n) =>
        idsToUpdate.has(n.id) ? { ...n, branchName: trimmed } : n
      );
      commitNodes(next);
    },
    [nodes, findNodeById, commitNodes]
  );

  const toggleDatasetForNode = useCallback(
    (id: string) => {
      const target = findNodeById(id);
      if (!target) return;
      const nextIsDataset = !target.params?.isDataset;
      const idsToUpdate = new Set([id]);
      if (target.entangledPeerId) idsToUpdate.add(target.entangledPeerId);
      const next = nodes.map((n) => {
        if (!idsToUpdate.has(n.id)) return n;
        return {
          ...n,
          params: {
            ...n.params,
            isDataset: nextIsDataset,
            isFlattened: nextIsDataset ? n.params?.isFlattened === true : false,
            datasetSnapshot: nextIsDataset ? n.params?.datasetSnapshot || null : null,
          },
        };
      });
      commitNodes(next);
    },
    [nodes, findNodeById, commitNodes]
  );

  // --- Filters ------------------------------------------------------------
  const addFilterToNode = useCallback(
    (nodeId: string, filter: any, opts: { focus?: boolean } = {}) => {
      const target = findNodeById(nodeId);
      if (!target) return;
      const existing = normalizeFilters(target.params) as any[];
      const nextFilters = [
        ...existing,
        {
          id: createFilterId(),
          field: '',
          operator: 'equals',
          value: '',
          mode: 'operator',
          ...filter,
        },
      ];
      updateNode(nodeId, { ...target.params, filters: nextFilters });
      const nextIndex = nextFilters.length - 1;
      if (opts.focus) {
        setSelectedNodeId(nodeId);
        setActiveFilterTarget({ nodeId, index: nextIndex });
      }
      return nextIndex;
    },
    [findNodeById, createFilterId, updateNode]
  );

  const buildInValue = (values: any[]) => values.map((v) => String(v)).join(', ');

  const addFilterNode = useCallback(
    ({ parentId, field, operator = 'equals', value, mode = 'operator' }: any) => {
      if (!parentId || !field) return;
      const parent = findNodeById(parentId);
      if (!parent) return;
      const newId = createNodeId();
      const entangledRootId = parent.entangledRootId;
      const entangledColor = entangledRootId ? resolveEntangledColor(entangledRootId) : undefined;
      const fallbackTitle = getDefaultNodeTitle('FILTER');
      const filterPayload = { id: createFilterId(), field, operator, value, mode };
      const newNode: ExplorationNode = {
        id: newId,
        parentId,
        type: 'FILTER',
        title: fallbackTitle,
        titleIsCustom: false,
        isExpanded: true,
        params: { filters: [filterPayload] },
      };
      const next = [...nodes, newNode];
      if (parent.entangledPeerId) {
        const peerId = createNodeId();
        newNode.entangledPeerId = peerId;
        newNode.entangledRootId = entangledRootId;
        newNode.entangledColor = entangledColor;
        next.push({
          ...newNode,
          id: peerId,
          parentId: parent.entangledPeerId,
          entangledPeerId: newId,
          entangledRootId,
          entangledColor,
        });
      }
      commitNodes(next);
      setSelectedNodeId(newId);
    },
    [nodes, findNodeById, createNodeId, createFilterId, resolveEntangledColor, commitNodes]
  );

  const updateFilterOnNode = useCallback(
    (nodeId: string, filterIndex: number, updates: any) => {
      if (filterIndex == null || filterIndex < 0) return;
      const target = findNodeById(nodeId);
      if (!target) return;
      const existing = normalizeFilters(target.params) as any[];
      if (!existing[filterIndex]) return;
      const nextFilters = existing.map((f: any, i: number) =>
        i === filterIndex ? { ...f, ...updates } : f
      );
      updateNode(nodeId, { ...target.params, filters: nextFilters });
    },
    [findNodeById, updateNode]
  );

  const removeFilterFromNode = useCallback(
    (nodeId: string, filterIndex: number) => {
      if (filterIndex == null || filterIndex < 0) return;
      const target = findNodeById(nodeId);
      if (!target) return;
      const existing = normalizeFilters(target.params) as any[];
      if (!existing[filterIndex]) return;
      const nextFilters = existing.filter((_: any, i: number) => i !== filterIndex);
      updateNode(nodeId, { ...target.params, filters: nextFilters });
      setActiveFilterTarget((prev) => {
        if (!prev || prev.nodeId !== nodeId) return prev;
        if (prev.index === filterIndex) return null;
        if (prev.index > filterIndex) return { ...prev, index: prev.index - 1 };
        return prev;
      });
    },
    [findNodeById, updateNode]
  );

  const handleFilterCellAction = useCallback(
    (action: string, payload: any) => {
      if (!payload) return;
      const { nodeId, field, value } = payload;
      if (!nodeId || !field) return;
      if (action === 'add-to-node') {
        addFilterToNode(
          nodeId,
          { field, operator: 'equals', value, mode: 'attribute' },
          { focus: false }
        );
        return;
      }
      if (action === 'create-node') {
        addFilterNode({ parentId: nodeId, field, operator: 'equals', value, mode: 'attribute' });
      }
    },
    [addFilterToNode, addFilterNode]
  );

  const handleTableCellClick = useCallback(
    (value: any, field: string, parentId: string) => {
      addFilterNode({ parentId, field, operator: 'equals', value, mode: 'attribute' });
    },
    [addFilterNode]
  );

  const handleChartDrillDown = useCallback(
    (data: any, chartMeta: any, parentId: string) => {
      if (!data || !parentId) return;
      const xAxisField = chartMeta?.xAxis;
      if (!xAxisField) return;
      const payload = data.activePayload?.[0]?.payload;
      const clickedValue = payload?.__x;
      const selectionValues =
        data.selection?.values || (clickedValue !== undefined ? [clickedValue] : []);
      if (!selectionValues.length) return;
      const operator = selectionValues.length > 1 ? 'in' : 'equals';
      const value = operator === 'in' ? buildInValue(selectionValues) : selectionValues[0];
      addFilterNode({ parentId, field: xAxisField, operator, value, mode: 'attribute' });
    },
    [addFilterNode]
  );

  const handleTableSortChange = useCallback(
    (nodeId: string, sortBy: string, sortDirection: string) => {
      const target = findNodeById(nodeId);
      if (!target) return;
      const nextBy = sortBy || '';
      const nextDir = nextBy ? sortDirection || 'asc' : '';
      updateNode(nodeId, { ...target.params, tableSortBy: nextBy, tableSortDirection: nextDir });
    },
    [findNodeById, updateNode]
  );

  // --- Lineage focus (filters rendered nodes to a single lineage) --------
  const lineageVisibleNodeIds = useMemo(() => {
    if (!lineageFocusNodeId) return null;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    if (!byId.has(lineageFocusNodeId)) return null;
    const ids = new Set<string>();
    let currentId: string | null = lineageFocusNodeId;
    while (currentId && byId.has(currentId)) {
      ids.add(currentId);
      currentId = byId.get(currentId)?.parentId || null;
    }
    return ids;
  }, [nodes, lineageFocusNodeId]);

  const renderNodes = useMemo(
    () => (lineageVisibleNodeIds ? nodes.filter((n) => lineageVisibleNodeIds.has(n.id)) : nodes),
    [nodes, lineageVisibleNodeIds]
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedNodeId(id);
  }, []);

  return {
    // state
    nodes,
    renderNodes,
    selectedNodeId,
    renderMode,
    branchSelectionByNodeId,
    entangledColors,
    lineageFocusNodeId,
    activeFilterTarget,
    showAddMenuForId,
    showInsertMenuForId,
    canUndo,
    canRedo,

    // setters
    setRenderMode,
    setSelectedNodeId: handleSelect,
    setLineageFocusNodeId,
    setShowAddMenuForId,
    setShowInsertMenuForId,
    setActiveFilterTarget,

    // history
    undo,
    redo,

    // node operations
    addNode,
    insertNode,
    removeNode,
    toggleNodeExpansion,
    toggleBranchCollapse,
    toggleDatasetForNode,
    updateNode,
    updateNodePosition,
    applyAutoLayout,

    // branches / entangled
    setBranchSelection,
    renameBranch,
    toggleEntangledBranch,
    updateEntangledGroupColor,

    // filters
    addFilterToNode,
    updateFilterOnNode,
    removeFilterFromNode,
    handleFilterCellAction,

    // table/chart actions
    handleTableCellClick,
    handleChartDrillDown,
    handleTableSortChange,

    // snapshot
    getSnapshot: (): ExplorationStateSnapshot => ({
      nodes,
      selectedNodeId,
      renderMode,
      branchSelectionByNodeId,
      entangledColors,
    }),

    // imperative rehydrate
    hydrate: (snapshot: Partial<ExplorationStateSnapshot>) => {
      if (snapshot.nodes) {
        setHistory([snapshot.nodes as ExplorationNode[]]);
        setHistoryIndex(0);
      }
      if (snapshot.selectedNodeId) setSelectedNodeId(snapshot.selectedNodeId);
      if (snapshot.renderMode) setRenderMode(snapshot.renderMode);
      if (snapshot.branchSelectionByNodeId)
        setBranchSelectionByNodeId(snapshot.branchSelectionByNodeId);
      if (snapshot.entangledColors) setEntangledColors(snapshot.entangledColors);
    },
  };
}

export type UseExplorationState = ReturnType<typeof useExplorationState>;
