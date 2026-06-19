import React from 'react';
import { Button } from './ui/button';
import { Layout, Minimize2 } from '../icons';
import {
  buildMinimapLayout,
  getMinimapBounds,
  getMinimapFitTransform,
  MINIMAP_NODE_WIDTH,
  MINIMAP_NODE_HEIGHT
} from '../lib/minimapLayout';

const PANEL_WIDTH = 240;
const PANEL_HEIGHT = 160;
const MIN_PANEL_WIDTH = 180;
const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_WIDTH = 480;
const MAX_PANEL_HEIGHT = 360;
const NODE_WIDTH = MINIMAP_NODE_WIDTH;
const NODE_HEIGHT = MINIMAP_NODE_HEIGHT;
const NODE_PADDING_X = 6;
const TITLE_CHAR_LIMIT = 18;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const FIT_MIN_SCALE = 0.05;
const FIT_MAX_SCALE = 12;
const FIT_PADDING = 12;

const truncateText = (value: any, maxChars: number) => {
  const text = value == null ? '' : String(value);
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 3)}...`;
};

const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

interface Transform {
  x: number;
  y: number;
  scale: number;
}

interface MinimapNode {
  id: string;
  parentId?: string;
  title: string;
  rowCount: number;
  entangledPeerId?: string;
  entangledRootId?: string;
  entangledColor?: string;
  x: number;
  y: number;
  index: number;
}

interface GraphMinimapPanelProps {
  nodes?: any[];
  chainData?: any[];
  selectedNodeId?: string;
  onSelect?: (nodeId: string, options?: { center?: boolean }) => void;
  className?: string;
}

const GraphMinimapPanel = ({
  nodes = [],
  chainData = [],
  selectedNodeId,
  onSelect,
  className = ''
}: GraphMinimapPanelProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [transform, setTransform] = React.useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [panelRect, setPanelRect] = React.useState({ width: 0, height: 0 });
  const [panelSize, setPanelSize] = React.useState({ width: PANEL_WIDTH, height: PANEL_HEIGHT });
  const [isPanning, setIsPanning] = React.useState(false);
  const [isResizing, setIsResizing] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const transformRef = React.useRef(transform);
  const panOriginRef = React.useRef({ x: 0, y: 0 });
  const panStartRef = React.useRef({ x: 0, y: 0 });
  const isPanningRef = React.useRef(false);
  const resizeOriginRef = React.useRef({ x: 0, y: 0 });
  const resizeStartSizeRef = React.useRef({ width: PANEL_WIDTH, height: PANEL_HEIGHT });
  const isResizingRef = React.useRef(false);
  const userAdjustedRef = React.useRef(false);

  React.useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setPanelRect({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen]);

  React.useEffect(() => {
    setPanelRect({ width: panelSize.width, height: panelSize.height });
  }, [panelSize]);

  const resultsById = React.useMemo(() => {
    const map = new Map();
    if (!Array.isArray(chainData)) return map;
    chainData.forEach((result: any) => {
      if (!result?.nodeId) return;
      map.set(result.nodeId, result);
    });
    return map;
  }, [chainData]);

  const layoutPositions = React.useMemo(() => buildMinimapLayout(nodes), [nodes]);

  const minimapNodes: MinimapNode[] = React.useMemo(() => (
    nodes.map((node: any, index: number) => {
      const position = layoutPositions[node.id] || { x: 0, y: 0 };
      const result = resultsById.get(node.id);
      const rowCount = Number.isFinite(result?.rowCount) ? result.rowCount : 0;
      return {
        id: node.id,
        parentId: node.parentId,
        title: node.title || 'Untitled',
        rowCount,
        entangledPeerId: node.entangledPeerId,
        entangledRootId: node.entangledRootId,
        entangledColor: node.entangledColor,
        x: position.x,
        y: position.y,
        index
      };
    })
  ), [nodes, layoutPositions, resultsById]);

  const entangledGroups = React.useMemo(() => {
    const map = new Map<string, { id: string; color?: string; nodes: MinimapNode[] }>();
    minimapNodes.forEach((node) => {
      const groupId = node.entangledRootId;
      if (!groupId) return;
      const current = map.get(groupId) || { id: groupId, color: node.entangledColor, nodes: [] };
      if (!current.color && node.entangledColor) current.color = node.entangledColor;
      current.nodes.push(node);
      map.set(groupId, current);
    });
    return Array.from(map.values()).filter(group => group.nodes.length > 1);
  }, [minimapNodes]);

  const edges = React.useMemo(() => {
    const nodesById = new Map(minimapNodes.map(node => [node.id, node]));
    const lines: { id: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    minimapNodes.forEach((node) => {
      if (!node.parentId) return;
      const parent = nodesById.get(node.parentId);
      if (!parent) return;
      lines.push({
        id: `${node.parentId}::${node.id}`,
        x1: parent.x + NODE_WIDTH / 2,
        y1: parent.y + NODE_HEIGHT / 2,
        x2: node.x + NODE_WIDTH / 2,
        y2: node.y + NODE_HEIGHT / 2
      });
    });
    return lines;
  }, [minimapNodes]);

  const bounds = React.useMemo(
    () => getMinimapBounds(minimapNodes, NODE_WIDTH, NODE_HEIGHT),
    [minimapNodes]
  );

  const fitTransform = React.useMemo(() => {
    if (!bounds) return null;
    const width = panelSize.width || panelRect.width;
    const height = panelSize.height || panelRect.height;
    return getMinimapFitTransform(bounds, width, height, {
      padding: FIT_PADDING,
      minScale: FIT_MIN_SCALE,
      maxScale: FIT_MAX_SCALE
    });
  }, [bounds, panelRect, panelSize]);

  React.useEffect(() => {
    if (!isOpen || !fitTransform) return;
    if (userAdjustedRef.current && !isResizingRef.current) return;
    setTransform(fitTransform);
  }, [isOpen, fitTransform, panelSize]);

  const handleToggle = React.useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) userAdjustedRef.current = false;
      return next;
    });
  }, []);

  const handleWheel = React.useCallback((event: React.WheelEvent) => {
    if (!containerRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY;
    if (delta === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const scaleBy = delta < 0 ? 1.1 : 0.9;
    setTransform((prev) => {
      const nextScale = clampScale(prev.scale * scaleBy);
      if (nextScale === prev.scale) return prev;
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: cursorX - (cursorX - prev.x) * ratio,
        y: cursorY - (cursorY - prev.y) * ratio
      };
    });
    userAdjustedRef.current = true;
  }, []);

  const handlePointerDown = React.useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    isPanningRef.current = true;
    setIsPanning(true);
    panOriginRef.current = { x: event.clientX, y: event.clientY };
    panStartRef.current = { x: transformRef.current.x, y: transformRef.current.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = React.useCallback((event: React.PointerEvent) => {
    if (!isPanningRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - panOriginRef.current.x;
    const dy = event.clientY - panOriginRef.current.y;
    setTransform((prev) => ({
      ...prev,
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy
    }));
    userAdjustedRef.current = true;
  }, []);

  const stopPanning = React.useCallback((event: React.PointerEvent) => {
    if (!isPanningRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    isPanningRef.current = false;
    setIsPanning(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (_) {
      // Ignore release errors.
    }
  }, []);

  const handleDoubleClick = React.useCallback((event: React.MouseEvent) => {
    if (!fitTransform) return;
    event.preventDefault();
    event.stopPropagation();
    userAdjustedRef.current = false;
    setTransform(fitTransform);
  }, [fitTransform]);

  const startResize = React.useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    isResizingRef.current = true;
    setIsResizing(true);
    userAdjustedRef.current = false;
    resizeOriginRef.current = { x: event.clientX, y: event.clientY };
    resizeStartSizeRef.current = { ...panelSize };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [panelSize]);

  const handleResizeMove = React.useCallback((event: React.PointerEvent) => {
    if (!isResizingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - resizeOriginRef.current.x;
    const dy = event.clientY - resizeOriginRef.current.y;
    const nextWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, resizeStartSizeRef.current.width + dx));
    const nextHeight = Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, resizeStartSizeRef.current.height + dy));
    setPanelSize({ width: nextWidth, height: nextHeight });
  }, []);

  const stopResize = React.useCallback((event: React.PointerEvent) => {
    if (!isResizingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    isResizingRef.current = false;
    setIsResizing(false);
    userAdjustedRef.current = false;
    if (fitTransform) {
      setTransform(fitTransform);
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (_) {
      // Ignore release errors.
    }
  }, [fitTransform]);

  const handleNodeSelect = React.useCallback((event: React.MouseEvent, nodeId: string) => {
    event.stopPropagation();
    onSelect?.(nodeId, { center: true });
  }, [onSelect]);

  const buildEntangledGroupStyle = React.useCallback((color?: string) => {
    if (!color || typeof color !== 'string') {
      return { stroke: 'currentColor', fill: 'transparent' };
    }
    const hex = color.replace('#', '').trim();
    if (hex.length !== 6) {
      return { stroke: 'currentColor', fill: 'transparent' };
    }
    const int = Number.parseInt(hex, 16);
    if (Number.isNaN(int)) {
      return { stroke: 'currentColor', fill: 'transparent' };
    }
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return {
      stroke: `rgba(${r}, ${g}, ${b}, 0.7)`,
      fill: `rgba(${r}, ${g}, ${b}, 0.12)`
    };
  }, []);

  return (
    <div className={`pointer-events-auto ${className}`}>
      {isOpen ? (
        <div className="rounded-lg border border-border bg-background/90 p-2 shadow-sm">
          <div className="flex items-center justify-between pb-2">
            <div className="text-xs font-semibold text-foreground">Minimap</div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleToggle}
              aria-label="Collapse minimap"
            >
              <Minimize2 size={12} />
            </Button>
          </div>
          <div
            ref={containerRef}
            className={`relative overflow-hidden rounded-md border border-border/70 bg-background/70 ${
              isResizing ? 'cursor-se-resize' : (isPanning ? 'cursor-grabbing' : 'cursor-grab')
            }`}
            style={{ width: panelSize.width, height: panelSize.height }}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopPanning}
            onPointerLeave={stopPanning}
            onDoubleClick={handleDoubleClick}
          >
            {minimapNodes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                No nodes yet
              </div>
            ) : (
              <svg
                className="absolute inset-0"
                width="100%"
                height="100%"
                style={{ width: '100%', height: '100%' }}
                aria-hidden="true"
              >
                <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
                  {entangledGroups.map((group) => {
                    const padding = 6;
                    let minX = Infinity;
                    let minY = Infinity;
                    let maxX = -Infinity;
                    let maxY = -Infinity;
                    group.nodes.forEach((node) => {
                      minX = Math.min(minX, node.x);
                      minY = Math.min(minY, node.y);
                      maxX = Math.max(maxX, node.x + NODE_WIDTH);
                      maxY = Math.max(maxY, node.y + NODE_HEIGHT);
                    });
                    if (!Number.isFinite(minX)) return null;
                    const style = buildEntangledGroupStyle(group.color);
                    return (
                      <rect
                        key={group.id}
                        x={minX - padding}
                        y={minY - padding}
                        width={(maxX - minX) + padding * 2}
                        height={(maxY - minY) + padding * 2}
                        rx={8}
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                        {...style}
                      />
                    );
                  })}
                  {edges.map((edge) => (
                    <line
                      key={edge.id}
                      x1={edge.x1}
                      y1={edge.y1}
                      x2={edge.x2}
                      y2={edge.y2}
                      stroke="currentColor"
                      strokeWidth={1}
                      className="text-muted-foreground/30"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  ))}
                  {minimapNodes.map((node) => {
                    const rowLabel = `${node.rowCount} rows`;
                    const titleLabel = truncateText(node.title, TITLE_CHAR_LIMIT);
                    const isSelected = node.id === selectedNodeId;
                    return (
                      <g
                        key={node.id}
                        className="cursor-pointer"
                        onClick={(event) => handleNodeSelect(event, node.id)}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <rect
                          x={node.x}
                          y={node.y}
                          width={NODE_WIDTH}
                          height={NODE_HEIGHT}
                          rx={6}
                          className="workbench-graph-minimap-node"
                        />
                        {isSelected && (
                          <rect
                            x={node.x}
                            y={node.y}
                            width={NODE_WIDTH}
                            height={NODE_HEIGHT}
                            rx={6}
                            className="workbench-graph-minimap-node is-highlight"
                            strokeWidth={2}
                            pointerEvents="none"
                            vectorEffect="non-scaling-stroke"
                          />
                        )}
                        <text
                          x={node.x + NODE_PADDING_X}
                          y={node.y + 12}
                          fontSize={9}
                          fontWeight={600}
                          fill="currentColor"
                          className="text-foreground"
                        >
                          {titleLabel}
                        </text>
                        <text
                          x={node.x + NODE_PADDING_X}
                          y={node.y + 24}
                          fontSize={8}
                          fill="currentColor"
                          className="text-muted-foreground"
                        >
                          {rowLabel}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}
            <div
              className="absolute bottom-1 right-1 h-3 w-3 rounded-sm border border-border bg-background/80 shadow-sm"
              style={{ touchAction: 'none' }}
              onPointerDown={startResize}
              onPointerMove={handleResizeMove}
              onPointerUp={stopResize}
              onPointerLeave={stopResize}
              role="presentation"
              aria-label="Resize minimap"
            />
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggle}
          className="shadow-sm"
        >
          <Layout size={12} />
          Minimap
        </Button>
      )}
    </div>
  );
};

export { GraphMinimapPanel };
