import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  ChevronsDown,
  ChevronsUp,
  Layout,
  ChevronDown,
  ChevronRight,
  MoreHorizontal
} from '../ui/icons';
import {
  buildMinimapLayout,
  getMinimapBounds,
  getMinimapFitTransform,
  MINIMAP_NODE_HEIGHT,
  MINIMAP_NODE_WIDTH
} from '../utils/minimapLayout';

const GRAPH_MIN_SCALE = 0.4;
const GRAPH_MAX_SCALE = 2.2;
const GRAPH_ZOOM_STEP = 1.15;

const GRAPH_CARD_WIDTH = 280;
const GRAPH_CARD_PADDING = 14;
const GRAPH_CARD_HEADER_HEIGHT = 32;
const GRAPH_CARD_META_HEIGHT = 28;
const GRAPH_CARD_ACTIONS_HEIGHT = 34;
const GRAPH_CARD_SECTION_GAP = 8;

const GRAPH_MINIMAP_HEIGHT = 140;
const GRAPH_MINIMAP_WIDTH = GRAPH_CARD_WIDTH - GRAPH_CARD_PADDING * 2;
const GRAPH_MINIMAP_PADDING = 8;
const GRAPH_MINIMAP_MIN_SCALE = 0.1;
const GRAPH_MINIMAP_MAX_SCALE = 6;
const GRAPH_MINIMAP_HEADER_HEIGHT = 20;
const USAGE_EDGE_KINDS = new Set(['origin', 'inherited', 'sql', 'join']);

const GRAPH_CARD_COLLAPSED_HEIGHT = (
  GRAPH_CARD_PADDING
  + GRAPH_CARD_HEADER_HEIGHT
  + GRAPH_CARD_SECTION_GAP
  + GRAPH_CARD_META_HEIGHT
  + GRAPH_CARD_SECTION_GAP
  + GRAPH_CARD_ACTIONS_HEIGHT
  + GRAPH_CARD_PADDING
);
const GRAPH_CARD_EXPANDED_HEIGHT = (
  GRAPH_CARD_COLLAPSED_HEIGHT
  + GRAPH_MINIMAP_HEADER_HEIGHT
  + GRAPH_MINIMAP_HEIGHT
  + GRAPH_CARD_PADDING
);
const GRAPH_MINIMAP_OFFSET_X = GRAPH_CARD_PADDING;
const GRAPH_MINIMAP_OFFSET_Y = GRAPH_CARD_COLLAPSED_HEIGHT + GRAPH_MINIMAP_HEADER_HEIGHT;

const GRAPH_COLUMN_GAP = GRAPH_CARD_WIDTH + 220;
const GRAPH_VERTICAL_GAP = 32;
const GRAPH_ROW_GAP = GRAPH_CARD_COLLAPSED_HEIGHT + GRAPH_VERTICAL_GAP;
const GRAPH_BASE_OFFSET = { x: 80, y: 80 };
const GRAPH_LAYOUT_STORAGE_KEY = 'nma-workbench-graph-layout-v1';
const GRAPH_LAYOUT_STORAGE_VERSION = 1;
const GRAPH_EXPANDED_STORAGE_KEY = 'nma-workbench-graph-expanded-v1';
const GRAPH_EXPANDED_STORAGE_VERSION = 1;

const clampScale = (value: number) => Math.min(GRAPH_MAX_SCALE, Math.max(GRAPH_MIN_SCALE, value));

const isValidStoredPosition = (value: any): value is { x: number; y: number } => (
  value
  && Number.isFinite(value.x)
  && Number.isFinite(value.y)
);

const readStoredGraphPositions = (): Record<string, { x: number; y: number }> | null => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(GRAPH_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const payload = parsed?.positions && typeof parsed === 'object' ? parsed.positions : parsed;
    if (!payload || typeof payload !== 'object') return null;
    const positions: Record<string, { x: number; y: number }> = {};
    Object.keys(payload).forEach((id) => {
      const value = payload[id];
      if (isValidStoredPosition(value)) {
        positions[id] = { x: value.x, y: value.y };
      }
    });
    return Object.keys(positions).length > 0 ? positions : null;
  } catch {
    return null;
  }
};

const writeStoredGraphPositions = (positions: Record<string, { x: number; y: number }>) => {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.setItem(
      GRAPH_LAYOUT_STORAGE_KEY,
      JSON.stringify({ version: GRAPH_LAYOUT_STORAGE_VERSION, positions })
    );
    return true;
  } catch {
    return false;
  }
};

const readStoredExpandedNodeIds = (): Set<string> | null => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(GRAPH_EXPANDED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const payload = Array.isArray(parsed?.ids) ? parsed.ids : (Array.isArray(parsed) ? parsed : []);
    const ids = payload.filter((id: any) => typeof id === 'string' && id.trim());
    return new Set(ids);
  } catch {
    return null;
  }
};

const writeStoredExpandedNodeIds = (ids: Set<string>) => {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const list = Array.from(ids || []).filter((id) => typeof id === 'string' && id.trim());
    window.localStorage.setItem(
      GRAPH_EXPANDED_STORAGE_KEY,
      JSON.stringify({ version: GRAPH_EXPANDED_STORAGE_VERSION, ids: list })
    );
    return true;
  } catch {
    return false;
  }
};

const buildDefaultGraphLayout = (
  nodes: any[],
  edges: any[],
  expandedNodeIds: Set<string>
): Record<string, { x: number; y: number }> => {
  const positions: Record<string, { x: number; y: number }> = {};
  if (!Array.isArray(nodes) || nodes.length === 0) return positions;

  const assetNodes = nodes.filter((node) => node.type !== 'dataset');
  const datasetNodes = nodes.filter((node) => node.type === 'dataset');
  const explorationOrder = [...assetNodes].sort((a, b) => (
    (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.title.localeCompare(b.title)
  ));
  const explorationIndex = new Map(explorationOrder.map((node, idx) => [node.id, idx]));

  const datasetWeights = new Map<string, { sum: number; count: number }>();
  (edges || []).forEach((edge: any) => {
    const idx = explorationIndex.get(edge.from);
    if (idx == null) return;
    const current = datasetWeights.get(edge.to) || { sum: 0, count: 0 };
    datasetWeights.set(edge.to, { sum: current.sum + idx, count: current.count + 1 });
  });
  const datasetOrder = [...datasetNodes].sort((a, b) => {
    const weightA = datasetWeights.get(a.id);
    const weightB = datasetWeights.get(b.id);
    const avgA = weightA ? weightA.sum / weightA.count : Number.POSITIVE_INFINITY;
    const avgB = weightB ? weightB.sum / weightB.count : Number.POSITIVE_INFINITY;
    if (avgA !== avgB) return avgA - avgB;
    return a.title.localeCompare(b.title);
  });

  const resolveRowGap = (node: any) => (
    expandedNodeIds?.has?.(node.id)
      ? Math.max(GRAPH_ROW_GAP, GRAPH_CARD_EXPANDED_HEIGHT + GRAPH_VERTICAL_GAP)
      : GRAPH_ROW_GAP
  );
  let explorationY = 0;
  explorationOrder.forEach((node) => {
    positions[node.id] = { x: 0, y: explorationY };
    explorationY += resolveRowGap(node);
  });
  let datasetY = 0;
  datasetOrder.forEach((node) => {
    positions[node.id] = { x: GRAPH_COLUMN_GAP, y: datasetY };
    datasetY += resolveRowGap(node);
  });

  Object.keys(positions).forEach((id) => {
    positions[id] = {
      x: positions[id].x + GRAPH_BASE_OFFSET.x,
      y: positions[id].y + GRAPH_BASE_OFFSET.y
    };
  });

  return positions;
};

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

const resolveCardAnchor = (rect: Rect, side: string, offset = 4) => {
  if (side === 'left') return { x: rect.left - offset, y: rect.centerY };
  if (side === 'right') return { x: rect.right + offset, y: rect.centerY };
  if (side === 'top') return { x: rect.centerX, y: rect.top - offset };
  return { x: rect.centerX, y: rect.bottom + offset };
};

const chooseSides = (sourceRect: Rect, targetRect: Rect) => {
  const horizontalSeparation = Math.max(
    0,
    targetRect.left - sourceRect.right,
    sourceRect.left - targetRect.right
  );
  const verticalSeparation = Math.max(
    0,
    targetRect.top - sourceRect.bottom,
    sourceRect.top - targetRect.bottom
  );
  let orientation: 'horizontal' | 'vertical' = 'vertical';
  if (horizontalSeparation > verticalSeparation) {
    orientation = 'horizontal';
  } else if (horizontalSeparation === verticalSeparation) {
    const dx = targetRect.centerX - sourceRect.centerX;
    const dy = targetRect.centerY - sourceRect.centerY;
    orientation = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
  }
  if (orientation === 'horizontal') {
    const isRight = targetRect.centerX >= sourceRect.centerX;
    return {
      orientation,
      sourceSide: isRight ? 'right' : 'left',
      targetSide: isRight ? 'left' : 'right'
    };
  }
  const isBelow = targetRect.centerY >= sourceRect.centerY;
  return {
    orientation,
    sourceSide: isBelow ? 'bottom' : 'top',
    targetSide: isBelow ? 'top' : 'bottom'
  };
};

const buildConnectorPath = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  orientation: string
) => {
  if (!start || !end) return '';
  if (orientation === 'horizontal') {
    const deltaX = Math.max(60, Math.abs(end.x - start.x) * 0.5);
    const direction = end.x >= start.x ? 1 : -1;
    const c1x = start.x + deltaX * direction;
    const c2x = end.x - deltaX * direction;
    return `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c2x} ${end.y}, ${end.x} ${end.y}`;
  }
  const deltaY = Math.max(60, Math.abs(end.y - start.y) * 0.5);
  const direction = end.y >= start.y ? 1 : -1;
  const c1y = start.y + deltaY * direction;
  const c2y = end.y - deltaY * direction;
  return `M ${start.x} ${start.y} C ${start.x} ${c1y}, ${end.x} ${c2y}, ${end.x} ${end.y}`;
};

const buildMinimapState = (internalNodes: any[]) => {
  if (!Array.isArray(internalNodes) || internalNodes.length === 0) return null;
  const layoutPositions = buildMinimapLayout(internalNodes);
  const minimapNodes = internalNodes.map((node: any, index: number) => {
    const position = layoutPositions[node.id] || {
      x: index * (MINIMAP_NODE_WIDTH + 16),
      y: 0
    };
    return {
      id: node.id,
      parentId: node.parentId ?? null,
      title: node.title || 'Untitled',
      x: position.x,
      y: position.y
    };
  });
  const bounds = getMinimapBounds(minimapNodes, MINIMAP_NODE_WIDTH, MINIMAP_NODE_HEIGHT);
  const transform = getMinimapFitTransform(
    bounds,
    GRAPH_MINIMAP_WIDTH,
    GRAPH_MINIMAP_HEIGHT,
    {
      padding: GRAPH_MINIMAP_PADDING,
      minScale: GRAPH_MINIMAP_MIN_SCALE,
      maxScale: GRAPH_MINIMAP_MAX_SCALE
    }
  );
  return { layoutPositions, minimapNodes, transform };
};

interface MiniMapPreviewProps {
  layout: ReturnType<typeof buildMinimapState>;
  anchorMetaById?: Record<string, { incoming?: number; outgoing?: number }>;
}

const MiniMapPreview = ({ layout, anchorMetaById = {} }: MiniMapPreviewProps) => {
  if (!layout?.transform) {
    return (
      <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
        No nodes yet
      </div>
    );
  }
  const anchorIds = new Set(Object.keys(anchorMetaById || {}));
  const nodesById = new Map(layout.minimapNodes.map((node) => [node.id, node]));
  const edges = layout.minimapNodes
    .filter((node) => node.parentId && nodesById.has(node.parentId))
    .map((node) => {
      const parent = nodesById.get(node.parentId!)!;
      return {
        id: `${node.parentId}-${node.id}`,
        x1: parent.x + MINIMAP_NODE_WIDTH / 2,
        y1: parent.y + MINIMAP_NODE_HEIGHT / 2,
        x2: node.x + MINIMAP_NODE_WIDTH / 2,
        y2: node.y + MINIMAP_NODE_HEIGHT / 2
      };
    });

  return (
    <svg
      width={GRAPH_MINIMAP_WIDTH}
      height={GRAPH_MINIMAP_HEIGHT}
      className="workbench-graph-minimap"
    >
      <g transform={`translate(${layout.transform.x} ${layout.transform.y}) scale(${layout.transform.scale})`}>
        {edges.map((edge) => (
          <line
            key={edge.id}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke="currentColor"
            className="text-muted-foreground/30"
            strokeWidth="1"
          />
        ))}
        {layout.minimapNodes.map((node) => {
          const anchorMeta = anchorMetaById?.[node.id];
          const hasIncoming = (anchorMeta?.incoming || 0) > 0;
          const hasOutgoing = (anchorMeta?.outgoing || 0) > 0;
          const isHighlight = anchorIds.has(node.id);
          return (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width={MINIMAP_NODE_WIDTH}
                height={MINIMAP_NODE_HEIGHT}
                rx="4"
                className={isHighlight
                  ? 'workbench-graph-minimap-node is-highlight'
                  : 'workbench-graph-minimap-node'}
              />
              {hasIncoming && (
                <polygon
                  points={[
                    `${node.x + 4},${node.y + MINIMAP_NODE_HEIGHT / 2}`,
                    `${node.x + 9},${node.y + MINIMAP_NODE_HEIGHT / 2 - 3}`,
                    `${node.x + 9},${node.y + MINIMAP_NODE_HEIGHT / 2 + 3}`
                  ].join(' ')}
                  className="workbench-graph-minimap-anchor"
                />
              )}
              {hasOutgoing && (
                <polygon
                  points={[
                    `${node.x + MINIMAP_NODE_WIDTH - 4},${node.y + MINIMAP_NODE_HEIGHT / 2}`,
                    `${node.x + MINIMAP_NODE_WIDTH - 9},${node.y + MINIMAP_NODE_HEIGHT / 2 - 3}`,
                    `${node.x + MINIMAP_NODE_WIDTH - 9},${node.y + MINIMAP_NODE_HEIGHT / 2 + 3}`
                  ].join(' ')}
                  className="workbench-graph-minimap-anchor"
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
};

interface WorkbenchDependencyGraphProps {
  nodes?: any[];
  edges?: any[];
  anchorsByNodeId?: Record<string, Record<string, { incoming?: number; outgoing?: number }>>;
  placementHints?: Record<string, string>;
  onOpenAsset?: (assetId: string, type: string) => void;
  onOpenDataset?: (entry: any) => void;
  onFlattenDataset?: (entry: any) => void;
  onDuplicateAsset?: (assetId: string, nodeId: string) => void;
  onDeleteAsset?: (assetId: string) => void;
  onDuplicateDataset?: (entry: any, nodeId: string) => void;
  onDeleteDataset?: (entry: any) => void;
  className?: string;
}

const WorkbenchDependencyGraph = ({
  nodes = [],
  edges = [],
  anchorsByNodeId = {},
  placementHints = {},
  onOpenAsset,
  onOpenDataset,
  onFlattenDataset,
  onDuplicateAsset,
  onDeleteAsset,
  onDuplicateDataset,
  onDeleteDataset,
  className = ''
}: WorkbenchDependencyGraphProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = React.useState({ x: 0, y: 0, scale: 1 });
  const viewportRef = React.useRef(viewport);
  const [isPanning, setIsPanning] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [expandedNodeIds, setExpandedNodeIds] = React.useState<Set<string>>(() => (
    readStoredExpandedNodeIds() || new Set()
  ));
  const expandableNodes = React.useMemo(
    () => nodes.filter((node) => node.type !== 'rawDataset' && node.type !== 'sql'),
    [nodes]
  );
  const expandableNodeIds = React.useMemo(
    () => new Set(expandableNodes.map((node) => node.id)),
    [expandableNodes]
  );
  const panStateRef = React.useRef<any>(null);
  const dragStateRef = React.useRef<any>(null);
  const dragFrameRef = React.useRef<number | null>(null);
  const storedPositionsRef = React.useRef(readStoredGraphPositions());

  const [nodePositions, setNodePositions] = React.useState(() => {
    const defaults = buildDefaultGraphLayout(nodes, edges, expandedNodeIds);
    const stored = storedPositionsRef.current;
    if (!stored) return defaults;
    const next = { ...defaults };
    nodes.forEach((node) => {
      const storedPosition = stored[node.id];
      if (isValidStoredPosition(storedPosition)) {
        next[node.id] = { x: storedPosition.x, y: storedPosition.y };
      }
    });
    return next;
  });

  React.useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  React.useEffect(() => {
    setNodePositions((prev) => {
      const defaults = buildDefaultGraphLayout(nodes, edges, expandedNodeIds);
      const hasPlacementHints = nodes.some((node) => !prev[node.id] && placementHints?.[node.id]);
      const isDefaultLayout = nodes.every((node) => {
        const current = prev[node.id];
        if (!current) return true;
        const fallback = defaults[node.id];
        if (!fallback) return false;
        return Math.abs(current.x - fallback.x) < 1 && Math.abs(current.y - fallback.y) < 1;
      });
      if (isDefaultLayout && !hasPlacementHints) {
        return defaults;
      }
      let hasChanges = false;
      const next = { ...prev };
      const stored = storedPositionsRef.current || {};
      const resolveHeight = (nodeId: string) => (
        expandedNodeIds.has(nodeId) ? GRAPH_CARD_EXPANDED_HEIGHT : GRAPH_CARD_COLLAPSED_HEIGHT
      );
      const resolveBaseX = (node: any) => {
        const fallback = defaults[node.id];
        if (fallback && Number.isFinite(fallback.x)) return fallback.x;
        return node.type === 'dataset'
          ? GRAPH_BASE_OFFSET.x + GRAPH_COLUMN_GAP
          : GRAPH_BASE_OFFSET.x;
      };
      const resolveNextY = (nodeType: string) => {
        let maxY = GRAPH_BASE_OFFSET.y;
        nodes.forEach((other) => {
          if (other.type !== nodeType) return;
          const position = next[other.id];
          if (!position) return;
          maxY = Math.max(maxY, position.y + resolveHeight(other.id));
        });
        return maxY + GRAPH_VERTICAL_GAP;
      };
      const resolveHintedPosition = (nodeId: string) => {
        const sourceId = placementHints?.[nodeId];
        if (!sourceId) return null;
        const sourcePosition = next[sourceId];
        if (!sourcePosition) return null;
        return {
          x: sourcePosition.x + 24,
          y: sourcePosition.y + 18
        };
      };
      nodes.forEach((node) => {
        if (!next[node.id]) {
          const storedPosition = stored[node.id];
          if (isValidStoredPosition(storedPosition)) {
            next[node.id] = { x: storedPosition.x, y: storedPosition.y };
          } else {
            const hinted = resolveHintedPosition(node.id);
            if (hinted) {
              next[node.id] = hinted;
            } else {
              const fallback = defaults[node.id];
              const baseX = resolveBaseX(node);
              const baseY = Number.isFinite(fallback?.y) ? fallback.y : GRAPH_BASE_OFFSET.y;
              const nextY = resolveNextY(node.type);
              next[node.id] = {
                x: Number.isFinite(fallback?.x) ? fallback.x : baseX,
                y: Math.max(baseY, nextY)
              };
            }
          }
          hasChanges = true;
        }
      });
      Object.keys(next).forEach((id) => {
        if (!nodes.find((node) => node.id === id)) {
          delete next[id];
          hasChanges = true;
        }
      });
      return hasChanges ? next : prev;
    });
  }, [nodes, edges, expandedNodeIds, placementHints]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    if (!Array.isArray(nodes) || nodes.length === 0) return undefined;
    const timeout = window.setTimeout(() => {
      const nextStored: Record<string, { x: number; y: number }> = {};
      nodes.forEach((node) => {
        const position = nodePositions[node.id];
        if (isValidStoredPosition(position)) {
          nextStored[node.id] = { x: position.x, y: position.y };
        }
      });
      storedPositionsRef.current = nextStored;
      writeStoredGraphPositions(nextStored);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [nodePositions, nodes]);

  React.useEffect(() => {
    if (!Array.isArray(nodes)) return;
    const idSet = new Set(nodes.map((node) => node.id));
    setExpandedNodeIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => idSet.has(id) && expandableNodeIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [nodes, expandableNodeIds]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    const timeout = window.setTimeout(() => {
      writeStoredExpandedNodeIds(expandedNodeIds);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [expandedNodeIds]);

  const minimapLayouts = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildMinimapState>>();
    nodes.forEach((node) => {
      const layout = buildMinimapState(node.internalNodes || []);
      if (layout) map.set(node.id, layout);
    });
    return map;
  }, [nodes]);

  const resolveNodePosition = React.useCallback(
    (nodeId: string) => nodePositions[nodeId],
    [nodePositions]
  );

  const getCardHeight = React.useCallback(
    (nodeId: string) => (expandedNodeIds.has(nodeId) ? GRAPH_CARD_EXPANDED_HEIGHT : GRAPH_CARD_COLLAPSED_HEIGHT),
    [expandedNodeIds]
  );

  const getCardRect = React.useCallback((nodeId: string): Rect | null => {
    const position = resolveNodePosition(nodeId);
    if (!position) return null;
    const height = getCardHeight(nodeId);
    const left = position.x;
    const top = position.y;
    return {
      left,
      top,
      right: left + GRAPH_CARD_WIDTH,
      bottom: top + height,
      centerX: left + GRAPH_CARD_WIDTH / 2,
      centerY: top + height / 2,
      width: GRAPH_CARD_WIDTH,
      height
    };
  }, [getCardHeight, resolveNodePosition]);

  const resolveAnchor = React.useCallback((nodeId: string, internalNodeId: string, rect: Rect, side: string) => {
    if (!rect) return null;
    const isExpanded = expandedNodeIds.has(nodeId);
    if (isExpanded) {
      const layout = minimapLayouts.get(nodeId);
      const anchorPosition = layout?.layoutPositions?.[internalNodeId];
      if (layout?.transform && anchorPosition) {
        const scale = layout.transform.scale;
        const nodeLeft = rect.left
          + GRAPH_MINIMAP_OFFSET_X
          + layout.transform.x
          + anchorPosition.x * scale;
        const nodeTop = rect.top
          + GRAPH_MINIMAP_OFFSET_Y
          + layout.transform.y
          + anchorPosition.y * scale;
        const nodeRect: Rect = {
          left: nodeLeft,
          top: nodeTop,
          right: nodeLeft + MINIMAP_NODE_WIDTH * scale,
          bottom: nodeTop + MINIMAP_NODE_HEIGHT * scale,
          centerX: nodeLeft + (MINIMAP_NODE_WIDTH * scale) / 2,
          centerY: nodeTop + (MINIMAP_NODE_HEIGHT * scale) / 2,
          width: MINIMAP_NODE_WIDTH * scale,
          height: MINIMAP_NODE_HEIGHT * scale
        };
        return resolveCardAnchor(nodeRect, side, 0);
      }
    }
    return resolveCardAnchor(rect, side);
  }, [expandedNodeIds, minimapLayouts]);

  const edgePaths = React.useMemo(() => (
    edges.map((edge: any) => {
      const sourceRect = getCardRect(edge.from);
      const targetRect = getCardRect(edge.to);
      if (!sourceRect || !targetRect) return null;
      const { orientation, sourceSide, targetSide } = chooseSides(sourceRect, targetRect);
      const start = resolveAnchor(edge.from, edge.sourceAnchorId, sourceRect, sourceSide);
      const end = resolveAnchor(edge.to, edge.targetAnchorId, targetRect, targetSide);
      if (!start || !end) return null;
      return { id: edge.id, path: buildConnectorPath(start, end, orientation), kind: edge.kind };
    }).filter(Boolean)
  ), [edges, getCardRect, resolveAnchor]);

  const zoomBy = React.useCallback((factor: number, point: { x: number; y: number }) => {
    if (!point) return;
    setViewport((prev) => {
      const nextScale = clampScale(prev.scale * factor);
      if (nextScale === prev.scale) return prev;
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: point.x - (point.x - prev.x) * ratio,
        y: point.y - (point.y - prev.y) * ratio
      };
    });
  }, []);

  const handleWheel = React.useCallback((event: WheelEvent) => {
    const isZoomShortcut = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!isZoomShortcut) return;
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const dominantDelta = Math.abs(event.deltaY) > Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;
    const zoomFactor = Math.exp(-dominantDelta * 0.001);
    zoomBy(zoomFactor, pointer);
  }, [zoomBy]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const onWheel = (event: WheelEvent) => handleWheel(event);
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [handleWheel]);

  const handlePanMove = React.useCallback((event: PointerEvent) => {
    const state = panStateRef.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    setViewport((prev) => ({ ...prev, x: state.originX + dx, y: state.originY + dy }));
  }, []);

  const handlePanEnd = React.useCallback(() => {
    panStateRef.current = null;
    setIsPanning(false);
    window.removeEventListener('pointermove', handlePanMove);
    window.removeEventListener('pointerup', handlePanEnd);
  }, [handlePanMove]);

  const handlePanStart = React.useCallback((event: React.PointerEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();
    panStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: viewportRef.current.x,
      originY: viewportRef.current.y
    };
    setIsPanning(true);
    window.addEventListener('pointermove', handlePanMove);
    window.addEventListener('pointerup', handlePanEnd);
  }, [handlePanMove, handlePanEnd]);

  const handleNodeDragMove = React.useCallback((event: PointerEvent) => {
    const state = dragStateRef.current;
    if (!state) return;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    if (dragFrameRef.current) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const scale = viewportRef.current.scale || 1;
      const dx = (state.lastX - state.startX) / scale;
      const dy = (state.lastY - state.startY) / scale;
      setNodePositions((prev) => ({
        ...prev,
        [state.nodeId]: { x: state.originX + dx, y: state.originY + dy }
      }));
    });
  }, []);

  const handleNodeDragEnd = React.useCallback(() => {
    if (dragFrameRef.current) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    dragStateRef.current = null;
    setIsDragging(false);
    window.removeEventListener('pointermove', handleNodeDragMove);
    window.removeEventListener('pointerup', handleNodeDragEnd);
  }, [handleNodeDragMove]);

  const handleNodeDragStart = React.useCallback((nodeId: string, event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const position = resolveNodePosition(nodeId);
    if (!position) return;
    dragStateRef.current = {
      nodeId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      originX: position.x,
      originY: position.y
    };
    setIsDragging(true);
    window.addEventListener('pointermove', handleNodeDragMove);
    window.addEventListener('pointerup', handleNodeDragEnd);
  }, [handleNodeDragMove, handleNodeDragEnd, resolveNodePosition]);

  const handleZoomIn = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    zoomBy(GRAPH_ZOOM_STEP, { x: rect.width / 2, y: rect.height / 2 });
  }, [zoomBy]);

  const handleZoomOut = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    zoomBy(1 / GRAPH_ZOOM_STEP, { x: rect.width / 2, y: rect.height / 2 });
  }, [zoomBy]);

  const handleResetZoom = React.useCallback(() => {
    setViewport({ x: 0, y: 0, scale: 1 });
  }, []);

  const handleAutoLayout = React.useCallback(() => {
    setNodePositions(buildDefaultGraphLayout(nodes, edges, expandedNodeIds));
  }, [nodes, edges, expandedNodeIds]);

  const toggleExpand = React.useCallback((nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const isAllExpanded = React.useMemo(() => (
    expandableNodes.length > 0 && expandableNodes.every((node) => expandedNodeIds.has(node.id))
  ), [expandableNodes, expandedNodeIds]);

  const handleToggleExpandAll = React.useCallback(() => {
    setExpandedNodeIds((prev) => {
      if (expandableNodes.length === 0) return new Set<string>();
      const allExpanded = expandableNodes.every((node) => prev.has(node.id));
      if (allExpanded) return new Set<string>();
      return new Set(expandableNodes.map((node) => node.id));
    });
  }, [expandableNodes]);

  const getBadgeClasses = (type: string) => {
    switch (type) {
      case 'dataset': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30';
      case 'raw': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30';
      case 'sql': return 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-500/20 dark:text-fuchsia-300 dark:border-fuchsia-500/30';
      default: return '';
    }
  };

  return (
    <div
      ref={containerRef}
      className={`workbench-graph-canvas relative w-full flex-1 min-h-0 overflow-hidden bg-muted/30 flex flex-col ${
        isPanning || isDragging ? 'is-panning' : ''
      } ${className}`}
      onPointerDown={handlePanStart}
    >
      <div
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: '0 0'
        }}
        className="absolute inset-0"
      >
        {nodes.map((node) => {
          const position = resolveNodePosition(node.id) || { x: GRAPH_BASE_OFFSET.x, y: GRAPH_BASE_OFFSET.y };
          const isExpandable = node.type !== 'rawDataset' && node.type !== 'sql';
          const isExpanded = isExpandable && expandedNodeIds.has(node.id);
          const layout = minimapLayouts.get(node.id);
          const anchors = anchorsByNodeId[node.id] || {};
          const isDatasetNode = node.type === 'dataset';
          const isRawDatasetNode = node.type === 'rawDataset';
          const isSqlNode = node.type === 'sql';
          const isFlattenedDataset = isDatasetNode && node.datasetEntry?.isFlattened === true;
          const anchorIds = Object.keys(anchors);
          const linkCount = anchorIds.reduce((sum: number, anchorId: string) => (
            sum + (anchors[anchorId]?.incoming || 0) + (anchors[anchorId]?.outgoing || 0)
          ), 0);
          const updatedLabel = node.updatedAt
            ? `Updated ${new Date(node.updatedAt).toLocaleDateString()}`
            : 'Updated just now';

          const cardToneClass = isDatasetNode
            ? 'border-emerald-200/70 dark:border-emerald-700/60 bg-card'
            : isRawDatasetNode
              ? 'border-blue-300/80 dark:border-blue-600/70 bg-blue-50/80 dark:bg-blue-950/30'
              : isSqlNode
                ? 'border-fuchsia-300/80 dark:border-fuchsia-600/70 bg-fuchsia-50/80 dark:bg-fuchsia-950/30'
                : 'border-border/70 bg-card/90';

          return (
            <div
              key={node.id}
              className="absolute z-10"
              style={{ left: position.x, top: position.y, width: GRAPH_CARD_WIDTH }}
            >
              <div className={`workbench-graph-card rounded-2xl border shadow-sm ${cardToneClass}`}>
                <div style={{ padding: GRAPH_CARD_PADDING }}>
                  <div
                    className="flex flex-col justify-center gap-1 node-drag-handle"
                    style={{ minHeight: GRAPH_CARD_HEADER_HEIGHT }}
                    onPointerDown={(event) => handleNodeDragStart(node.id, event)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {node.title}
                      </div>
                      <div className="flex items-center gap-1">
                        {isDatasetNode && (
                          <Badge className={`rounded-full px-2 text-[10px] ${getBadgeClasses('dataset')}`}>
                            {isFlattenedDataset ? 'Flattened dataset' : 'Dataset'}
                          </Badge>
                        )}
                        {isRawDatasetNode && (
                          <Badge className={`rounded-full px-2 text-[10px] ${getBadgeClasses('raw')}`}>
                            Raw dataset
                          </Badge>
                        )}
                        {isSqlNode && (
                          <Badge className={`rounded-full px-2 text-[10px] ${getBadgeClasses('sql')}`}>
                            SQL
                          </Badge>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => event.stopPropagation()}
                              aria-label="Card actions"
                            >
                              <MoreHorizontal size={14} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isDatasetNode && onFlattenDataset && (
                              <DropdownMenuItem
                                disabled={isFlattenedDataset}
                                onClick={() => onFlattenDataset?.(node.datasetEntry)}
                              >
                                {isFlattenedDataset ? 'Flattened' : 'Flatten dataset'}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => {
                                if (isDatasetNode) {
                                  onDuplicateDataset?.(node.datasetEntry, node.id);
                                } else {
                                  onDuplicateAsset?.(node.assetId, node.id);
                                }
                              }}
                            >
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (isDatasetNode) {
                                  onDeleteDataset?.(node.datasetEntry);
                                } else {
                                  onDeleteAsset?.(node.assetId);
                                }
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-2"
                    style={{ minHeight: GRAPH_CARD_META_HEIGHT, marginTop: GRAPH_CARD_SECTION_GAP }}
                  >
                    {node.type === 'exploration' ? (
                      <>
                        <Badge variant="secondary" className="rounded-full px-2 text-[10px]">
                          {node.nodeCount} nodes
                        </Badge>
                        <Badge variant="secondary" className="rounded-full px-2 text-[10px]">
                          {node.branchCount} branches
                        </Badge>
                      </>
                    ) : (
                      <>
                        <Badge variant="secondary" className="rounded-full px-2 text-[10px]">
                          {node.rowCount} rows
                        </Badge>
                        <Badge variant="secondary" className="rounded-full px-2 text-[10px]">
                          {node.columnCount} cols
                        </Badge>
                      </>
                    )}
                  </div>

                  <div
                    className="flex items-center justify-between gap-2"
                    style={{ minHeight: GRAPH_CARD_ACTIONS_HEIGHT, marginTop: GRAPH_CARD_SECTION_GAP }}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isDatasetNode) {
                          onOpenDataset?.(node.datasetEntry);
                        } else {
                          onOpenAsset?.(node.assetId, node.type);
                        }
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      {isDatasetNode
                        ? 'Open Dataset'
                        : (isRawDatasetNode ? 'Open Raw Dataset' : (isSqlNode ? 'Open SQL Transformation' : 'Open Exploration'))}
                    </Button>
                    {isExpandable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleExpand(node.id);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </Button>
                    )}
                  </div>
                </div>

                {isExpanded && isExpandable && (
                  <div style={{ padding: `0 ${GRAPH_CARD_PADDING}px ${GRAPH_CARD_PADDING}px` }}>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-2">
                      <span>{updatedLabel}</span>
                      <span>{linkCount > 0 ? `${linkCount} links` : 'No links'}</span>
                    </div>
                    <MiniMapPreview layout={layout} anchorMetaById={anchors} />
                  </div>
                )}

              </div>
            </div>
          );
        })}

        <svg
          className="absolute inset-0 pointer-events-none text-muted-foreground/30 z-20 overflow-visible"
          width="100%"
          height="100%"
        >
          <defs>
            <marker
              id="workbench-graph-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {edgePaths.map((edge: any) => {
            const isUsageEdge = USAGE_EDGE_KINDS.has(edge.kind);
            const isOriginEdge = edge.kind === 'origin';
            const strokeClass = isOriginEdge
              ? 'text-muted-foreground/20'
              : 'text-muted-foreground/30';
            return (
              <path
                key={edge.id}
                d={edge.path}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeDasharray={isUsageEdge ? '4 4' : undefined}
                markerEnd="url(#workbench-graph-arrow)"
                className={strokeClass}
              />
            );
          })}
        </svg>
      </div>

      <div className="absolute right-4 bottom-4 z-30 flex flex-col gap-1 rounded-lg border border-border bg-background/90 p-1 shadow-sm">
        <button
          onClick={handleZoomIn}
          className="h-7 w-7 rounded text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="h-7 w-7 rounded text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={handleResetZoom}
          className="h-7 w-7 rounded text-[10px] font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          title="Reset zoom"
        >
          {Math.round(viewport.scale * 100)}%
        </button>
        <div className="my-1 h-px bg-border" />
        <button
          onClick={handleAutoLayout}
          className="h-7 w-7 rounded text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center justify-center"
          title="Optimize layout"
          aria-label="Optimize layout"
        >
          <Layout size={14} />
        </button>
        <button
          onClick={handleToggleExpandAll}
          className="h-7 w-7 rounded text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center justify-center"
          title={isAllExpanded ? 'Collapse all cards' : 'Expand all cards'}
          aria-label={isAllExpanded ? 'Collapse all cards' : 'Expand all cards'}
        >
          {isAllExpanded ? <ChevronsUp size={14} /> : <ChevronsDown size={14} />}
        </button>
      </div>
    </div>
  );
};

export default WorkbenchDependencyGraph;
