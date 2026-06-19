// @ts-nocheck
// src/utils/minimapLayout.js
// Shared helpers for minimap-style layouts.

export const MINIMAP_NODE_WIDTH = 110;
export const MINIMAP_NODE_HEIGHT = 32;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const buildMinimapLayout = (nodes = []) => {
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

  const columnGap = MINIMAP_NODE_WIDTH + 24;
  const rowGap = MINIMAP_NODE_HEIGHT + 44;
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

export const getMinimapBounds = (
  nodes = [],
  nodeWidth = MINIMAP_NODE_WIDTH,
  nodeHeight = MINIMAP_NODE_HEIGHT
) => {
  if (!nodes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodes.forEach((node) => {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + nodeWidth);
    maxY = Math.max(maxY, node.y + nodeHeight);
  });
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return { minX, minY, maxX, maxY, width, height };
};

export const getMinimapFitTransform = (
  bounds,
  width,
  height,
  options = {}
) => {
  if (!bounds || width <= 0 || height <= 0) return null;
  const padding = Number.isFinite(options.padding) ? options.padding : 12;
  const minScale = Number.isFinite(options.minScale) ? options.minScale : 0.05;
  const maxScale = Number.isFinite(options.maxScale) ? options.maxScale : 12;
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const scale = clamp(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
    minScale,
    maxScale
  );
  const x = padding + (width - bounds.width * scale) / 2 - bounds.minX * scale;
  const y = padding + (height - bounds.height * scale) / 2 - bounds.minY * scale;
  return { x, y, scale };
};