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
  if (!field) return 0;
  const values = data.map(d => Number(d[field]) || 0);
  if (fn === 'sum') return values.reduce((a, b) => a + b, 0);
  if (fn === 'avg') return values.reduce((a, b) => a + b, 0) / (values.length || 1);
  return 0;
};

window.NodeUtils = {
  NodeType,
  ComponentType,
  getChildren,
  countDescendants,
  getNodeResult,
  getCalculationOrder,
  formatNumber,
  calculateMetric
};
