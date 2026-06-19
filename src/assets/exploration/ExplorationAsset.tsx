// Top-level entry point for the Exploration asset.
//
// Composes the canvas, side panels, and dispatches state changes as YAML
// back to the host. Distilled from src/app/AnalysisApp.tsx down to just
// the exploration concerns.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import ExplorationAssetView from './ExplorationAssetView';
import { ColumnStatsPanel } from './components/ColumnStatsPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import HelpModal from './components/HelpModal';
import { GraphMinimapPanel } from './components/GraphMinimapPanel';
import { Button } from './components/ui/button';
import {
  isMobileUserAgent,
  getDefaultStatsPanelRect,
  isValidStatsPanelRect,
  slugifySqlName,
  DEFAULT_TABLE_DENSITY,
} from './lib/constants';
// @ts-ignore - ported JS module
import { buildLeafCountMap, getNodeResult } from './lib/nodeUtils';
import {
  useExplorationState,
  type ExplorationStateSnapshot,
  type ExplorationNode,
} from './state/useExplorationState';
import {
  toYaml,
  fromYaml,
  summarize,
  type StateSummary,
} from './state/explorationYaml';
import { useKnowledgeModelTables } from './data/useKnowledgeModelTables';
import type { DataProvider } from './data/DataProvider';
import {
  Undo,
  Redo,
  QuestionCircle,
  Layout,
  LayoutClassic,
  LayoutClassicSmart,
  LayoutEntangled,
  LayoutEntangledSmart,
  LayoutSingleStream,
  LayoutMobile,
  LayoutFree,
} from './icons';

// -------------------------------------------------------------------------
// Props
// -------------------------------------------------------------------------

export interface ExplorationCapabilities {
  freeLayout?: boolean;
  entangledModes?: boolean;
  mobileMode?: boolean;
  minimap?: boolean;
  propertiesPanel?: boolean;
  columnStatsPanel?: boolean;
  help?: boolean;
  aiAssistant?: boolean;
}

export interface ExplorationAssetProps {
  assetId: string;
  readOnly?: boolean;
  dataProvider: DataProvider;
  initialStateYaml?: string;
  onStateChange?: (
    yaml: string,
    meta: { dirty: boolean; summary: StateSummary }
  ) => void;
  capabilities?: ExplorationCapabilities;
  theme?: 'light' | 'dark' | 'auto';
  density?: 'comfortable' | 'dense';
  onError?: (err: Error, ctx: { phase: string; nodeId?: string }) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onRequestSave?: () => void;
  onAssistantRequest?: (nodeId: string, question: string) => Promise<void> | void;
  className?: string;
}

const DEFAULT_CAPABILITIES: Required<ExplorationCapabilities> = {
  freeLayout: true,
  entangledModes: true,
  mobileMode: true,
  minimap: true,
  propertiesPanel: true,
  columnStatsPanel: true,
  help: true,
  aiAssistant: false,
};

// -------------------------------------------------------------------------
// Theme resolver
// -------------------------------------------------------------------------

function useResolvedTheme(pref: 'light' | 'dark' | 'auto' = 'auto'): 'light' | 'dark' {
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => {
    if (pref === 'light' || pref === 'dark') return pref;
    if (typeof window === 'undefined' || !window.matchMedia) return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    if (pref === 'light' || pref === 'dark') {
      setResolved(pref);
      return;
    }
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setResolved(media.matches ? 'dark' : 'light');
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, [pref]);
  return resolved;
}

// -------------------------------------------------------------------------
// Render mode switcher button set
// -------------------------------------------------------------------------

const RENDER_MODE_ITEMS: Array<{ key: string; label: string; Icon: any; capability?: keyof ExplorationCapabilities }> = [
  { key: 'classic', label: 'Classic', Icon: LayoutClassic },
  { key: 'classicSmart', label: 'Classic Smart', Icon: LayoutClassicSmart },
  { key: 'entangled', label: 'Entangled', Icon: LayoutEntangled, capability: 'entangledModes' },
  { key: 'entangledSmart', label: 'Entangled Smart', Icon: LayoutEntangledSmart, capability: 'entangledModes' },
  { key: 'singleStream', label: 'Single stream', Icon: LayoutSingleStream },
  { key: 'freeLayout', label: 'Free layout', Icon: LayoutFree, capability: 'freeLayout' },
  { key: 'mobile', label: 'Mobile', Icon: LayoutMobile, capability: 'mobileMode' },
];

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

const ExplorationAsset: React.FC<ExplorationAssetProps> = ({
  assetId,
  readOnly = false,
  dataProvider,
  initialStateYaml,
  onStateChange,
  capabilities: capabilitiesProp,
  theme = 'auto',
  density = DEFAULT_TABLE_DENSITY,
  onError,
  onDirtyChange,
  onRequestSave,
  onAssistantRequest,
  className,
}) => {
  const capabilities = { ...DEFAULT_CAPABILITIES, ...(capabilitiesProp || {}) };
  const resolvedTheme = useResolvedTheme(theme);

  // ---------------------------------------------------------------------
  // Hydrate initial state from YAML (if any)
  // ---------------------------------------------------------------------
  const initial = useMemo(() => {
    if (!initialStateYaml) return null;
    return fromYaml(initialStateYaml);
  }, [initialStateYaml]);

  const shouldAutoMobile = useMemo(
    () => capabilities.mobileMode && isMobileUserAgent(),
    [capabilities.mobileMode]
  );

  const state = useExplorationState({
    initialNodes: initial?.nodes,
    initialSelectedNodeId: initial?.selection?.nodeId || undefined,
    initialRenderMode: shouldAutoMobile ? 'mobile' : initial?.renderMode || 'classic',
    initialBranchSelection: initial?.branches?.selection,
    initialEntangledColors: initial?.branches?.entangledColors,
  });

  // ---------------------------------------------------------------------
  // Data engine wired to DataProvider
  // ---------------------------------------------------------------------
  const { dataModel, tableMetadata, chainData, error: dataError } = useKnowledgeModelTables({
    provider: dataProvider,
    nodes: state.nodes,
  });

  useEffect(() => {
    if (dataError && onError) {
      onError(dataError, { phase: 'data-provider' });
    }
  }, [dataError, onError]);

  // ---------------------------------------------------------------------
  // UI-only state (panels, help, stats panel rect)
  // ---------------------------------------------------------------------
  const [isMobileMode, setIsMobileModeState] = useState<boolean>(!!shouldAutoMobile);
  useEffect(() => {
    setIsMobileModeState(state.renderMode === 'mobile');
  }, [state.renderMode]);

  const [isStatsCollapsed, setIsStatsCollapsed] = useState(false);
  const [isStatsDetached, setIsStatsDetached] = useState(false);
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [statsPanelRect, setStatsPanelRect] = useState(() => getDefaultStatsPanelRect());

  const collapseStatsPanel = useCallback(() => {
    setIsStatsDetached(false);
    setIsStatsCollapsed(true);
  }, []);
  const expandStatsPanel = useCallback(() => setIsStatsCollapsed(false), []);
  const detachStatsPanel = useCallback(() => {
    setIsStatsDetached(true);
    setIsStatsCollapsed(false);
  }, []);
  const collapsePropertiesPanel = useCallback(() => setIsPropertiesCollapsed(true), []);
  const expandPropertiesPanel = useCallback(() => setIsPropertiesCollapsed(false), []);

  const canvasScrollRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------
  // Dirty tracking + YAML emission
  // ---------------------------------------------------------------------
  const lastEmittedYamlRef = useRef<string | null>(initialStateYaml ?? null);
  const baselineYamlRef = useRef<string | null>(initialStateYaml ?? null);
  const [isDirty, setIsDirty] = useState(false);

  const snapshot: ExplorationStateSnapshot = useMemo(
    () => ({
      nodes: state.nodes as ExplorationNode[],
      selectedNodeId: state.selectedNodeId,
      renderMode: state.renderMode,
      branchSelectionByNodeId: state.branchSelectionByNodeId,
      entangledColors: state.entangledColors,
    }),
    [
      state.nodes,
      state.selectedNodeId,
      state.renderMode,
      state.branchSelectionByNodeId,
      state.entangledColors,
    ]
  );

  useEffect(() => {
    let yaml: string;
    try {
      yaml = toYaml(snapshot);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)), { phase: 'yaml-serialize' });
      return;
    }
    if (yaml === lastEmittedYamlRef.current) return;
    lastEmittedYamlRef.current = yaml;
    const dirty = yaml !== baselineYamlRef.current;
    if (dirty !== isDirty) {
      setIsDirty(dirty);
      onDirtyChange?.(dirty);
    }
    if (onStateChange) {
      const summary = summarize({
        version: 1,
        renderMode: snapshot.renderMode,
        nodes: snapshot.nodes,
        selection: { nodeId: snapshot.selectedNodeId },
        branches: {
          selection: snapshot.branchSelectionByNodeId,
          entangledColors: snapshot.entangledColors,
        },
      });
      onStateChange(yaml, { dirty, summary });
    }
  }, [snapshot, onStateChange, onDirtyChange, onError, isDirty]);

  // Rehydrate if the host swaps initialStateYaml under us (e.g. after save).
  useEffect(() => {
    if (!initialStateYaml) return;
    if (initialStateYaml === lastEmittedYamlRef.current) return;
    const parsed = fromYaml(initialStateYaml);
    if (!parsed) return;
    state.hydrate({
      nodes: parsed.nodes as ExplorationNode[],
      selectedNodeId: parsed.selection?.nodeId || undefined as any,
      renderMode: parsed.renderMode,
      branchSelectionByNodeId: parsed.branches?.selection,
      entangledColors: parsed.branches?.entangledColors,
    });
    baselineYamlRef.current = initialStateYaml;
    lastEmittedYamlRef.current = initialStateYaml;
    setIsDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStateYaml]);

  // ---------------------------------------------------------------------
  // Derived helpers for panels
  // ---------------------------------------------------------------------
  const isSmartMode =
    state.renderMode === 'classicSmart' || state.renderMode === 'entangledSmart';
  const isMinimapMode =
    capabilities.minimap &&
    (state.renderMode === 'classic' ||
      state.renderMode === 'classicSmart' ||
      state.renderMode === 'entangled' ||
      state.renderMode === 'entangledSmart');

  const leafCountById = useMemo(
    () => (isSmartMode ? buildLeafCountMap(state.renderNodes, { treatCollapsedAsLeaf: true }) : null),
    [state.renderNodes, isSmartMode]
  );

  const selectedResult = useMemo(
    () => getNodeResult(chainData, state.selectedNodeId),
    [chainData, state.selectedNodeId]
  );
  const selectedSchema: string[] = selectedResult?.schema || [];
  const selectedData: any[] = selectedResult?.sampleRows || selectedResult?.data || [];

  const availableTables = useMemo(() => {
    const local = (dataModel.order || []).map((name) => ({
      name,
      label: name,
      source: 'local' as const,
      sqlName: slugifySqlName(name),
    }));
    const external = tableMetadata
      .filter((t) => !dataModel.tables[t.name])
      .map((t) => ({
        name: t.name,
        label: t.label || t.name,
        source: 'external' as const,
        kind: t.kind,
        schema: t.schema,
        sqlName: slugifySqlName(t.name),
      }));
    return { local, external, incoming: 'incoming' };
  }, [dataModel, tableMetadata]);

  const sourceStatus = useMemo(() => {
    const sourceNode = state.nodes.find((n) => n.id === 'node-start');
    const ingestionMode = sourceNode?.params?.ingestionMode || 'api';
    const inheritedTable = sourceNode?.params?.inheritedTable || '';
    if (ingestionMode === 'inherited') {
      if (!inheritedTable) {
        return { title: 'No inherited table', detail: 'Pick a saved end node from another exploration.' };
      }
      return { title: 'Inherited table', detail: `Using ${inheritedTable}.` };
    }
    const tableCount = dataModel.order.length;
    const totalRows = dataModel.order.reduce(
      (sum, name) => sum + (dataModel.tables[name]?.length || 0),
      0
    );
    if (tableCount === 0) {
      return { title: 'No data', detail: 'Select a table from the knowledge model.' };
    }
    return { title: 'Connected', detail: `${tableCount} tables, ${totalRows} rows loaded.` };
  }, [state.nodes, dataModel]);

  const handleCanvasClick = useCallback(() => {
    state.setShowAddMenuForId(null);
    state.setShowInsertMenuForId(null);
  }, [state]);

  const handleAssistantRequest = useCallback(
    (nodeId: string, question: string) => {
      if (!capabilities.aiAssistant) return;
      return onAssistantRequest?.(nodeId, question);
    },
    [capabilities.aiAssistant, onAssistantRequest]
  );

  const selectedNode = state.nodes.find((n) => n.id === state.selectedNodeId);

  // Wrap updateNode through a readOnly gate.
  const gatedUpdateNode = useCallback(
    (id: string, updates: any, isMeta?: boolean) => {
      if (readOnly) return;
      state.updateNode(id, updates, isMeta);
    },
    [readOnly, state]
  );

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  const rootClassName = [
    'exploration-asset',
    resolvedTheme === 'dark' ? 'dark' : null,
    'relative flex h-full w-full flex-col bg-background text-foreground',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName} data-asset-id={assetId}>
      {/* Header: undo/redo, render mode switcher, help */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-background px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={state.undo}
            disabled={!state.canUndo || readOnly}
            aria-label="Undo"
          >
            <Undo size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={state.redo}
            disabled={!state.canRedo || readOnly}
            aria-label="Redo"
          >
            <Redo size={16} />
          </Button>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {RENDER_MODE_ITEMS.filter(
            (item) => !item.capability || capabilities[item.capability]
          ).map((item) => {
            const Icon = item.Icon;
            const isActive = state.renderMode === item.key;
            return (
              <Button
                key={item.key}
                variant={isActive ? 'default' : 'ghost'}
                size="sm"
                onClick={() => state.setRenderMode(item.key)}
                aria-label={item.label}
                title={item.label}
              >
                <Icon size={16} />
              </Button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          {onRequestSave && (
            <Button
              variant={isDirty ? 'default' : 'outline'}
              size="sm"
              onClick={onRequestSave}
              disabled={readOnly || !isDirty}
            >
              Save
            </Button>
          )}
          {capabilities.help && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHelp(true)}
              aria-label="Help"
            >
              <QuestionCircle size={16} />
            </Button>
          )}
        </div>
      </div>

      {/* Main canvas + panels */}
      <div className="relative flex flex-1 min-h-0">
        <div className="relative flex flex-1 min-h-0 flex-col">
          <ExplorationAssetView
            renderMode={state.renderMode}
            renderNodes={state.renderNodes}
            selectedNodeId={state.selectedNodeId}
            chainData={chainData}
            tableDensity={density}
            isMobileMode={isMobileMode}
            isSmartMode={isSmartMode}
            leafCountById={leafCountById as any}
            branchSelectionByNodeId={state.branchSelectionByNodeId as any}
            onSelect={state.setSelectedNodeId}
            onAdd={state.addNode}
            onInsert={state.insertNode}
            onRemove={state.removeNode}
            onToggleExpand={state.toggleNodeExpansion}
            onToggleBranch={state.toggleBranchCollapse}
            onToggleDataset={state.toggleDatasetForNode}
            onDrillDown={state.handleChartDrillDown}
            onTableCellClick={state.handleTableCellClick}
            onTableSortChange={state.handleTableSortChange}
            onAssistantRequest={handleAssistantRequest}
            onAddFilter={state.addFilterToNode}
            onUpdateFilter={state.updateFilterOnNode}
            onRemoveFilter={state.removeFilterFromNode}
            onFilterCellAction={state.handleFilterCellAction}
            showAddMenuForId={state.showAddMenuForId as any}
            setShowAddMenuForId={state.setShowAddMenuForId as any}
            showInsertMenuForId={state.showInsertMenuForId as any}
            setShowInsertMenuForId={state.setShowInsertMenuForId as any}
            onUpdateNodePosition={state.updateNodePosition}
            onAutoLayout={state.applyAutoLayout as any}
            onEntangledColorChange={state.updateEntangledGroupColor}
            onRenameBranch={state.renameBranch}
            onToggleEntangle={state.toggleEntangledBranch}
            onSelectBranch={state.setBranchSelection}
            canvasScrollRef={canvasScrollRef}
            onCanvasClick={handleCanvasClick}
          />

          {isMinimapMode && !isMobileMode && (
            <GraphMinimapPanel
              nodes={state.renderNodes as any}
              chainData={chainData}
              selectedNodeId={state.selectedNodeId}
              onSelect={state.setSelectedNodeId}
              className="absolute left-4 top-4 z-40"
            />
          )}

          {/* Collapsed panel expanders */}
          {!isMobileMode && (isStatsCollapsed || isPropertiesCollapsed) && (
            <div className="absolute right-4 top-4 flex flex-col gap-2 z-40">
              {capabilities.columnStatsPanel && isStatsCollapsed && (
                <Button variant="outline" size="sm" onClick={expandStatsPanel}>
                  Show Stats
                </Button>
              )}
              {capabilities.propertiesPanel && isPropertiesCollapsed && (
                <Button variant="outline" size="sm" onClick={expandPropertiesPanel}>
                  Show Properties
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Column stats panel (docked, desktop only) */}
        {capabilities.columnStatsPanel &&
          !isMobileMode &&
          !isStatsCollapsed &&
          !isStatsDetached && (
            <ColumnStatsPanel
              node={selectedNode}
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

        {/* Properties panel (docked, desktop only) */}
        {capabilities.propertiesPanel && !isMobileMode && !isPropertiesCollapsed && (
          <PropertiesPanel
            node={selectedNode}
            updateNode={gatedUpdateNode}
            schema={selectedSchema}
            data={selectedData}
            assetType="exploration"
            dataModel={dataModel}
            availableTables={availableTables}
            sourceStatus={sourceStatus}
            onShowDataModel={undefined}
            isFlattenedDataset={false}
            onCollapse={collapsePropertiesPanel}
            activeFilterIndex={
              state.activeFilterTarget?.nodeId === state.selectedNodeId
                ? state.activeFilterTarget.index
                : undefined
            }
            nodeResult={selectedResult}
            isMobile={false}
          />
        )}
      </div>

      {/* Help modal */}
      {capabilities.help && (
        <HelpModal open={showHelp} onClose={() => setShowHelp(false)} isMobile={isMobileMode} />
      )}
    </div>
  );
};

export default ExplorationAsset;
