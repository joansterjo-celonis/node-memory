// src/components/GraphMinimapPanel.jsx
// Small minimap panel for classic/entangled modes.
import React from 'react';
import { Button } from 'antd';
import { Layout, Minimize2 } from '../ui/icons';

const PANEL_WIDTH = 240;
const PANEL_HEIGHT = 160;
const NODE_WIDTH = 110;
const NODE_HEIGHT = 32;
const NODE_PADDING_X = 6;
const TITLE_CHAR_LIMIT = 18;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const FIT_PADDING = 12;

const truncateText = (value, maxChars) => {
  const text = value == null ? '' : String(value);
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 3)}...`;
};

const buildMinimapLayout = (nodes) => {
  const positions = {};
  if (!Array.isArray(nodes) || nodes.length === 0) return positions;

  const nodesById = new Map();
  const childrenByParent = new Map();
  nodes.forEach((node) => {
    if (!node?.id) return;
    nodesById.set(node.id, node);
    const key = node.parentId ?? null;
    const list = childrenByParent.get(key) || [];
    list.push(node);
    childrenByParent.set(key, list);
  });

  const roots = [];
  nodes.forEach((node) => {
    if (!node?.id) return;
    if (!node.parentId || !nodesById.has(node.parentId)) roots.push(node);
  });

  const columnGap = NODE_WIDTH + 24;
  const rowGap = NODE_HEIGHT + 44;
  const offset = { x: 16, y: 16 };
  let leafIndex = 0;

  const assign = (nodeId, depth, stack) => {
    if (positions[nodeId]) return positions[nodeId].x;
    if (stack.has(nodeId)) return leafIndex * columnGap;
    stack.add(nodeId);
    const children = childrenByParent.get(nodeId) || [];
    if (children.length === 0) {
      const x = leafIndex * columnGap;
      positions[nodeId] = { x, y: depth * rowGap };
      leafIndex += 1;
      stack.delete(nodeId);
      return x;
    }
    const childXs = children.map((child) => assign(child.id, depth + 1, stack));
    const x = childXs.reduce((sum, value) => sum + value, 0) / childXs.length;
    positions[nodeId] = { x, y: depth * rowGap };
    stack.delete(nodeId);
    return x;
  };

  roots.forEach((root) => assign(root.id, 0, new Set()));
  nodes.forEach((node) => {
    if (!node?.id || positions[node.id]) return;
    const x = leafIndex * columnGap;
    positions[node.id] = { x, y: 0 };
    leafIndex += 1;
  });

  Object.keys(positions).forEach((id) => {
    positions[id] = {
      x: positions[id].x + offset.x,
      y: positions[id].y + offset.y
    };
  });

  return positions;
};

const getBounds = (nodes) => {
  if (!nodes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodes.forEach((node) => {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + NODE_WIDTH);
    maxY = Math.max(maxY, node.y + NODE_HEIGHT);
  });
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return { minX, minY, maxX, maxY, width, height };
};

const clampScale = (value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

const GraphMinimapPanel = ({
  nodes = [],
  chainData = [],
  selectedNodeId,
  onSelect,
  className = ''
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [transform, setTransform] = React.useState({ x: 0, y: 0, scale: 1 });
  const [panelRect, setPanelRect] = React.useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = React.useState(false);
  const containerRef = React.useRef(null);
  const transformRef = React.useRef(transform);
  const panOriginRef = React.useRef({ x: 0, y: 0 });
  const panStartRef = React.useRef({ x: 0, y: 0 });
  const isPanningRef = React.useRef(false);
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

  const resultsById = React.useMemo(() => {
    const map = new Map();
    if (!Array.isArray(chainData)) return map;
    chainData.forEach((result) => {
      if (!result?.nodeId) return;
      map.set(result.nodeId, result);
    });
    return map;
  }, [chainData]);

  const layoutPositions = React.useMemo(() => buildMinimapLayout(nodes), [nodes]);

  const minimapNodes = React.useMemo(() => (
    nodes.map((node, index) => {
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
    const map = new Map();
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
    const lines = [];
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

  const bounds = React.useMemo(() => getBounds(minimapNodes), [minimapNodes]);

  const fitTransform = React.useMemo(() => {
    if (!bounds) return null;
    if (panelRect.width === 0 || panelRect.height === 0) return null;
    const availableWidth = Math.max(1, panelRect.width - FIT_PADDING * 2);
    const availableHeight = Math.max(1, panelRect.height - FIT_PADDING * 2);
    const scale = clampScale(Math.min(
      availableWidth / bounds.width,
      availableHeight / bounds.height
    ));
    const x = FIT_PADDING + (panelRect.width - bounds.width * scale) / 2 - bounds.minX * scale;
    const y = FIT_PADDING + (panelRect.height - bounds.height * scale) / 2 - bounds.minY * scale;
    return { x, y, scale };
  }, [bounds, panelRect]);

  React.useEffect(() => {
    if (!isOpen || !fitTransform) return;
    if (userAdjustedRef.current) return;
    setTransform(fitTransform);
  }, [isOpen, fitTransform]);

  const handleToggle = React.useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) userAdjustedRef.current = false;
      return next;
    });
  }, []);

  const handleWheel = React.useCallback((event) => {
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

  const handlePointerDown = React.useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    isPanningRef.current = true;
    setIsPanning(true);
    panOriginRef.current = { x: event.clientX, y: event.clientY };
    panStartRef.current = { x: transformRef.current.x, y: transformRef.current.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = React.useCallback((event) => {
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

  const stopPanning = React.useCallback((event) => {
    if (!isPanningRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    isPanningRef.current = false;
    setIsPanning(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (err) {
      // Ignore release errors.
    }
  }, []);

  const handleDoubleClick = React.useCallback((event) => {
    if (!fitTransform) return;
    event.preventDefault();
    event.stopPropagation();
    userAdjustedRef.current = false;
    setTransform(fitTransform);
  }, [fitTransform]);

  const handleNodeSelect = React.useCallback((event, nodeId) => {
    event.stopPropagation();
    onSelect?.(nodeId);
  }, [onSelect]);

  const buildEntangledGroupStyle = React.useCallback((color) => {
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
        <div className="rounded-lg border border-gray-200 bg-white/90 p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
          <div className="flex items-center justify-between pb-2">
            <div className="text-xs font-semibold text-gray-700 dark:text-slate-200">Minimap</div>
            <Button
              size="small"
              type="text"
              icon={<Minimize2 size={12} />}
              onClick={handleToggle}
              aria-label="Collapse minimap"
            />
          </div>
          <div
            ref={containerRef}
            className={`relative overflow-hidden rounded-md border border-gray-200/70 bg-white/70 dark:border-slate-700/70 dark:bg-slate-950/70 ${
              isPanning ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            style={{ width: PANEL_WIDTH, height: PANEL_HEIGHT }}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopPanning}
            onPointerLeave={stopPanning}
            onDoubleClick={handleDoubleClick}
          >
            {minimapNodes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 dark:text-slate-500">
                No nodes yet
              </div>
            ) : (
              <svg className="absolute inset-0" aria-hidden="true">
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
                      className="text-gray-300 dark:text-slate-600"
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
                          fill="currentColor"
                          className="text-white dark:text-slate-900"
                        />
                        <rect
                          x={node.x}
                          y={node.y}
                          width={NODE_WIDTH}
                          height={NODE_HEIGHT}
                          rx={6}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1}
                          className="text-gray-200 dark:text-slate-700"
                        />
                        {isSelected && (
                          <rect
                            x={node.x}
                            y={node.y}
                            width={NODE_WIDTH}
                            height={NODE_HEIGHT}
                            rx={6}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            className="text-blue-500"
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
                          className="text-gray-700 dark:text-slate-200"
                        >
                          {titleLabel}
                        </text>
                        <text
                          x={node.x + NODE_PADDING_X}
                          y={node.y + 24}
                          fontSize={8}
                          fill="currentColor"
                          className="text-gray-500 dark:text-slate-400"
                        >
                          {rowLabel}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}
          </div>
        </div>
      ) : (
        <Button
          size="small"
          icon={<Layout size={12} />}
          onClick={handleToggle}
          className="shadow-sm"
        >
          Minimap
        </Button>
      )}
    </div>
  );
};

export { GraphMinimapPanel };
