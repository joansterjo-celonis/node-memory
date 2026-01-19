// src/components/TreeNode.js
// Recursive node renderer for the branching analysis canvas.
import React from 'react';
import {
  Plus,
  Filter,
  BarChart3,
  Database,
  Trash2,
  ChevronRight,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Sigma,
  TableIcon,
  GitBranch,
  Hash,
  Gauge,
  LinkIcon,
  Minimize2,
  Share2
} from '../ui/icons';
import { getChildren, countDescendants, getNodeResult, calculateMetric, formatNumber } from '../utils/nodeUtils';
import VisxChart from '../ui/SimpleChart';
import WorldMapChart from '../ui/WorldMapChart';

const TABLE_ROW_HEIGHT = 24;
const TABLE_OVERSCAN = 6;
const BRANCH_CONNECTOR_HEIGHT = 16;
const BRANCH_CONNECTOR_STROKE = 2;
const KPI_LABELS = {
  count: 'Count',
  count_distinct: 'Distinct Count',
  sum: 'Sum',
  avg: 'Average',
  min: 'Min',
  max: 'Max'
};

const metricRequiresField = (fn) => ['sum', 'avg', 'min', 'max', 'count_distinct'].includes(fn);

const formatMetricLabel = (metric) => {
  if (metric.label) return metric.label;
  const fnLabel = KPI_LABELS[metric.fn] || metric.fn || 'Count';
  if (metric.fn === 'count') return fnLabel;
  if (!metric.field) return fnLabel;
  return `${fnLabel} of ${metric.field}`;
};

const AssistantPanel = React.memo(({ node, schema, onRun }) => {
  const [question, setQuestion] = React.useState(node.params.assistantQuestion || '');

  React.useEffect(() => {
    setQuestion(node.params.assistantQuestion || '');
  }, [node.id, node.params.assistantQuestion]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!onRun) return;
    const trimmed = question.trim();
    if (!trimmed) return;
    onRun(node.id, trimmed);
  };

  const planSteps = node.params.assistantPlan || [];

  return (
    <div className="bg-white border border-gray-200 rounded p-3 flex flex-col text-[11px] space-y-2">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          className="w-full min-h-[72px] p-2 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none resize-y"
          placeholder="Ask a question… e.g. 'Show total revenue by region'"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400">
            {schema.length === 0 ? 'No columns available yet.' : `${schema.length} columns available`}
          </span>
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!question.trim() || node.params.assistantStatus === 'loading'}
          >
            {node.params.assistantStatus === 'loading' ? 'Thinking…' : 'Build Nodes'}
          </button>
        </div>
      </form>
      {node.params.assistantStatus === 'loading' && (
        <div className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded p-2">
          Analyzing question and building a plan…
        </div>
      )}
      {node.params.assistantStatus === 'error' && (
        <div className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded p-2">
          {node.params.assistantError || 'I could not build a plan from that question.'}
        </div>
      )}
      {node.params.assistantStatus === 'success' && node.params.assistantSummary && (
        <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded p-2">
          {node.params.assistantSummary}
        </div>
      )}
      {node.params.assistantLlmError && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded p-2">
          LLM unavailable: {node.params.assistantLlmError}
        </div>
      )}
      {planSteps.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Planned Steps</div>
          <ul className="space-y-1">
            {planSteps.map((step, idx) => (
              <li key={`${step}-${idx}`} className="text-gray-600">• {step}</li>
            ))}
          </ul>
        </div>
      )}
      {node.params.assistantStatus !== 'success' && node.params.assistantStatus !== 'error' && (
        <div className="text-[11px] text-gray-400">
          Ask a question to build a filter, aggregate, and view automatically.
        </div>
      )}
    </div>
  );
});

const TablePreview = React.memo(({ data, columns, onCellClick, onSortChange, nodeId, sortBy, sortDirection }) => {
  const scrollRef = React.useRef(null);
  const rafRef = React.useRef(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(0);

  const normalizedSortDirection = sortDirection === 'asc' || sortDirection === 'desc' ? sortDirection : '';
  const sortedData = React.useMemo(() => {
    if (!sortBy || !normalizedSortDirection) return data;
    if (!columns.includes(sortBy)) return data;
    const withIndex = data.map((row, index) => ({ row, index }));
    const direction = normalizedSortDirection === 'asc' ? 1 : -1;
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
  }, [data, sortBy, normalizedSortDirection, columns]);

  const totalRows = sortedData.length;
  const maxScrollTop = Math.max(0, totalRows * TABLE_ROW_HEIGHT - viewportHeight);
  const effectiveScrollTop = Math.min(scrollTop, maxScrollTop);
  const startIndex = Math.max(0, Math.floor(effectiveScrollTop / TABLE_ROW_HEIGHT) - TABLE_OVERSCAN);
  const endIndex = Math.min(
    totalRows,
    Math.ceil((effectiveScrollTop + viewportHeight) / TABLE_ROW_HEIGHT) + TABLE_OVERSCAN
  );
  const visibleRows = sortedData.slice(startIndex, endIndex);
  const paddingTop = startIndex * TABLE_ROW_HEIGHT;
  const paddingBottom = Math.max(0, (totalRows - endIndex) * TABLE_ROW_HEIGHT);
  const columnCount = Math.max(1, columns.length);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateHeight = () => {
      const height = el.getBoundingClientRect().height;
      setViewportHeight(height);
    };
    updateHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }

    let frame = null;
    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateHeight);
    });

    // Observe the scroll container and the resizable node wrapper.
    observer.observe(el);
    const resizable = el.closest('[data-node-resize]');
    if (resizable) observer.observe(resizable);
    const parent = el.parentElement;
    if (parent) observer.observe(parent);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [data.length, columns.length]);

  React.useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const handleScroll = (e) => {
    const nextTop = e.currentTarget.scrollTop;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(nextTop);
    });
  };

  const handleHeaderSort = (column) => {
    if (!onSortChange) return;
    let nextSortBy = column;
    let nextDirection = 'asc';
    if (sortBy === column) {
      if (normalizedSortDirection === 'asc') {
        nextDirection = 'desc';
      } else if (normalizedSortDirection === 'desc') {
        nextSortBy = '';
        nextDirection = '';
      }
    }
    onSortChange(nodeId, nextSortBy, nextDirection);
  };

  if (columns.length === 0) {
    return (
      <div className="flex-1 min-h-0 px-2 pb-2 text-[10px] text-gray-400 flex items-center justify-center">
        No columns available for preview
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="overflow-auto flex-1 min-h-0 px-2 pb-2"
    >
      <table className="min-w-max w-full text-left border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b sticky top-0 shadow-sm">
            {columns.map(col => {
              const isSorted = sortBy === col && normalizedSortDirection;
              const sortIndicator = isSorted ? (normalizedSortDirection === 'asc' ? '^' : 'v') : '';
              const ariaSort = sortBy === col
                ? (normalizedSortDirection === 'asc' ? 'ascending' : 'descending')
                : 'none';
              return (
                <th
                  key={col}
                  role="button"
                  aria-sort={ariaSort}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHeaderSort(col);
                  }}
                  className="p-1 bg-gray-50 text-gray-600 font-medium whitespace-nowrap cursor-pointer hover:text-blue-600"
                  title={`Sort by ${col}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col}
                    {sortIndicator && <span className="text-[10px] text-gray-400">{sortIndicator}</span>}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td className="p-0 border-0" style={{ height: `${paddingTop}px` }} colSpan={columnCount}></td>
            </tr>
          )}
          {visibleRows.map((row, idx) => (
            <tr
              key={startIndex + idx}
              className="border-b hover:bg-blue-50 transition-colors"
              style={{ height: `${TABLE_ROW_HEIGHT}px` }}
            >
              {columns.map(col => (
                <td
                  key={col}
                  className="p-1 truncate cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors max-w-[100px]"
                  onClick={(e) => { e.stopPropagation(); onCellClick(row[col], col, nodeId); }}
                  title={`Filter by ${col} = ${row[col]}`}
                >
                  {row[col]}
                </td>
              ))}
            </tr>
          ))}
          {paddingBottom > 0 && (
            <tr aria-hidden="true">
              <td className="p-0 border-0" style={{ height: `${paddingBottom}px` }} colSpan={columnCount}></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});

const MultiBranchGroup = ({ childrenNodes, renderChild }) => {
  const containerRef = React.useRef(null);
  const childRefs = React.useRef([]);
  const rafRef = React.useRef(null);
  const [layout, setLayout] = React.useState({ parentX: 0, childXs: [] });

  const updateLayout = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width) return;
    const childXs = childRefs.current
      .map((el) => {
        if (!el) return null;
        const childRect = el.getBoundingClientRect();
        return childRect.left + childRect.width / 2 - rect.left;
      })
      .filter((val) => val !== null);
    setLayout({ parentX: rect.width / 2, childXs });
  }, []);

  const scheduleUpdate = React.useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      updateLayout();
    });
  }, [updateLayout]);

  React.useLayoutEffect(() => {
    scheduleUpdate();
  }, [childrenNodes.length, scheduleUpdate]);

  React.useEffect(() => {
    const container = containerRef.current;
    const hasResizeObserver = typeof ResizeObserver !== 'undefined';
    if (!container) return undefined;

    let observer = null;
    if (hasResizeObserver) {
      observer = new ResizeObserver(scheduleUpdate);
      observer.observe(container);
      childRefs.current.forEach((el) => {
        if (el) observer.observe(el);
      });
    } else {
      window.addEventListener('resize', scheduleUpdate);
    }

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [childrenNodes.length, scheduleUpdate]);

  childRefs.current = [];
  const hasLayout = layout.parentX > 0 && layout.childXs.length === childrenNodes.length;
  const midY = BRANCH_CONNECTOR_HEIGHT / 2;

  return (
    <div className="flex flex-col items-center">
      <div
        ref={containerRef}
        className="relative flex gap-8"
        style={{ paddingTop: BRANCH_CONNECTOR_HEIGHT }}
      >
        {hasLayout && (
          <svg
            className="absolute top-0 left-0 w-full text-gray-300 pointer-events-none"
            height={BRANCH_CONNECTOR_HEIGHT}
            aria-hidden="true"
          >
            <line
              x1={layout.parentX}
              y1="0"
              x2={layout.parentX}
              y2={midY}
              stroke="currentColor"
              strokeWidth={BRANCH_CONNECTOR_STROKE}
              strokeLinecap="round"
            />
            {layout.childXs.map((childX, idx) => (
              <polyline
                key={idx}
                points={`${layout.parentX},${midY} ${childX},${midY} ${childX},${BRANCH_CONNECTOR_HEIGHT}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={BRANCH_CONNECTOR_STROKE}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        )}
        {childrenNodes.map((child, idx) => (
          <div
            key={child.id}
            ref={(el) => {
              if (el) childRefs.current[idx] = el;
            }}
            className="flex flex-col items-center"
          >
            {renderChild(child)}
          </div>
        ))}
      </div>
    </div>
  );
};

const TreeNode = ({
  nodeId,
  nodes,
  selectedNodeId,
  chainData,
  onSelect,
  onAdd,
  onInsert,
  onRemove,
  onToggleExpand,
  onToggleChildren,
  onToggleBranch,
  onDrillDown,
  onTableCellClick,
  onTableSortChange,
  onAssistantRequest,
  showAddMenuForId,
  setShowAddMenuForId,
  showInsertMenuForId,
  setShowInsertMenuForId
}) => {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return null;

  const result = getNodeResult(chainData, nodeId);
  const children = getChildren(nodes, nodeId);
  const isActive = selectedNodeId === nodeId;
  const isExpanded = node.isExpanded !== false;
  const areChildrenCollapsed = node.areChildrenCollapsed === true;
  const isBranchCollapsed = node.isBranchCollapsed === true;
  const addMenuRef = React.useRef(null);
  const insertMenuRef = React.useRef(null);

  React.useEffect(() => {
    if (showAddMenuForId !== nodeId || !addMenuRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      addMenuRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [showAddMenuForId, nodeId]);

  React.useEffect(() => {
    if (showInsertMenuForId !== nodeId || !insertMenuRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      insertMenuRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [showInsertMenuForId, nodeId]);

  // Resolve icon by node type (and component subtype).
  let Icon = Database;
  if (node.type === 'FILTER') Icon = Filter;
  if (node.type === 'AGGREGATE') Icon = Sigma;
  if (node.type === 'JOIN') Icon = LinkIcon;
  if (node.type === 'COMPONENT') {
    if (node.params.subtype === 'TABLE') Icon = TableIcon;
    if (node.params.subtype === 'PIVOT') Icon = TableIcon;
    if (node.params.subtype === 'AI') Icon = Share2;
    if (node.params.subtype === 'CHART') Icon = BarChart3;
    if (node.params.subtype === 'KPI') Icon = Hash;
    if (node.params.subtype === 'GAUGE') Icon = Gauge;
  }

  // KPI/Gauge metric calculation (derived from node output).
  const gaugeMetricValue = (node.type === 'COMPONENT' && node.params.subtype === 'GAUGE' && result)
    ? calculateMetric(result.data, node.params.metricField, node.params.fn || 'count')
    : 0;

  // Columns for table preview (user-selected or default schema).
  const visibleColumns = (node.type === 'COMPONENT' && node.params.subtype === 'TABLE' && node.params.columns && node.params.columns.length > 0)
    ? node.params.columns
    : result ? result.schema : [];

  const kpiMetrics = React.useMemo(() => {
    if (!result || node.type !== 'COMPONENT' || node.params.subtype !== 'KPI') return [];
    const rawMetrics = (node.params.metrics && node.params.metrics.length > 0)
      ? node.params.metrics
      : [{ id: 'metric-default', label: '', fn: node.params.fn || 'count', field: node.params.metricField || '' }];
    return rawMetrics.map(metric => ({
      ...metric,
      value: calculateMetric(result.data, metric.field, metric.fn || 'count')
    }));
  }, [node.type, node.params.subtype, node.params.metrics, node.params.fn, node.params.metricField, result]);

  const pivotState = React.useMemo(() => {
    if (!result || node.type !== 'COMPONENT' || node.params.subtype !== 'PIVOT') return null;
    const rowField = node.params.pivotRow;
    const columnField = node.params.pivotColumn;
    const valueField = node.params.pivotValue;
    const fn = node.params.pivotFn || 'count';
    if (!rowField || !columnField) {
      return { error: 'Select row and column fields to render the pivot.' };
    }
    if (metricRequiresField(fn) && !valueField) {
      return { error: 'Select a value field for this aggregation.' };
    }

    const normalizeKey = (value) => (value === null || value === undefined || value === '' ? '(blank)' : String(value));
    const rowKeys = [];
    const colKeys = [];
    const rowIndex = new Map();
    const colIndex = new Map();
    const cells = new Map();
    const getCellKey = (rowKey, colKey) => `${rowKey}::${colKey}`;

    const ensureRow = (key) => {
      if (!rowIndex.has(key)) {
        rowIndex.set(key, rowKeys.length);
        rowKeys.push(key);
      }
    };

    const ensureCol = (key) => {
      if (!colIndex.has(key)) {
        colIndex.set(key, colKeys.length);
        colKeys.push(key);
      }
    };

    const ensureCell = (rowKey, colKey) => {
      const key = getCellKey(rowKey, colKey);
      if (!cells.has(key)) {
        cells.set(key, { count: 0, sum: 0, min: null, max: null, distinct: new Set() });
      }
      return cells.get(key);
    };

    result.data.forEach(row => {
      const rowKey = normalizeKey(row[rowField]);
      const colKey = normalizeKey(row[columnField]);
      ensureRow(rowKey);
      ensureCol(colKey);
      const cell = ensureCell(rowKey, colKey);
      cell.count += 1;
      if (valueField) {
        const rawValue = row[valueField];
        if (fn === 'count_distinct') cell.distinct.add(rawValue);
        const value = Number(rawValue);
        if (!Number.isNaN(value)) {
          cell.sum += value;
          cell.min = cell.min === null ? value : Math.min(cell.min, value);
          cell.max = cell.max === null ? value : Math.max(cell.max, value);
        }
      }
    });

    const matrix = rowKeys.map(rowKey => (
      colKeys.map(colKey => {
        const cell = cells.get(getCellKey(rowKey, colKey));
        if (!cell) return null;
        if (fn === 'count') return cell.count;
        if (fn === 'count_distinct') return cell.distinct.size;
        if (fn === 'sum') return cell.sum;
        if (fn === 'avg') return cell.count ? cell.sum / cell.count : 0;
        if (fn === 'min') return cell.min ?? 0;
        if (fn === 'max') return cell.max ?? 0;
        return 0;
      })
    ));

    return { rowKeys, colKeys, matrix, fn, rowField, columnField };
  }, [
    node.type,
    node.params.subtype,
    node.params.pivotRow,
    node.params.pivotColumn,
    node.params.pivotValue,
    node.params.pivotFn,
    result
  ]);

  const chartType = node.params.chartType || 'bar';
  const chartAggFn = node.params.chartAggFn || 'none';
  const chartYAxis = (chartType !== 'scatter' && chartType !== 'map' && chartAggFn === 'count' && !node.params.yAxis)
    ? 'Record Count'
    : node.params.yAxis;

  const chartData = React.useMemo(() => {
    if (!result || node.type !== 'COMPONENT' || node.params.subtype !== 'CHART') return [];
    if (chartType === 'map') return [];
    const xField = node.params.xAxis;
    const yField = chartYAxis;
    if (!xField || !yField) return result.data;
    const aggFn = chartAggFn;
    const shouldAggregate = chartType !== 'scatter' && aggFn !== 'none';
    if (!shouldAggregate) return result.data;

    const groups = new Map();
    result.data.forEach((row) => {
      const key = row?.[xField];
      if (key === null || key === undefined || key === '') return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    return Array.from(groups.entries()).map(([key, rows]) => ({
      [xField]: key,
      [yField]: calculateMetric(rows, yField, aggFn)
    }));
  }, [
    result,
    node.type,
    node.params.subtype,
    chartType,
    chartAggFn,
    chartYAxis,
    node.params.xAxis,
    node.params.yAxis
  ]);

  const mapData = React.useMemo(() => {
    if (!result || node.type !== 'COMPONENT' || node.params.subtype !== 'CHART' || chartType !== 'map') return [];
    const mapField = node.params.xAxis;
    if (!mapField) return [];
    const aggFn = chartAggFn === 'none' ? 'count' : chartAggFn;
    const groups = new Map();
    result.data.forEach((row) => {
      const key = row?.[mapField];
      if (key === null || key === undefined || key === '') return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return Array.from(groups.entries()).map(([key, rows]) => ({
      code: key,
      value: calculateMetric(rows, node.params.yAxis, aggFn)
    }));
  }, [
    result,
    node.type,
    node.params.subtype,
    chartType,
    chartAggFn,
    node.params.xAxis,
    node.params.yAxis
  ]);

  const hiddenCount = areChildrenCollapsed ? countDescendants(nodes, nodeId) : 0;

  // Compact collapsed branch representation.
  if (isBranchCollapsed) {
    return (
      <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
        <div className="relative z-10">
          <div
            onClick={(e) => { e.stopPropagation(); onToggleBranch(nodeId); }}
            className="bg-white border border-gray-200 shadow-sm rounded-full px-4 py-2 flex items-center gap-2 cursor-pointer hover:border-blue-400 hover:text-blue-600 transition-all"
            title="Expand Branch"
          >
            <GitBranch size={14} className="text-indigo-500" />
            <span className="text-xs font-medium text-gray-600 truncate max-w-[150px]">{node.title}</span>
            <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 rounded-full border border-gray-100 flex items-center gap-0.5">
              <Plus size={8} />
              {countDescendants(nodes, nodeId) + 1}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
      {/* NODE CARD */}
      <div className="relative group z-10">
        <div
          onClick={(e) => { e.stopPropagation(); onSelect(nodeId); }}
          className={`
            bg-white rounded-xl border-2 transition-all cursor-pointer overflow-hidden relative flex flex-col
            ${isActive ? 'border-blue-500 shadow-xl shadow-blue-500/10 ring-1 ring-blue-500 z-20' : 'border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md'}
          `}
          style={{
            width: 640,
            height: isExpanded ? (node.params.subtype === 'AI' ? 'auto' : 320) : 'auto',
            minWidth: 520,
            minHeight: isExpanded ? (node.params.subtype === 'AI' ? 0 : 180) : 0,
            resize: isExpanded && node.params.subtype !== 'AI' ? 'both' : 'none'
          }}
          data-node-resize="true"
        >
          {/* Header */}
          <div className="p-4 flex items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(nodeId); }}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5 transition-colors"
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
              <Icon size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-gray-900 text-sm truncate">{node.title}</h4>
                {node.branchName && (
                  <span className="bg-indigo-50 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-indigo-100 uppercase tracking-tight">
                    {node.branchName}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 truncate mt-0.5">
                {node.type === 'FILTER' && node.params.field ? `${node.params.field} ${node.params.operator} ${node.params.value}` :
                  node.type === 'AGGREGATE' ? `Group by ${node.params.groupBy}` :
                  node.type === 'JOIN' ? `with ${node.params.rightTable || '...'}` :
                  node.type === 'COMPONENT' ? (node.params.subtype === 'AI' ? 'AI Assistant' : `${node.params.subtype} View`) :
                  node.description || node.type}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onAdd('FILTER', nodeId); }}
                className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-indigo-600 transition-colors"
                title="Fork Branch"
              >
                <GitBranch size={16} />
              </button>

              {children.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleChildren(nodeId); }}
                  className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-indigo-600 transition-colors"
                  title={areChildrenCollapsed ? "Expand Children" : "Collapse Children"}
                >
                  {areChildrenCollapsed ? <ChevronsDown size={16} /> : <ChevronsUp size={16} />}
                </button>
              )}

              {node.parentId && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleBranch(nodeId); }}
                  className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-indigo-600 transition-colors"
                  title="Minimize Node"
                >
                  <Minimize2 size={16} />
                </button>
              )}

              {node.type !== 'SOURCE' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(nodeId); }}
                  className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Content Preview */}
          {isExpanded && result && (() => {
            const isTablePreview = node.params.subtype === 'TABLE' || (node.type !== 'COMPONENT' && node.type !== 'JOIN');
            const isPivotPreview = node.params.subtype === 'PIVOT';
            const isAssistantPreview = node.params.subtype === 'AI';
            const isChartPreview = node.params.subtype === 'CHART';
            const hasTableLikePreview = isTablePreview || isPivotPreview || isAssistantPreview;
            const contentPaddingClass = hasTableLikePreview ? 'p-0' : (isChartPreview ? 'p-1' : 'p-4');
            return (
            <div className={`border-t border-gray-100 bg-gray-50 ${contentPaddingClass} flex-1 min-h-0 animate-in slide-in-from-top-2 duration-200 flex flex-col overflow-hidden`}>
              {/* TABLE VIEW */}
              {isTablePreview && (
                <div className="h-full overflow-hidden text-[10px] bg-white border border-gray-200 rounded flex flex-col">
                  <div className="flex justify-between text-xs font-bold text-gray-500 mb-2 px-2 pt-2">
                    <span>Preview</span>
                    <span>{result.data.length} rows</span>
                  </div>
                  <TablePreview
                    data={result.data}
                    columns={visibleColumns}
                    onCellClick={onTableCellClick}
                    onSortChange={onTableSortChange}
                    nodeId={nodeId}
                    sortBy={node.params.tableSortBy}
                    sortDirection={node.params.tableSortDirection}
                  />
                </div>
              )}

              {/* AI ASSISTANT VIEW */}
              {isAssistantPreview && (
                <AssistantPanel
                  node={node}
                  schema={result.schema || []}
                  onRun={onAssistantRequest}
                />
              )}

              {/* PIVOT VIEW */}
              {isPivotPreview && (
                <div className="h-full overflow-hidden text-[10px] bg-white border border-gray-200 rounded flex flex-col">
                  <div className="flex justify-between text-xs font-bold text-gray-500 mb-2 px-2 pt-2">
                    <span>Pivot</span>
                    {pivotState && !pivotState.error && (
                      <span>{pivotState.rowKeys.length} rows × {pivotState.colKeys.length} cols</span>
                    )}
                  </div>
                  {!pivotState || pivotState.error ? (
                    <div className="flex-1 min-h-0 px-2 pb-2 text-[10px] text-gray-400 flex items-center justify-center">
                      {pivotState?.error || 'Configure row and column fields to render the pivot.'}
                    </div>
                  ) : (
                    <div className="overflow-auto flex-1 min-h-0 px-2 pb-2">
                      <table className="min-w-max w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b sticky top-0 shadow-sm">
                            <th className="p-1 bg-gray-50 text-gray-600 font-medium whitespace-nowrap">{pivotState.rowField}</th>
                            {pivotState.colKeys.map(col => (
                              <th key={col} className="p-1 bg-gray-50 text-gray-600 font-medium whitespace-nowrap">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pivotState.rowKeys.map((rowKey, rowIdx) => (
                            <tr key={rowKey} className="border-b">
                              <td className="p-1 text-gray-600 font-medium whitespace-nowrap">{rowKey}</td>
                              {pivotState.colKeys.map((colKey, colIdx) => {
                                const value = pivotState.matrix[rowIdx]?.[colIdx];
                                const formatted = typeof value === 'number' ? formatNumber(value) : (value ?? '-');
                                return (
                                  <td key={`${rowKey}-${colKey}`} className="p-1 text-gray-700 whitespace-nowrap">
                                    {formatted}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* JOIN VIEW */}
              {node.type === 'JOIN' && (
                <div className="h-full bg-slate-900 rounded p-3 text-[10px] font-mono text-slate-300 overflow-auto">
                  <div><span className="text-pink-400">SELECT</span> *</div>
                  <div><span className="text-pink-400">FROM</span> [PreviousNode]</div>
                  <div><span className="text-pink-400">{node.params.joinType || 'LEFT'} JOIN</span> {node.params.rightTable || '...'}</div>
                  <div><span className="text-pink-400">ON</span> {node.params.leftKey || '?'} = {node.params.rightKey || '?'}</div>
                  <div className="mt-2 pt-2 border-t border-slate-700 text-slate-500 italic">
                    Result: {result.data.length} rows merged
                  </div>
                </div>
              )}

              {/* CHART VIEW */}
              {node.params.subtype === 'CHART' && (chartType === 'map' ? (
                <WorldMapChart
                  data={mapData}
                  codeKey="code"
                  valueKey="value"
                  seriesColor={node.params.chartColor}
                  showTooltip={node.params.chartShowTooltip}
                  onSelect={(code) => onDrillDown({ activePayload: [{ payload: { __x: code } }] }, { xAxis: node.params.xAxis }, nodeId)}
                />
              ) : (
                <VisxChart
                  data={chartData}
                  xAxis={node.params.xAxis}
                  yAxis={chartYAxis}
                  type={chartType}
                  showGrid={node.params.chartShowGrid}
                  showPoints={node.params.chartShowPoints}
                  curveType={node.params.chartCurve}
                  stacked={node.params.chartStacked}
                  showTooltip={node.params.chartShowTooltip}
                  orientation={node.params.chartOrientation || 'vertical'}
                  barGap={node.params.chartBarGap}
                  seriesColor={node.params.chartColor}
                  onClick={(d) => onDrillDown(d, { xAxis: node.params.xAxis }, nodeId)}
                />
              ))}

              {/* KPI VIEW */}
              {node.params.subtype === 'KPI' && (
                <div className="h-full flex flex-col items-center justify-center bg-white border border-gray-200 rounded p-4 text-center">
                  {kpiMetrics.length === 0 ? (
                    <div className="text-xs text-gray-400">Configure KPI metrics to display.</div>
                  ) : kpiMetrics.length === 1 ? (
                    <>
                      <div className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">
                        {formatMetricLabel(kpiMetrics[0])}
                      </div>
                      <div className="text-4xl font-bold text-blue-600">
                        {typeof kpiMetrics[0].value === 'number' ? formatNumber(kpiMetrics[0].value) : kpiMetrics[0].value}
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 w-full">
                      {kpiMetrics.map((metric, idx) => (
                        <div key={metric.id || idx} className="bg-white border border-gray-200 rounded-lg p-3 text-left">
                          <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">
                            {formatMetricLabel(metric)}
                          </div>
                          <div className="text-lg font-bold text-blue-600">
                            {typeof metric.value === 'number' ? formatNumber(metric.value) : metric.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* GAUGE VIEW */}
              {node.params.subtype === 'GAUGE' && (
                <div className="h-full flex flex-col items-center justify-center bg-white border border-gray-200 rounded p-4">
                  <div className="w-full flex justify-between text-xs text-gray-500 mb-1">
                    <span>{node.params.fn}</span>
                    <span>Target: {node.params.target || 100}</span>
                  </div>
                  <div className="text-3xl font-bold text-gray-900 mb-3">
                    {typeof gaugeMetricValue === 'number' ? formatNumber(gaugeMetricValue) : gaugeMetricValue}
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min(100, (gaugeMetricValue / (node.params.target || 100)) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-400">
                    {Math.round((gaugeMetricValue / (node.params.target || 100)) * 100)}% of target
                  </div>
                </div>
              )}
            </div>
            );
          })()}
        </div>

        {/* ADD BUTTON - Only show if NO children */}
        {children.length === 0 && (
          <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 translate-y-full z-20 transition-all ${!isExpanded ? '-mt-4' : ''}`}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAddMenuForId(showAddMenuForId === nodeId ? null : nodeId);
              }}
              className="w-8 h-8 bg-gray-100 hover:bg-blue-600 hover:text-white rounded-full flex items-center justify-center border-2 border-white shadow-sm transition-colors text-gray-400"
            >
              <Plus size={16} strokeWidth={3} />
            </button>

            {showAddMenuForId === nodeId && (
              <div ref={addMenuRef} className="absolute top-10 left-1/2 -translate-x-1/2 z-50">
                <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-2 w-56 animate-in fade-in slide-in-from-top-1">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Data Ops</div>
                  <button onClick={() => onAdd('FILTER', nodeId)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 capitalize flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-400"></div> Filter
                  </button>
                  <button onClick={() => onAdd('AGGREGATE', nodeId)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 capitalize flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-400"></div> Aggregate
                  </button>
                  <button onClick={() => onAdd('JOIN', nodeId)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 capitalize flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-pink-400"></div> SQL Join
                  </button>

                  <div className="h-px bg-gray-100 my-1"></div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Components</div>

                  <button onClick={() => onAdd('COMPONENT', nodeId, 'TABLE')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 flex items-center gap-2 group/item">
                    <TableIcon size={14} className="text-gray-400 group-hover/item:text-blue-600" /> Table
                  </button>
                  <button onClick={() => onAdd('COMPONENT', nodeId, 'PIVOT')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 flex items-center gap-2 group/item">
                    <TableIcon size={14} className="text-gray-400 group-hover/item:text-blue-600" /> Pivot Table
                  </button>
                  <button onClick={() => onAdd('COMPONENT', nodeId, 'AI')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 flex items-center gap-2 group/item">
                    <Share2 size={14} className="text-gray-400 group-hover/item:text-blue-600" /> AI Assistant
                  </button>
                  <button onClick={() => onAdd('COMPONENT', nodeId, 'CHART')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 flex items-center gap-2 group/item">
                    <BarChart3 size={14} className="text-gray-400 group-hover/item:text-blue-600" /> Chart
                  </button>
                  <button onClick={() => onAdd('COMPONENT', nodeId, 'KPI')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 flex items-center gap-2 group/item">
                    <Hash size={14} className="text-gray-400 group-hover/item:text-blue-600" /> KPI
                  </button>
                  <button onClick={() => onAdd('COMPONENT', nodeId, 'GAUGE')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 flex items-center gap-2 group/item">
                    <Gauge size={14} className="text-gray-400 group-hover/item:text-blue-600" /> Gauge
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONNECTORS & CHILDREN */}
      {children.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="w-0.5 h-8 bg-gray-300 rounded-full relative group/line">
            {!areChildrenCollapsed && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/line:opacity-100 transition-opacity z-30">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowInsertMenuForId(showInsertMenuForId === nodeId ? null : nodeId);
                  }}
                  className="w-5 h-5 bg-slate-800 text-white rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                  title="Insert Step Here"
                >
                  <Plus size={12} strokeWidth={3} />
                </button>

                {showInsertMenuForId === nodeId && (
                  <div ref={insertMenuRef} className="absolute top-6 left-1/2 -translate-x-1/2 z-50">
                    <div className="bg-white rounded-lg shadow-xl border border-gray-100 p-2 w-48 animate-in fade-in slide-in-from-top-1">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Insert Step</div>
                      <button onClick={() => onInsert('FILTER', nodeId)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-xs text-gray-700 capitalize flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div> Filter
                      </button>
                      <button onClick={() => onInsert('AGGREGATE', nodeId)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-xs text-gray-700 capitalize flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div> Aggregate
                      </button>
                      <button onClick={() => onInsert('JOIN', nodeId)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-xs text-gray-700 capitalize flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-pink-400"></div> Join
                      </button>
                      <div className="h-px bg-gray-100 my-1"></div>
                      <button onClick={() => onInsert('COMPONENT', nodeId, 'TABLE')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-xs text-gray-700 flex items-center gap-2">
                        <TableIcon size={12} className="text-gray-400" /> Table
                      </button>
                      <button onClick={() => onInsert('COMPONENT', nodeId, 'PIVOT')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-xs text-gray-700 flex items-center gap-2">
                        <TableIcon size={12} className="text-gray-400" /> Pivot Table
                      </button>
                      <button onClick={() => onInsert('COMPONENT', nodeId, 'AI')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-xs text-gray-700 flex items-center gap-2">
                        <Share2 size={12} className="text-gray-400" /> AI Assistant
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {areChildrenCollapsed ? (
            <div className="flex flex-col items-center animate-in fade-in zoom-in-95">
              <div className="w-0.5 h-4 border-l-2 border-dashed border-gray-300"></div>
              {children.length > 1 ? (
                <div className="relative flex flex-col items-center">
                  <div className="absolute left-full top-0 ml-2 -mt-2 z-20">
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleChildren(nodeId); }}
                      className="flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors whitespace-nowrap shadow-sm"
                    >
                      <GitBranch size={10} />
                      +{children.length - 1} branches
                    </button>
                  </div>
                  <TreeNode
                    nodeId={children[0].id}
                    nodes={nodes}
                    selectedNodeId={selectedNodeId}
                    chainData={chainData}
                    onSelect={onSelect}
                    onAdd={onAdd}
                    onInsert={onInsert}
                    onRemove={onRemove}
                    onToggleExpand={onToggleExpand}
                    onToggleChildren={onToggleChildren}
                    onToggleBranch={onToggleBranch}
                    onDrillDown={onDrillDown}
                    onTableCellClick={onTableCellClick}
                    onTableSortChange={onTableSortChange}
                    onAssistantRequest={onAssistantRequest}
                    showAddMenuForId={showAddMenuForId}
                    setShowAddMenuForId={setShowAddMenuForId}
                    showInsertMenuForId={showInsertMenuForId}
                    setShowInsertMenuForId={setShowInsertMenuForId}
                  />
                </div>
              ) : (
                <div
                  onClick={() => onToggleChildren(nodeId)}
                  className="bg-gray-100 hover:bg-blue-50 text-gray-500 hover:text-blue-600 px-3 py-1 rounded-full text-xs font-medium border border-gray-200 cursor-pointer shadow-sm flex items-center gap-2"
                >
                  <span>+ {hiddenCount} steps</span>
                </div>
              )}
            </div>
          ) : (
            children.length === 1 ? (
              <TreeNode
                nodeId={children[0].id}
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                chainData={chainData}
                onSelect={onSelect}
                onAdd={onAdd}
                onInsert={onInsert}
                onRemove={onRemove}
                onToggleExpand={onToggleExpand}
                onToggleChildren={onToggleChildren}
                onToggleBranch={onToggleBranch}
                onDrillDown={onDrillDown}
                onTableCellClick={onTableCellClick}
                onTableSortChange={onTableSortChange}
                onAssistantRequest={onAssistantRequest}
                showAddMenuForId={showAddMenuForId}
                setShowAddMenuForId={setShowAddMenuForId}
                showInsertMenuForId={showInsertMenuForId}
                setShowInsertMenuForId={setShowInsertMenuForId}
              />
            ) : (
              <MultiBranchGroup
                childrenNodes={children}
                renderChild={(child) => (
                  <TreeNode
                    nodeId={child.id}
                    nodes={nodes}
                    selectedNodeId={selectedNodeId}
                    chainData={chainData}
                    onSelect={onSelect}
                    onAdd={onAdd}
                    onInsert={onInsert}
                    onRemove={onRemove}
                    onToggleExpand={onToggleExpand}
                    onToggleChildren={onToggleChildren}
                    onToggleBranch={onToggleBranch}
                    onDrillDown={onDrillDown}
                    onTableCellClick={onTableCellClick}
                    onTableSortChange={onTableSortChange}
                    onAssistantRequest={onAssistantRequest}
                    showAddMenuForId={showAddMenuForId}
                    setShowAddMenuForId={setShowAddMenuForId}
                    showInsertMenuForId={showInsertMenuForId}
                    setShowInsertMenuForId={setShowInsertMenuForId}
                  />
                )}
              />
            )
          )}
        </div>
      )}
    </div>
  );
};

export { TreeNode };
