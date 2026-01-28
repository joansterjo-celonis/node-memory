// src/utils/nodeUtils.js
// Node types, graph traversal helpers, and aggregation utilities.

const NodeType = {
  SOURCE: 'SOURCE',
  FILTER: 'FILTER',
  AGGREGATE: 'AGGREGATE',
  SORT: 'SORT',
  LIMIT: 'LIMIT',
  JOIN: 'JOIN',
  COMPONENT: 'COMPONENT'
};

const ComponentType = {
  TABLE: 'TABLE',
  PIVOT: 'PIVOT',
  AI: 'AI',
  CHART: 'CHART',
  KPI: 'KPI',
  GAUGE: 'GAUGE'
};

const getChildren = (nodes, parentId) => nodes.filter(n => n.parentId === parentId);

const countDescendants = (nodes, parentId) => {
  let count = 0;
  const children = getChildren(nodes, parentId);
  count += children.length;
  children.forEach(child => { count += countDescendants(nodes, child.id); });
  return count;
};

const buildLeafCountMap = (nodes, options = {}) => {
  if (!Array.isArray(nodes) || nodes.length === 0) return new Map();
  const { treatCollapsedAsLeaf = true } = options;
  const childrenByParent = new Map();
  const nodesById = new Map();

  nodes.forEach((node) => {
    if (!node || !node.id) return;
    nodesById.set(node.id, node);
    const list = childrenByParent.get(node.parentId) || [];
    list.push(node);
    childrenByParent.set(node.parentId, list);
  });

  const leafCountById = new Map();
  const resolveLeafCount = (nodeId) => {
    if (leafCountById.has(nodeId)) return leafCountById.get(nodeId);
    const node = nodesById.get(nodeId);
    if (!node) {
      leafCountById.set(nodeId, 1);
      return 1;
    }
    if (treatCollapsedAsLeaf && node.isBranchCollapsed) {
      leafCountById.set(nodeId, 1);
      return 1;
    }
    const children = childrenByParent.get(nodeId) || [];
    if (children.length === 0) {
      leafCountById.set(nodeId, 1);
      return 1;
    }
    const total = children.reduce((sum, child) => sum + resolveLeafCount(child.id), 0);
    const resolved = total > 0 ? total : 1;
    leafCountById.set(nodeId, resolved);
    return resolved;
  };

  nodes.forEach((node) => resolveLeafCount(node.id));
  return leafCountById;
};

const getNodeResult = (chainData, id) => chainData.find(r => r.nodeId === id);

const getCalculationOrder = (nodes) => {
  // Breadth-first ensures parent nodes are processed before children.
  const order = [];
  const queue = nodes.filter(n => n.parentId === null);
  while (queue.length > 0) {
    const current = queue.shift();
    order.push(current);
    const children = getChildren(nodes, current.id);
    queue.push(...children);
  }
  return order;
};

const formatNumber = (num) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(num);

const calculateMetric = (data, field, fn) => {
  if (fn === 'count') return data.length;
  if (fn === 'count_distinct') {
    if (!field) return 0;
    const set = new Set();
    data.forEach(row => {
      const value = row[field];
      if (value === null || value === undefined || value === '') return;
      set.add(value);
    });
    return set.size;
  }
  if (!field) return 0;
  const values = data
    .map(d => Number(d[field]))
    .filter(v => !Number.isNaN(v));
  if (values.length === 0) return 0;
  if (fn === 'sum') return values.reduce((a, b) => a + b, 0);
  if (fn === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
  if (fn === 'min') return Math.min(...values);
  if (fn === 'max') return Math.max(...values);
  return 0;
};

export {
  NodeType,
  ComponentType,
  getChildren,
  countDescendants,
  buildLeafCountMap,
  getNodeResult,
  getCalculationOrder,
  formatNumber,
  calculateMetric
};
