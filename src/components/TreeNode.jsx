// src/components/TreeNode.js
// Recursive node renderer for the branching analysis canvas.
import React from 'react';
import { Alert, Button, Card, Dropdown, Empty, Input, Progress, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import {
  Plus,
  Filter,
  BarChart3,
  Database,
  Trash2,
  ChevronRight,
  ChevronDown,
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

const { Text, Title } = Typography;

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
    <Card size="small" title="AI Assistant">
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <form onSubmit={handleSubmit}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Input.TextArea
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder="Ask a question… e.g. 'Show total revenue by region'"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <Space align="center" className="w-full justify-between">
              <Text type="secondary" className="text-xs">
                {schema.length === 0 ? 'No columns available yet.' : `${schema.length} columns available`}
              </Text>
              <Button
                type="primary"
                htmlType="submit"
                size="small"
                disabled={!question.trim() || node.params.assistantStatus === 'loading'}
                loading={node.params.assistantStatus === 'loading'}
              >
                {node.params.assistantStatus === 'loading' ? 'Thinking…' : 'Build Nodes'}
              </Button>
            </Space>
          </Space>
        </form>
        {node.params.assistantStatus === 'loading' && (
          <Alert type="info" showIcon message="Analyzing question and building a plan…" />
        )}
        {node.params.assistantStatus === 'error' && (
          <Alert type="error" showIcon message={node.params.assistantError || 'I could not build a plan from that question.'} />
        )}
        {node.params.assistantStatus === 'success' && node.params.assistantSummary && (
          <Alert type="success" showIcon message={node.params.assistantSummary} />
        )}
        {node.params.assistantLlmError && (
          <Alert type="warning" showIcon message={`LLM unavailable: ${node.params.assistantLlmError}`} />
        )}
        {planSteps.length > 0 && (
          <Card size="small" title="Planned Steps">
            <Space direction="vertical" size="small">
              {planSteps.map((step, idx) => (
                <Text key={`${step}-${idx}`} type="secondary">
                  • {step}
                </Text>
              ))}
            </Space>
          </Card>
        )}
        {node.params.assistantStatus !== 'success' && node.params.assistantStatus !== 'error' && (
          <Text type="secondary" className="text-xs">
            Ask a question to build a filter, aggregate, and view automatically.
          </Text>
        )}
      </Space>
    </Card>
  );
});

const TablePreview = React.memo(({ data, columns, onCellClick, onSortChange, nodeId, sortBy, sortDirection }) => {
  const containerRef = React.useRef(null);
  const [tableHeight, setTableHeight] = React.useState(220);
  const normalizedSortDirection = sortDirection === 'asc' || sortDirection === 'desc' ? sortDirection : '';

  const compareValues = React.useCallback((aRaw, bRaw) => {
    if (aRaw == null && bRaw == null) return 0;
    if (aRaw == null) return 1;
    if (bRaw == null) return -1;
    const aNum = Number(aRaw);
    const bNum = Number(bRaw);
    const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);
    if (bothNumeric) {
      if (aNum === bNum) return 0;
      return aNum - bNum;
    }
    const aText = String(aRaw);
    const bText = String(bRaw);
    return aText.localeCompare(bText, undefined, { numeric: true, sensitivity: 'base' });
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const updateHeight = () => {
      const rect = el.getBoundingClientRect();
      if (rect.height) setTableHeight(rect.height);
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
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [data.length, columns.length]);

  const sortedData = React.useMemo(() => {
    if (!sortBy || !normalizedSortDirection) return data;
    if (!columns.includes(sortBy)) return data;
    const withIndex = data.map((row, index) => ({ row, index }));
    const direction = normalizedSortDirection === 'asc' ? 1 : -1;
    withIndex.sort((a, b) => {
      const result = compareValues(a.row?.[sortBy], b.row?.[sortBy]);
      if (result === 0) return a.index - b.index;
      return result * direction;
    });
    return withIndex.map(item => item.row);
  }, [data, sortBy, normalizedSortDirection, columns, compareValues]);

  if (columns.length === 0) {
    return <Empty description="No columns available for preview" />;
  }

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

  const tableColumns = columns.map((col) => {
    const isSorted = sortBy === col && normalizedSortDirection;
    const sortIndicator = isSorted ? (normalizedSortDirection === 'asc' ? '^' : 'v') : '';
    return {
      title: (
        <span className="inline-flex items-center gap-1">
          {col}
          {sortIndicator && <span className="text-[10px] text-gray-400">{sortIndicator}</span>}
        </span>
      ),
      dataIndex: col,
      key: col,
      ellipsis: true,
      onHeaderCell: () => ({
        onClick: (e) => {
          e.stopPropagation();
          handleHeaderSort(col);
        },
        className: 'cursor-pointer select-none hover:text-blue-600'
      }),
      onCell: (record) => ({
        onClick: (e) => {
          e.stopPropagation();
          if (onCellClick) onCellClick(record[col], col, nodeId);
        },
        className: 'cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition-colors'
      })
    };
  });

  const dataSource = sortedData.map((row, idx) => ({ __key: idx, ...row }));
  const bodyHeight = Math.max(140, tableHeight - 38);

  return (
    <div ref={containerRef} className="h-full">
      <Table
        size="small"
        sticky
        className="rounded-none"
        style={{ borderRadius: 0 }}
        rowKey="__key"
        pagination={false}
        columns={tableColumns}
        dataSource={dataSource}
        scroll={{ y: bodyHeight, x: 'max-content' }}
      />
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


  const handleAddMenuClick = ({ key }) => {
    if (!onAdd) return;
    if (key.startsWith('COMPONENT:')) {
      onAdd('COMPONENT', nodeId, key.split(':')[1]);
    } else {
      onAdd(key, nodeId);
    }
    setShowAddMenuForId(null);
  };

  const handleInsertMenuClick = ({ key }) => {
    if (!onInsert) return;
    if (key.startsWith('COMPONENT:')) {
      onInsert('COMPONENT', nodeId, key.split(':')[1]);
    } else {
      onInsert(key, nodeId);
    }
    setShowInsertMenuForId(null);
  };

  const addMenuItems = [
    {
      type: 'group',
      label: 'Data Ops',
      children: [
        { key: 'FILTER', label: 'Filter', icon: <span className="w-2 h-2 rounded-full bg-orange-400" /> },
        { key: 'AGGREGATE', label: 'Aggregate', icon: <span className="w-2 h-2 rounded-full bg-purple-400" /> },
        { key: 'JOIN', label: 'SQL Join', icon: <span className="w-2 h-2 rounded-full bg-pink-400" /> }
      ]
    },
    { type: 'divider' },
    {
      type: 'group',
      label: 'Components',
      children: [
        { key: 'COMPONENT:TABLE', label: 'Table', icon: <TableIcon size={14} /> },
        { key: 'COMPONENT:PIVOT', label: 'Pivot Table', icon: <TableIcon size={14} /> },
        { key: 'COMPONENT:AI', label: 'AI Assistant', icon: <Share2 size={14} /> },
        { key: 'COMPONENT:CHART', label: 'Chart', icon: <BarChart3 size={14} /> },
        { key: 'COMPONENT:KPI', label: 'KPI', icon: <Hash size={14} /> },
        { key: 'COMPONENT:GAUGE', label: 'Gauge', icon: <Gauge size={14} /> }
      ]
    }
  ];

  const insertMenuItems = [
    {
      type: 'group',
      label: 'Insert Step',
      children: [
        { key: 'FILTER', label: 'Filter', icon: <span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> },
        { key: 'AGGREGATE', label: 'Aggregate', icon: <span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> },
        { key: 'JOIN', label: 'Join', icon: <span className="w-1.5 h-1.5 rounded-full bg-pink-400" /> },
        { type: 'divider' },
        { key: 'COMPONENT:TABLE', label: 'Table', icon: <TableIcon size={12} /> },
        { key: 'COMPONENT:PIVOT', label: 'Pivot Table', icon: <TableIcon size={12} /> },
        { key: 'COMPONENT:AI', label: 'AI Assistant', icon: <Share2 size={12} /> }
      ]
    }
  ];

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

  const pivotTableRef = React.useRef(null);
  const [pivotTableHeight, setPivotTableHeight] = React.useState(220);

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

  React.useEffect(() => {
    const el = pivotTableRef.current;
    if (!el) return undefined;

    const updateHeight = () => {
      const rect = el.getBoundingClientRect();
      if (rect.height) setPivotTableHeight(rect.height);
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
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pivotState?.rowKeys?.length, pivotState?.colKeys?.length]);

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

  // Compact collapsed branch representation.
  if (isBranchCollapsed) {
    return (
      <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
        <div className="relative z-10">
          <Button
            onClick={(e) => { e.stopPropagation(); onToggleBranch(nodeId); }}
            icon={<GitBranch size={14} />}
            shape="round"
          >
            <Space size="small">
              <Text className="text-xs">{node.title}</Text>
              <Tag>
                <Space size={2}>
                  <Plus size={8} />
                  {countDescendants(nodes, nodeId) + 1}
                </Space>
              </Tag>
            </Space>
          </Button>
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
            <Button
              type="text"
              size="small"
              icon={isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              onClick={(e) => { e.stopPropagation(); onToggleExpand(nodeId); }}
            />
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
              <Icon size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <Space size="small" align="center">
                <Text strong className="truncate">{node.title}</Text>
                {node.branchName && (
                  <Tag color="geekblue" className="uppercase text-[9px] font-bold">
                    {node.branchName}
                  </Tag>
                )}
              </Space>
              <Text type="secondary" className="text-xs truncate block mt-0.5">
                {node.type === 'FILTER' && node.params.field ? `${node.params.field} ${node.params.operator} ${node.params.value}` :
                  node.type === 'AGGREGATE' ? `Group by ${node.params.groupBy}` :
                  node.type === 'JOIN' ? `with ${node.params.rightTable || '...'}` :
                  node.type === 'COMPONENT' ? (node.params.subtype === 'AI' ? 'AI Assistant' : `${node.params.subtype} View`) :
                  node.description || node.type}
              </Text>
            </div>
            <Space size="small">
              <Tooltip title="Fork Branch">
                <Button
                  type="text"
                  icon={<GitBranch size={16} />}
                  onClick={(e) => { e.stopPropagation(); onAdd('FILTER', nodeId); }}
                />
              </Tooltip>

              {node.parentId && (
                <Tooltip title="Minimize Node">
                  <Button
                    type="text"
                    icon={<Minimize2 size={16} />}
                    onClick={(e) => { e.stopPropagation(); onToggleBranch(nodeId); }}
                  />
                </Tooltip>
              )}

              {node.type !== 'SOURCE' && (
                <Button
                  type="text"
                  danger
                  icon={<Trash2 size={16} />}
                  onClick={(e) => { e.stopPropagation(); onRemove(nodeId); }}
                />
              )}
            </Space>
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
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between text-xs font-medium text-gray-500 px-2 pt-2">
                    <span>Preview</span>
                    <span>{result.data.length} rows</span>
                  </div>
                  <div className="flex-1 min-h-0 px-2 pb-2">
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
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between text-xs font-medium text-gray-500 px-2 pt-2">
                    <span>Pivot</span>
                    {pivotState && !pivotState.error && (
                      <span>{pivotState.rowKeys.length} rows × {pivotState.colKeys.length} cols</span>
                    )}
                  </div>
                  <div ref={pivotTableRef} className="flex-1 min-h-0 px-2 pb-2">
                    {!pivotState || pivotState.error ? (
                      <Empty description={pivotState?.error || 'Configure row and column fields to render the pivot.'} />
                    ) : (
                      (() => {
                        const pivotColumns = [
                          { title: pivotState.rowField, dataIndex: 'rowKey', key: 'rowKey', fixed: 'left' },
                          ...pivotState.colKeys.map((col) => ({ title: col, dataIndex: col, key: col }))
                        ];
                        const dataSource = pivotState.rowKeys.map((rowKey, rowIdx) => {
                          const row = { rowKey };
                          pivotState.colKeys.forEach((colKey, colIdx) => {
                            const value = pivotState.matrix[rowIdx]?.[colIdx];
                            row[colKey] = typeof value === 'number' ? formatNumber(value) : (value ?? '-');
                          });
                          return row;
                        });
                        return (
                          <Table
                            size="small"
                            className="rounded-none"
                            style={{ borderRadius: 0 }}
                            pagination={false}
                            columns={pivotColumns}
                            dataSource={dataSource}
                            scroll={{ x: 'max-content', y: Math.max(140, pivotTableHeight - 38) }}
                            rowKey="rowKey"
                          />
                        );
                      })()
                    )}
                  </div>
                </div>
              )}

              {/* JOIN VIEW */}
              {node.type === 'JOIN' && (
                <Card size="small" styles={{ body: { padding: 12 } }}>
                  <div className="bg-slate-900 rounded p-3 text-[10px] font-mono text-slate-300 overflow-auto">
                    <div><span className="text-pink-400">SELECT</span> *</div>
                    <div><span className="text-pink-400">FROM</span> [PreviousNode]</div>
                    <div><span className="text-pink-400">{node.params.joinType || 'LEFT'} JOIN</span> {node.params.rightTable || '...'}</div>
                    <div><span className="text-pink-400">ON</span> {node.params.leftKey || '?'} = {node.params.rightKey || '?'}</div>
                    <div className="mt-2 pt-2 border-t border-slate-700 text-slate-500 italic">
                      Result: {result.data.length} rows merged
                    </div>
                  </div>
                </Card>
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
                <Card size="small" className="h-full">
                  {kpiMetrics.length === 0 ? (
                    <Empty description="Configure KPI metrics to display." />
                  ) : kpiMetrics.length === 1 ? (
                    <Space direction="vertical" size="small" style={{ width: '100%', textAlign: 'center' }}>
                      <Text type="secondary" className="uppercase text-xs">
                        {formatMetricLabel(kpiMetrics[0])}
                      </Text>
                      <Title level={2} style={{ margin: 0 }}>
                        {typeof kpiMetrics[0].value === 'number' ? formatNumber(kpiMetrics[0].value) : kpiMetrics[0].value}
                      </Title>
                    </Space>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 w-full">
                      {kpiMetrics.map((metric, idx) => (
                        <Card key={metric.id || idx} size="small">
                          <Statistic
                            title={formatMetricLabel(metric)}
                            value={typeof metric.value === 'number' ? formatNumber(metric.value) : metric.value}
                          />
                        </Card>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* GAUGE VIEW */}
              {node.params.subtype === 'GAUGE' && (
                <Card size="small" className="h-full">
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Space className="w-full justify-between">
                      <Text type="secondary">{node.params.fn}</Text>
                      <Text type="secondary">Target: {node.params.target || 100}</Text>
                    </Space>
                    <Title level={3} style={{ margin: 0 }}>
                      {typeof gaugeMetricValue === 'number' ? formatNumber(gaugeMetricValue) : gaugeMetricValue}
                    </Title>
                    <Progress
                      percent={Math.min(100, Math.round((gaugeMetricValue / (node.params.target || 100)) * 100))}
                      showInfo={false}
                    />
                    <Text type="secondary" className="text-xs">
                      {Math.round((gaugeMetricValue / (node.params.target || 100)) * 100)}% of target
                    </Text>
                  </Space>
                </Card>
              )}
            </div>
            );
          })()}
        </div>

        {/* ADD BUTTON - Only show if NO children */}
        {children.length === 0 && (
          <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 translate-y-full z-20 transition-all ${!isExpanded ? '-mt-4' : ''}`}>
            <div ref={addMenuRef}>
              <Dropdown
                menu={{ items: addMenuItems, onClick: handleAddMenuClick }}
                trigger={['click']}
                open={showAddMenuForId === nodeId}
                onOpenChange={(open) => setShowAddMenuForId(open ? nodeId : null)}
              >
                <Button
                  shape="circle"
                  icon={<Plus size={16} strokeWidth={3} />}
                  onClick={(e) => e.stopPropagation()}
                />
              </Dropdown>
            </div>
          </div>
        )}
      </div>

      {/* CONNECTORS & CHILDREN */}
      {children.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="w-0.5 h-8 bg-gray-300 rounded-full relative group/line">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/line:opacity-100 transition-opacity z-30">
              <div ref={insertMenuRef}>
                <Dropdown
                  menu={{ items: insertMenuItems, onClick: handleInsertMenuClick }}
                  trigger={['click']}
                  open={showInsertMenuForId === nodeId}
                  onOpenChange={(open) => setShowInsertMenuForId(open ? nodeId : null)}
                >
                  <Button
                    shape="circle"
                    size="small"
                    icon={<Plus size={12} strokeWidth={3} />}
                    title="Insert Step Here"
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              </div>
            </div>
          </div>

          {children.length === 1 ? (
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
          )}
        </div>
      )}
    </div>
  );
};

export { TreeNode };
