// src/components/TreeNode.js
// Recursive node renderer for the branching analysis canvas.
import React from 'react';
import { Alert, Button, Card, Dropdown, Empty, Input, Popover, Progress, Radio, Select, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
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
import { getChildren, countDescendants, getNodeResult, formatNumber } from '../utils/nodeUtils';
import { normalizeFilters, resolveFilterMode } from '../utils/filterUtils';
import VisxChart from '../ui/SimpleChart';
import WorldMapChart from '../ui/WorldMapChart';

const BRANCH_CONNECTOR_HEIGHT = 16;
const BRANCH_CONNECTOR_STROKE = 2;
const FREE_LAYOUT_MIN_SCALE = 0.4;
const FREE_LAYOUT_MAX_SCALE = 2.2;
const FREE_LAYOUT_ZOOM_STEP = 1.15;
const KPI_LABELS = {
  count: 'Count',
  count_distinct: 'Distinct Count',
  sum: 'Sum',
  avg: 'Average',
  min: 'Min',
  max: 'Max'
};
const FILTER_OPERATOR_LABELS = {
  equals: '=',
  not_equals: '!=',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  in: 'in',
  contains: 'contains'
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

const formatFilterLabel = (filter) => {
  const field = filter.field || '';
  const operator = FILTER_OPERATOR_LABELS[filter.operator] || filter.operator || '=';
  const value = filter.value ?? '';
  if (!field && (value === '' || value === null || value === undefined)) {
    return 'New filter';
  }
  const resolvedField = field || 'Filter';
  if (value === '' || value === null || value === undefined) {
    return `${resolvedField} ${operator}`.trim();
  }
  return `${resolvedField} ${operator} ${value}`.trim();
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
      <Space orientation="vertical" size="small" style={{ width: '100%' }}>
        <form onSubmit={handleSubmit}>
          <Space orientation="vertical" size="small" style={{ width: '100%' }}>
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
            <Space orientation="vertical" size="small">
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

const TablePreview = React.memo(({
  rowCount = 0,
  columns = [],
  getRowAt,
  sampleRows = [],
  onCellClick,
  enableInlineFilterMenu = false,
  onFilterCellAction,
  onSortChange,
  nodeId,
  sortBy,
  sortDirection,
  tableDensity = 'comfortable'
}) => {
  const containerRef = React.useRef(null);
  const rowCacheRef = React.useRef(new Map());
  const [tableHeight, setTableHeight] = React.useState(220);
  const [headerHeight, setHeaderHeight] = React.useState(38);
  const [cellAction, setCellAction] = React.useState(null);
  const normalizedSortDirection = sortDirection === 'asc' || sortDirection === 'desc' ? sortDirection : '';
  const densityClassName = tableDensity === 'dense' ? 'table-density-dense' : 'table-density-comfortable';

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const updateLayoutMetrics = () => {
      const rect = el.getBoundingClientRect();
      if (rect.height) setTableHeight(rect.height);
      const header = el.querySelector('.ant-table-header') || el.querySelector('.ant-table-thead');
      if (header) {
        const nextHeaderHeight = Math.ceil(header.getBoundingClientRect().height);
        setHeaderHeight((prev) => (prev === nextHeaderHeight ? prev : nextHeaderHeight));
      }
    };
    updateLayoutMetrics();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateLayoutMetrics);
      return () => window.removeEventListener('resize', updateLayoutMetrics);
    }

    let frame = null;
    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateLayoutMetrics);
    });
    observer.observe(el);
    const header = el.querySelector('.ant-table-header') || el.querySelector('.ant-table-thead');
    if (header) observer.observe(header);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [rowCount, columns.length, tableDensity]);

  React.useEffect(() => {
    rowCacheRef.current.clear();
  }, [rowCount, sortBy, normalizedSortDirection]);

  React.useEffect(() => {
    setCellAction(null);
  }, [nodeId, enableInlineFilterMenu]);

  const dataSource = React.useMemo(
    () => (rowCount > 0 ? Array.from({ length: rowCount }, (_, idx) => idx) : []),
    [rowCount]
  );
  const bodyHeight = Math.max(140, tableHeight - headerHeight);
  const widthSampleRows = React.useMemo(
    () => (Array.isArray(sampleRows) ? sampleRows.slice(0, 40) : []),
    [sampleRows]
  );
  const estimatedColumnWidths = React.useMemo(() => {
    const widths = {};
    const MIN_COL_WIDTH = 120;
    const MAX_COL_WIDTH = 260;
    const CHAR_WIDTH = 7;
    const BASE_PADDING = 32;
    columns.forEach((col) => {
      let maxLen = String(col).length;
      widthSampleRows.forEach((row) => {
        const value = row?.[col];
        if (value === null || value === undefined) return;
        const text = String(value);
        if (!text) return;
        const len = Math.min(text.length, 32);
        if (len > maxLen) maxLen = len;
      });
      widths[col] = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, BASE_PADDING + maxLen * CHAR_WIDTH));
    });
    return widths;
  }, [columns, widthSampleRows]);
  const scrollX = Math.max(
    360,
    columns.reduce((sum, col) => sum + (estimatedColumnWidths[col] || 120), 0)
  );

  const cellActionContent = cellAction?.payload ? (
    <Space direction="vertical" size="small">
      <Text type="secondary" className="text-xs">
        Apply filter
      </Text>
      <Tag color="orange">
        {cellAction.payload.field} = {String(cellAction.payload.value ?? '')}
      </Tag>
      <Space size="small">
        <Button
          size="small"
          onClick={() => {
            onFilterCellAction?.('add-to-node', cellAction.payload);
            setCellAction(null);
          }}
        >
          Add to this node
        </Button>
        <Button
          size="small"
          type="primary"
          onClick={() => {
            onFilterCellAction?.('create-node', cellAction.payload);
            setCellAction(null);
          }}
        >
          New filter node
        </Button>
      </Space>
    </Space>
  ) : null;

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

  const resolveRow = (index) => {
    const cache = rowCacheRef.current;
    if (cache.has(index)) return cache.get(index);
    const row = getRowAt ? getRowAt(index, sortBy, normalizedSortDirection) : null;
    cache.set(index, row);
    return row;
  };

  const tableColumns = columns.map((col) => {
    const isSorted = sortBy === col && normalizedSortDirection;
    const sortIndicator = isSorted ? (normalizedSortDirection === 'asc' ? '^' : 'v') : '';
    return {
      title: (
        <span className="inline-flex items-center gap-1">
          {col}
          {sortIndicator && <span className="text-[10px] text-gray-400 dark:text-slate-500">{sortIndicator}</span>}
        </span>
      ),
      dataIndex: col,
      key: col,
      width: estimatedColumnWidths[col] || 120,
      ellipsis: true,
      render: (_value, recordIndex) => {
        const row = resolveRow(recordIndex);
        const displayValue = row?.[col] ?? '';
        if (!enableInlineFilterMenu) return displayValue;
        const cellKey = `${recordIndex}-${col}`;
        const isOpen = cellAction?.key === cellKey;
        return (
          <Popover
            open={isOpen}
            content={cellActionContent}
            trigger="click"
            placement="right"
            onOpenChange={(open) => {
              if (!open) setCellAction(null);
            }}
          >
            <span className="block truncate">{displayValue}</span>
          </Popover>
        );
      },
      onHeaderCell: () => ({
        onClick: (e) => {
          e.stopPropagation();
          handleHeaderSort(col);
        },
        className: 'cursor-pointer select-none hover:text-blue-600'
      }),
      onCell: (recordIndex) => ({
        onClick: (e) => {
          e.stopPropagation();
          const row = resolveRow(recordIndex);
          const value = row?.[col];
          if (enableInlineFilterMenu && onFilterCellAction) {
            setCellAction({
              key: `${recordIndex}-${col}`,
              payload: { nodeId, field: col, value }
            });
            return;
          }
          if (!onCellClick) return;
          onCellClick(value, col, nodeId);
        },
        className: 'cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition-colors'
      })
    };
  });

  return (
    <div ref={containerRef} className="h-full">
      <Table
        size="small"
        sticky
        virtual
        className={`rounded-none ${densityClassName}`}
        style={{ borderRadius: 0 }}
        rowKey={(record) => record}
        pagination={false}
        columns={tableColumns}
        dataSource={dataSource}
        scroll={{ y: bodyHeight, x: scrollX }}
      />
    </div>
  );
});

const MultiBranchGroup = ({ childrenNodes, renderChild }) => {
  const containerRef = React.useRef(null);
  const childRefs = React.useRef([]);
  const rafRef = React.useRef(null);
  const [layout, setLayout] = React.useState({ parentX: 0, childXs: [], pairRects: [] });

  const updateLayout = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width) return;
    const childRects = childRefs.current.map((el) => (el ? el.getBoundingClientRect() : null));
    const childXs = childRects
      .map((childRect) => {
        if (!childRect) return null;
        return childRect.left + childRect.width / 2 - rect.left;
      })
      .filter((val) => val !== null);

    const indexById = new Map(childrenNodes.map((child, idx) => [child.nodeId, idx]));
    const pairRects = [];
    childrenNodes.forEach((child, idx) => {
      if (!child.entangledPeerId) return;
      const peerIndex = indexById.get(child.entangledPeerId);
      if (peerIndex === undefined || peerIndex <= idx) return;
      const rectA = childRects[idx];
      const rectB = childRects[peerIndex];
      if (!rectA || !rectB) return;
      const padding = 8;
      const left = Math.min(rectA.left, rectB.left) - rect.left - padding;
      const right = Math.max(rectA.right, rectB.right) - rect.left + padding;
      const top = Math.min(rectA.top, rectB.top) - rect.top - padding;
      const bottom = Math.max(rectA.bottom, rectB.bottom) - rect.top + padding;
      pairRects.push({
        key: `${child.nodeId}-${child.entangledPeerId}`,
        left,
        top,
        width: right - left,
        height: bottom - top
      });
    });

    setLayout({ parentX: rect.width / 2, childXs, pairRects });
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
        {hasLayout && layout.pairRects.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {layout.pairRects.map((rect) => (
              <div
                key={rect.key}
                className="entangled-pair"
                style={{
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height
                }}
              />
            ))}
          </div>
        )}

        {hasLayout && (
          <svg
            className="absolute top-0 left-0 w-full text-gray-300 dark:text-slate-600 pointer-events-none"
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
            key={child.renderKey || child.id || child.nodeId}
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
  tableDensity = 'comfortable',
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
  onAddFilter,
  onUpdateFilter,
  onRemoveFilter,
  onFilterCellAction,
  showAddMenuForId,
  setShowAddMenuForId,
  showInsertMenuForId,
  setShowInsertMenuForId,
  renderMode = 'classic',
  branchSelectionByNodeId,
  onSelectBranch,
  onToggleEntangle,
  renderChildren = true,
  compactHeader = false,
  menuId,
  headerDragProps
}) => {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return null;

  const result = getNodeResult(chainData, nodeId);
  const filters = React.useMemo(
    () => (node.type === 'FILTER' ? normalizeFilters(node.params) : []),
    [node.type, node.params]
  );
  const [isFilterBuilderOpen, setIsFilterBuilderOpen] = React.useState(false);
  const [filterBuilderTargetIndex, setFilterBuilderTargetIndex] = React.useState(null);
  const [filterBuilderMode, setFilterBuilderMode] = React.useState('operator');
  const [operatorDraft, setOperatorDraft] = React.useState({ field: '', operator: 'equals', value: '' });
  const [attributeDraft, setAttributeDraft] = React.useState({ field: '', values: [] });
  const rawChildren = getChildren(nodes, nodeId);
  const isActive = selectedNodeId === nodeId;
  const isExpanded = node.isExpanded !== false;
  const isBranchCollapsed = node.isBranchCollapsed === true;
  const isEntangledMode = renderMode === 'entangled';
  const isSingleStreamMode = renderMode === 'singleStream';
  const peerNode = node.entangledPeerId ? nodes.find(n => n.id === node.entangledPeerId) : null;
  const isEntangledRoot = !!peerNode && peerNode.parentId === node.parentId;
  const resolvedMenuId = menuId || nodeId;
  const useScopedMenuIds = resolvedMenuId !== nodeId;
  const tableDensityClass = tableDensity === 'dense' ? 'table-density-dense' : 'table-density-comfortable';
  const addMenuRef = React.useRef(null);
  const insertMenuRef = React.useRef(null);

  const resolvedSelectedChildId = React.useMemo(() => {
    if (!isSingleStreamMode || rawChildren.length === 0) return null;
    const preferred = branchSelectionByNodeId?.[nodeId];
    const exists = rawChildren.some(child => child.id === preferred);
    return exists ? preferred : rawChildren[0].id;
  }, [isSingleStreamMode, rawChildren, branchSelectionByNodeId, nodeId]);

  React.useEffect(() => {
    if (!isSingleStreamMode || rawChildren.length <= 1 || !resolvedSelectedChildId) return;
    if (branchSelectionByNodeId?.[nodeId] !== resolvedSelectedChildId) {
      onSelectBranch?.(nodeId, resolvedSelectedChildId);
    }
  }, [isSingleStreamMode, rawChildren, resolvedSelectedChildId, branchSelectionByNodeId, nodeId, onSelectBranch]);

  const renderChildrenItems = React.useMemo(() => {
    const baseChildren = (isSingleStreamMode && resolvedSelectedChildId)
      ? rawChildren.filter(child => child.id === resolvedSelectedChildId)
      : rawChildren;
    const buildMenuKey = (childId) => (
      useScopedMenuIds ? `${resolvedMenuId}::${childId}` : childId
    );
    return baseChildren.map(child => ({
      node: child,
      nodeId: child.id,
      renderKey: buildMenuKey(child.id),
      menuKey: buildMenuKey(child.id),
      entangledPeerId: isEntangledMode ? child.entangledPeerId : undefined,
      entangledRootId: isEntangledMode ? child.entangledRootId : undefined
    }));
  }, [isSingleStreamMode, resolvedSelectedChildId, rawChildren, isEntangledMode, resolvedMenuId, useScopedMenuIds]);

  const showBranchTabs = isSingleStreamMode && rawChildren.length > 1;

  React.useEffect(() => {
    if (showAddMenuForId !== resolvedMenuId || !addMenuRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      addMenuRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [showAddMenuForId, resolvedMenuId]);

  React.useEffect(() => {
    if (showInsertMenuForId !== resolvedMenuId || !insertMenuRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      insertMenuRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [showInsertMenuForId, resolvedMenuId]);


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

  const resetFilterDrafts = React.useCallback(() => {
    setOperatorDraft({ field: '', operator: 'equals', value: '' });
    setAttributeDraft({ field: '', values: [] });
  }, []);

  const closeFilterBuilder = React.useCallback(() => {
    setIsFilterBuilderOpen(false);
    setFilterBuilderTargetIndex(null);
  }, []);

  const resolveAttributeValues = React.useCallback((filter) => {
    if (!filter) return [];
    if (Array.isArray(filter.value)) {
      return filter.value.map((item) => String(item)).filter(Boolean);
    }
    if (filter.operator === 'in') {
      return String(filter.value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (filter.value === null || filter.value === undefined || filter.value === '') return [];
    return [String(filter.value)];
  }, []);

  const openNewFilterBuilder = React.useCallback((mode = 'operator') => {
    resetFilterDrafts();
    setFilterBuilderMode(mode);
    setFilterBuilderTargetIndex(-1);
    setIsFilterBuilderOpen(true);
  }, [resetFilterDrafts]);

  const openFilterBuilderForFilter = React.useCallback((filter, index) => {
    const mode = resolveFilterMode(filter);
    setFilterBuilderMode(mode);
    setFilterBuilderTargetIndex(index);
    if (mode === 'attribute') {
      setAttributeDraft({ field: filter.field || '', values: resolveAttributeValues(filter) });
      setOperatorDraft({ field: '', operator: 'equals', value: '' });
    } else {
      setOperatorDraft({
        field: filter.field || '',
        operator: filter.operator || 'equals',
        value: filter.value ?? ''
      });
      setAttributeDraft({ field: '', values: [] });
    }
    setIsFilterBuilderOpen(true);
  }, [resolveAttributeValues]);

  const handleApplyOperatorFilter = () => {
    if (!operatorDraft.field) return;
    const payload = {
      field: operatorDraft.field,
      operator: operatorDraft.operator || 'equals',
      value: operatorDraft.value ?? '',
      mode: 'operator'
    };
    if (filterBuilderTargetIndex != null && filterBuilderTargetIndex >= 0) {
      onUpdateFilter?.(nodeId, filterBuilderTargetIndex, payload);
    } else {
      onAddFilter?.(nodeId, payload);
    }
    resetFilterDrafts();
    closeFilterBuilder();
  };

  const handleApplyAttributeFilter = () => {
    if (!attributeDraft.field || attributeDraft.values.length === 0) return;
    const value = attributeDraft.values.join(', ');
    const operator = attributeDraft.values.length > 1 ? 'in' : 'equals';
    const payload = {
      field: attributeDraft.field,
      operator,
      value,
      mode: 'attribute'
    };
    if (filterBuilderTargetIndex != null && filterBuilderTargetIndex >= 0) {
      onUpdateFilter?.(nodeId, filterBuilderTargetIndex, payload);
    } else {
      onAddFilter?.(nodeId, payload);
    }
    resetFilterDrafts();
    closeFilterBuilder();
  };

  const canToggleEntangle = !!node.parentId && (!node.entangledPeerId || isEntangledRoot);
  const entangleMenu = {
    items: [
      {
        key: 'entangle-toggle',
        label: node.entangledPeerId ? 'Remove entangled mirror' : 'Create entangled mirror',
        disabled: !canToggleEntangle
      }
    ],
    onClick: () => {
      if (!canToggleEntangle) return;
      onToggleEntangle?.(nodeId);
    }
  };

  const resolvedBranchLabel = React.useMemo(() => {
    let current = node;
    while (current) {
      if (current.branchName) return current.branchName;
      if (!current.parentId) break;
      current = nodes.find((n) => n.id === current.parentId);
    }
    return '';
  }, [node, nodes]);

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
    ? (result.getMetric ? result.getMetric(node.params.fn || 'count', node.params.metricField) : 0)
    : 0;

  // Columns for table preview (user-selected or default schema).
  const visibleColumns = (node.type === 'COMPONENT' && node.params.subtype === 'TABLE' && node.params.columns && node.params.columns.length > 0)
    ? node.params.columns
    : result ? result.schema : [];

  const filterFieldOptions = result?.schema || [];
  const attributeValueOptions = React.useMemo(() => {
    if (!result || !attributeDraft.field) return [];
    if (result.getColumnStats) {
      const stats = result.getColumnStats(attributeDraft.field, 32);
      if (stats?.topValues?.length) {
        return stats.topValues.map((item) => ({
          label: `${item.value} (${item.count})`,
          value: String(item.value)
        }));
      }
    }
    const fallbackRows = result.sampleRows || result.data || [];
    const seen = new Set();
    const options = [];
    fallbackRows.forEach((row) => {
      if (options.length >= 32) return;
      const raw = row?.[attributeDraft.field];
      if (raw === null || raw === undefined || raw === '') return;
      const display = String(raw);
      if (seen.has(display)) return;
      seen.add(display);
      options.push({ label: display, value: display });
    });
    return options;
  }, [result, attributeDraft.field]);

  const isEditingFilter = filterBuilderTargetIndex != null && filterBuilderTargetIndex >= 0;
  const filterBuilderContent = (
    <div className="w-80 p-3" onClick={(e) => e.stopPropagation()}>
      <Space direction="vertical" size="small" className="w-full">
        <Text type="secondary" className="text-xs">
          {isEditingFilter ? 'Edit filter' : 'Add a filter'}
        </Text>
        <Radio.Group
          value={filterBuilderMode}
          onChange={(e) => setFilterBuilderMode(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="small"
        >
          <Radio.Button value="operator">Operator</Radio.Button>
          <Radio.Button value="attribute">Attribute</Radio.Button>
        </Radio.Group>
        {filterBuilderMode === 'operator' ? (
          <Space direction="vertical" size="small" className="w-full">
            <Select
              placeholder="Select column"
              value={operatorDraft.field || undefined}
              onChange={(value) => setOperatorDraft((prev) => ({ ...prev, field: value }))}
              options={filterFieldOptions.map((field) => ({ label: field, value: field }))}
              disabled={filterFieldOptions.length === 0}
              style={{ width: '100%' }}
            />
            <Space size="small" className="w-full">
              <Select
                value={operatorDraft.operator || 'equals'}
                onChange={(value) => setOperatorDraft((prev) => ({ ...prev, operator: value }))}
                options={[
                  { label: '=', value: 'equals' },
                  { label: '!=', value: 'not_equals' },
                  { label: '>', value: 'gt' },
                  { label: '<', value: 'lt' },
                  { label: '>=', value: 'gte' },
                  { label: '<=', value: 'lte' },
                  { label: 'In list', value: 'in' },
                  { label: 'Like', value: 'contains' }
                ]}
                style={{ width: 120 }}
              />
              <Input
                placeholder={operatorDraft.operator === 'in' ? 'Comma-separated values' : 'Value'}
                value={operatorDraft.value}
                onChange={(e) => setOperatorDraft((prev) => ({ ...prev, value: e.target.value }))}
              />
            </Space>
            <Button
              type="primary"
              size="small"
              onClick={handleApplyOperatorFilter}
              disabled={!operatorDraft.field}
            >
              Apply filter
            </Button>
          </Space>
        ) : (
          <Space direction="vertical" size="small" className="w-full">
            <Select
              placeholder="Select column"
              value={attributeDraft.field || undefined}
              onChange={(value) => setAttributeDraft({ field: value, values: [] })}
              options={filterFieldOptions.map((field) => ({ label: field, value: field }))}
              disabled={filterFieldOptions.length === 0}
              style={{ width: '100%' }}
            />
            <Select
              mode="multiple"
              placeholder={attributeDraft.field ? 'Select values' : 'Pick a column first'}
              value={attributeDraft.values}
              onChange={(values) => setAttributeDraft((prev) => ({ ...prev, values }))}
              options={attributeValueOptions}
              disabled={!attributeDraft.field}
              maxTagCount="responsive"
              style={{ width: '100%' }}
            />
            <Button
              type="primary"
              size="small"
              onClick={handleApplyAttributeFilter}
              disabled={!attributeDraft.field || attributeDraft.values.length === 0}
            >
              Apply filter
            </Button>
          </Space>
        )}
      </Space>
    </div>
  );

  const filterAddTrigger = (
    <Button
      size="small"
      type="dashed"
      icon={<Plus size={12} />}
      onClick={(e) => {
        e.stopPropagation();
        openNewFilterBuilder('operator');
      }}
    >
      Add filter
    </Button>
  );

  const filterAddTriggerCompact = (
    <Button
      size="small"
      type="text"
      icon={<Plus size={12} />}
      onClick={(e) => {
        e.stopPropagation();
        openNewFilterBuilder('operator');
      }}
    />
  );

  const renderFilterChips = (compact = false) => {
    if (!filters.length && !compact) {
      return (
        <Space size="small">
          <Text type="secondary" className="text-xs">
            No filters yet
          </Text>
          <Popover
            content={filterBuilderContent}
            trigger="click"
            open={isFilterBuilderOpen && filterBuilderTargetIndex === -1}
            onOpenChange={(open) => {
              if (!open) closeFilterBuilder();
            }}
            placement="bottomLeft"
          >
            {filterAddTrigger}
          </Popover>
        </Space>
      );
    }

    return (
      <Space size={[compact ? 4 : 6, 4]} wrap>
        {filters.map((filter, index) => {
          const isOpen = isFilterBuilderOpen && filterBuilderTargetIndex === index;
          return (
            <Popover
              key={filter.id || `filter-${index}`}
              content={filterBuilderContent}
              trigger="click"
              placement="bottomLeft"
              open={isOpen}
              onOpenChange={(open) => {
                if (!open) closeFilterBuilder();
              }}
            >
              <span
                className="group inline-flex"
                onClick={(e) => {
                  e.stopPropagation();
                  openFilterBuilderForFilter(filter, index);
                }}
              >
                <Tag color="orange" className={compact ? 'cursor-pointer select-none text-[9px] px-1' : 'cursor-pointer select-none'}>
                  <span className="inline-flex items-center gap-1">
                    {formatFilterLabel(filter)}
                    <button
                      type="button"
                      className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full text-orange-700 opacity-0 transition-opacity group-hover:opacity-100 hover:text-orange-900"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFilter?.(nodeId, index);
                        if (isFilterBuilderOpen && filterBuilderTargetIndex === index) {
                          closeFilterBuilder();
                        }
                      }}
                      aria-label="Remove filter"
                    >
                      <Trash2 size={10} />
                    </button>
                  </span>
                </Tag>
              </span>
            </Popover>
          );
        })}
        <Popover
          content={filterBuilderContent}
          trigger="click"
          open={isFilterBuilderOpen && filterBuilderTargetIndex === -1}
          onOpenChange={(open) => {
            if (!open) closeFilterBuilder();
          }}
          placement="bottomLeft"
        >
          {compact ? filterAddTriggerCompact : filterAddTrigger}
        </Popover>
      </Space>
    );
  };

  const kpiMetrics = React.useMemo(() => {
    if (!result || node.type !== 'COMPONENT' || node.params.subtype !== 'KPI') return [];
    const rawMetrics = (node.params.metrics && node.params.metrics.length > 0)
      ? node.params.metrics
      : [{ id: 'metric-default', label: '', fn: node.params.fn || 'count', field: node.params.metricField || '' }];
    return rawMetrics.map(metric => ({
      ...metric,
      value: result.getMetric ? result.getMetric(metric.fn || 'count', metric.field) : 0
    }));
  }, [node.type, node.params.subtype, node.params.metrics, node.params.fn, node.params.metricField, result]);

  const pivotTableRef = React.useRef(null);
  const [pivotTableHeight, setPivotTableHeight] = React.useState(220);
  const [pivotHeaderHeight, setPivotHeaderHeight] = React.useState(38);

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
    if (!result.getPivotData) {
      return { rowKeys: [], colKeys: [], matrix: [], fn, rowField, columnField };
    }
    return result.getPivotData({
      rowField,
      columnField,
      valueField,
      fn
    });
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

    const updateLayoutMetrics = () => {
      const rect = el.getBoundingClientRect();
      if (rect.height) setPivotTableHeight(rect.height);
      const header = el.querySelector('.ant-table-header') || el.querySelector('.ant-table-thead');
      if (header) {
        const nextHeaderHeight = Math.ceil(header.getBoundingClientRect().height);
        setPivotHeaderHeight((prev) => (prev === nextHeaderHeight ? prev : nextHeaderHeight));
      }
    };
    updateLayoutMetrics();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateLayoutMetrics);
      return () => window.removeEventListener('resize', updateLayoutMetrics);
    }

    let frame = null;
    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateLayoutMetrics);
    });
    observer.observe(el);
    const header = el.querySelector('.ant-table-header') || el.querySelector('.ant-table-thead');
    if (header) observer.observe(header);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pivotState?.rowKeys?.length, pivotState?.colKeys?.length, tableDensity]);

  const chartType = node.params.chartType || 'bar';
  const chartAggFn = node.params.chartAggFn || 'none';
  const chartYAxis = (chartType !== 'scatter' && chartType !== 'map' && chartAggFn === 'count' && !node.params.yAxis)
    ? 'Record Count'
    : node.params.yAxis;

  const chartDataInfo = React.useMemo(() => {
    if (!result || node.type !== 'COMPONENT' || node.params.subtype !== 'CHART') {
      return { data: [], yField: chartYAxis };
    }
    if (chartType === 'map') return { data: [], yField: chartYAxis };
    const xField = node.params.xAxis;
    const yField = chartYAxis;
    if (!xField || !yField) {
      const fallback = result.getSampleRows ? result.getSampleRows(5000) : (result.data || []);
      return { data: fallback, yField };
    }
    const aggFn = chartAggFn;
    const shouldAggregate = chartType !== 'scatter' && aggFn !== 'none';
    if (!shouldAggregate) {
      const fallback = result.getSampleRows ? result.getSampleRows(5000) : (result.data || []);
      return { data: fallback, yField };
    }
    if (!result.getAggregatedRows) return { data: [], yField };
    const aggregated = result.getAggregatedRows({ groupBy: xField, fn: aggFn, metricField: yField });
    return {
      data: aggregated.rows || [],
      yField: aggregated.outputField || yField
    };
  }, [
    result,
    node.type,
    node.params.subtype,
    chartType,
    chartAggFn,
    chartYAxis,
    node.params.xAxis
  ]);

  const mapData = React.useMemo(() => {
    if (!result || node.type !== 'COMPONENT' || node.params.subtype !== 'CHART' || chartType !== 'map') return [];
    const mapField = node.params.xAxis;
    if (!mapField) return [];
    const aggFn = chartAggFn === 'none' ? 'count' : chartAggFn;
    if (!result.getAggregatedRows) return [];
    const aggregated = result.getAggregatedRows({ groupBy: mapField, fn: aggFn, metricField: node.params.yAxis });
    const valueField = aggregated.outputField || node.params.yAxis || 'Record Count';
    return (aggregated.rows || []).map((row) => ({
      code: row?.[mapField],
      value: row?.[valueField]
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

  const chartData = chartDataInfo.data;
  const resolvedChartYAxis = chartDataInfo.yField;

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

  const nodeCard = (
    <div className="relative group z-10">
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(nodeId); }}
        className={`
          node-card bg-white dark:bg-slate-900 rounded-xl border-2 transition-all cursor-pointer overflow-hidden relative flex flex-col
          ${compactHeader ? 'node-card--compact' : ''}
          ${isActive
            ? 'border-blue-500 shadow-xl shadow-blue-500/10 ring-1 ring-blue-500 z-20 dark:shadow-blue-500/20'
            : 'border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md dark:border-slate-700 dark:hover:border-slate-600 dark:shadow-black/40'}
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
        <div
          className={`node-card-header p-4 flex items-center gap-3 ${compactHeader ? 'node-card-header--compact' : ''} ${headerDragProps ? 'node-drag-handle' : ''}`}
          {...headerDragProps}
        >
          <Button
            type="text"
            size="small"
            icon={isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            onClick={(e) => { e.stopPropagation(); onToggleExpand(nodeId); }}
          />
          <div className={`node-card-icon w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300' : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'}`}>
            <Icon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <Space size="small" align="center">
              <Text strong className="truncate node-card-title">{node.title}</Text>
              {resolvedBranchLabel && (
                <Tag color="geekblue" className="uppercase text-[9px] font-bold">
                  {resolvedBranchLabel}
                </Tag>
              )}
              {compactHeader && node.type === 'FILTER' && renderFilterChips(true)}
              {node.entangledPeerId && (
                <Tooltip title="Entangled branch">
                  <span className="entangled-node-indicator" />
                </Tooltip>
              )}
            </Space>
            <div className="mt-0.5 node-card-subtitle">
              {node.type === 'FILTER' ? (
                compactHeader ? null : renderFilterChips(false)
              ) : (
                <Text type="secondary" className="text-xs truncate block">
                  {node.type === 'AGGREGATE' ? `Group by ${node.params.groupBy}` :
                    node.type === 'JOIN' ? `with ${node.params.rightTable || '...'}` :
                    node.type === 'COMPONENT' ? (node.params.subtype === 'AI' ? 'AI Assistant' : `${node.params.subtype} View`) :
                    node.description || node.type}
                </Text>
              )}
            </div>
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

        {showBranchTabs && (
          <div className="px-4 pb-2">
            <Space size="small" wrap>
              {rawChildren.map((child, index) => {
                const label = child.branchName || `Branch ${index + 1}`;
                const isActiveBranch = child.id === resolvedSelectedChildId;
                return (
                  <Button
                    key={child.id}
                    size="small"
                    type={isActiveBranch ? 'primary' : 'default'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBranch?.(nodeId, child.id);
                    }}
                  >
                    <Space size="small">
                      <span>{label}</span>
                      {child.entangledPeerId && (
                        <Tooltip title="Entangled branch">
                          <span className="entangled-tab-indicator" />
                        </Tooltip>
                      )}
                    </Space>
                  </Button>
                );
              })}
            </Space>
          </div>
        )}

        {/* Content Preview */}
        {isExpanded && result && (() => {
            const isTablePreview = node.params.subtype === 'TABLE' || (node.type !== 'COMPONENT' && node.type !== 'JOIN');
            const isPivotPreview = node.params.subtype === 'PIVOT';
            const isAssistantPreview = node.params.subtype === 'AI';
            const isChartPreview = node.params.subtype === 'CHART';
            const hasTableLikePreview = isTablePreview || isPivotPreview || isAssistantPreview;
            const contentPaddingClass = hasTableLikePreview ? 'p-0' : (isChartPreview ? 'p-1' : 'p-4');
            return (
            <div className={`border-t border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-800 ${contentPaddingClass} flex-1 min-h-0 animate-in slide-in-from-top-2 duration-200 flex flex-col overflow-hidden`}>
              {/* TABLE VIEW */}
              {isTablePreview && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between text-xs font-medium text-gray-500 dark:text-slate-400 px-2 pt-2">
                    <span>Preview</span>
                    <span>{result.rowCount} rows</span>
                  </div>
                  <div className="flex-1 min-h-0 px-2 pb-2">
                    <TablePreview
                      rowCount={result.rowCount}
                      columns={visibleColumns}
                      getRowAt={result.getRowAt}
                      sampleRows={result.sampleRows || result.data || []}
                      onCellClick={onTableCellClick}
                      enableInlineFilterMenu={node.type === 'FILTER'}
                      onFilterCellAction={onFilterCellAction}
                      onSortChange={onTableSortChange}
                      nodeId={nodeId}
                      sortBy={node.params.tableSortBy}
                      sortDirection={node.params.tableSortDirection}
                      tableDensity={tableDensity}
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
                  <div className="flex items-center justify-between text-xs font-medium text-gray-500 dark:text-slate-400 px-2 pt-2">
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
                            className={`rounded-none ${tableDensityClass}`}
                            style={{ borderRadius: 0 }}
                            pagination={false}
                            columns={pivotColumns}
                            dataSource={dataSource}
                            scroll={{ x: 'max-content', y: Math.max(140, pivotTableHeight - pivotHeaderHeight) }}
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
                    <div className="mt-2 pt-2 border-t border-slate-700 text-slate-500 dark:text-slate-400 italic">
                      Result: {result.rowCount} rows merged
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
                  yAxis={resolvedChartYAxis}
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
                    <Space orientation="vertical" size="small" style={{ width: '100%', textAlign: 'center' }}>
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
                  <Space orientation="vertical" size="small" style={{ width: '100%' }}>
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
      {rawChildren.length === 0 && (
        <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 translate-y-full z-20 transition-all ${!isExpanded ? '-mt-4' : ''}`}>
          <div ref={addMenuRef}>
            <Dropdown
              menu={{ items: addMenuItems, onClick: handleAddMenuClick }}
              trigger={['click']}
              open={showAddMenuForId === resolvedMenuId}
              onOpenChange={(open) => setShowAddMenuForId(open ? resolvedMenuId : null)}
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
  );

  return (
    <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
      {/* NODE CARD */}
      {isEntangledMode ? (
        <Dropdown menu={entangleMenu} trigger={['contextMenu']}>
          {nodeCard}
        </Dropdown>
      ) : nodeCard}

      {/* CONNECTORS & CHILDREN */}
      {renderChildren && renderChildrenItems.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="w-0.5 h-8 bg-gray-300 dark:bg-slate-600 rounded-full relative group/line">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/line:opacity-100 transition-opacity z-30">
              <div ref={insertMenuRef}>
                <Dropdown
                  menu={{ items: insertMenuItems, onClick: handleInsertMenuClick }}
                  trigger={['click']}
                  open={showInsertMenuForId === resolvedMenuId}
                  onOpenChange={(open) => setShowInsertMenuForId(open ? resolvedMenuId : null)}
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

          {renderChildrenItems.length === 1 ? (
            <TreeNode
              nodeId={renderChildrenItems[0].nodeId}
              menuId={renderChildrenItems[0].menuKey}
              nodes={nodes}
              selectedNodeId={selectedNodeId}
              chainData={chainData}
              tableDensity={tableDensity}
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
              onAddFilter={onAddFilter}
              onUpdateFilter={onUpdateFilter}
              onRemoveFilter={onRemoveFilter}
              onFilterCellAction={onFilterCellAction}
              showAddMenuForId={showAddMenuForId}
              setShowAddMenuForId={setShowAddMenuForId}
              showInsertMenuForId={showInsertMenuForId}
              setShowInsertMenuForId={setShowInsertMenuForId}
              renderMode={renderMode}
              branchSelectionByNodeId={branchSelectionByNodeId}
              onSelectBranch={onSelectBranch}
              onToggleEntangle={onToggleEntangle}
            />
          ) : (
            <MultiBranchGroup
              childrenNodes={renderChildrenItems}
              renderChild={(child) => (
                <TreeNode
                  nodeId={child.nodeId}
                  menuId={child.menuKey}
                  nodes={nodes}
                  selectedNodeId={selectedNodeId}
                  chainData={chainData}
                  tableDensity={tableDensity}
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
                  onAddFilter={onAddFilter}
                  onUpdateFilter={onUpdateFilter}
                  onRemoveFilter={onRemoveFilter}
                  onFilterCellAction={onFilterCellAction}
                  showAddMenuForId={showAddMenuForId}
                  setShowAddMenuForId={setShowAddMenuForId}
                  showInsertMenuForId={showInsertMenuForId}
                  setShowInsertMenuForId={setShowInsertMenuForId}
                  renderMode={renderMode}
                  branchSelectionByNodeId={branchSelectionByNodeId}
                  onSelectBranch={onSelectBranch}
                  onToggleEntangle={onToggleEntangle}
                />
              )}
            />
          )}
        </div>
      )}
    </div>
  );
};

const FreeLayoutNode = ({ nodeId, position, onMeasure, children }) => {
  const ref = React.useRef(null);

  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const width = el.offsetWidth || 0;
    const height = el.offsetHeight || 0;
    onMeasure(nodeId, width, height);
  }, [nodeId, onMeasure]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y
      }}
    >
      {children}
    </div>
  );
};

const FreeLayoutCanvas = ({
  nodes,
  selectedNodeId,
  chainData,
  tableDensity = 'comfortable',
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
  onAddFilter,
  onUpdateFilter,
  onRemoveFilter,
  onFilterCellAction,
  showAddMenuForId,
  setShowAddMenuForId,
  showInsertMenuForId,
  setShowInsertMenuForId,
  onUpdateNodePosition
}) => {
  const containerRef = React.useRef(null);
  const [viewport, setViewport] = React.useState({ x: 0, y: 0, scale: 1 });
  const viewportRef = React.useRef(viewport);
  const [isPanning, setIsPanning] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const nodeSizesRef = React.useRef(new Map());
  const [layoutVersion, setLayoutVersion] = React.useState(0);
  const panStateRef = React.useRef(null);
  const dragStateRef = React.useRef(null);
  const dragFrameRef = React.useRef(null);
  const clampScale = React.useCallback(
    (value) => Math.min(FREE_LAYOUT_MAX_SCALE, Math.max(FREE_LAYOUT_MIN_SCALE, value)),
    []
  );

  React.useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const nodesById = React.useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);

  const hiddenNodeIds = React.useMemo(() => {
    const hidden = new Set();
    nodes.forEach((node) => {
      let current = node;
      while (current?.parentId) {
        const parent = nodesById.get(current.parentId);
        if (!parent) break;
        if (parent.isBranchCollapsed) {
          hidden.add(node.id);
          break;
        }
        current = parent;
      }
    });
    return hidden;
  }, [nodes, nodesById]);

  const visibleNodes = React.useMemo(
    () => nodes.filter(node => !hiddenNodeIds.has(node.id)),
    [nodes, hiddenNodeIds]
  );

  const upstreamEdgeKeys = React.useMemo(() => {
    const keys = new Set();
    if (!selectedNodeId) return keys;
    let current = nodesById.get(selectedNodeId);
    while (current?.parentId) {
      keys.add(`${current.parentId}::${current.id}`);
      current = nodesById.get(current.parentId);
    }
    return keys;
  }, [selectedNodeId, nodesById]);

  const handleMeasureNode = React.useCallback((nodeId, width, height) => {
    const prev = nodeSizesRef.current.get(nodeId);
    if (prev && prev.width === width && prev.height === height) return;
    nodeSizesRef.current.set(nodeId, { width, height });
    setLayoutVersion((version) => version + 1);
  }, []);

  const zoomBy = React.useCallback((factor, point) => {
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
  }, [clampScale]);

  const handleWheel = React.useCallback((event) => {
    const isZoomShortcut = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!isZoomShortcut) return;
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    const dominantDelta = Math.abs(event.deltaY) > Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;
    const zoomFactor = Math.exp(-dominantDelta * 0.001);
    zoomBy(zoomFactor, pointer);
  }, [zoomBy]);

  const getViewportCenter = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }, []);

  const handleZoomIn = React.useCallback(() => {
    zoomBy(FREE_LAYOUT_ZOOM_STEP, getViewportCenter());
  }, [zoomBy, getViewportCenter]);

  const handleZoomOut = React.useCallback(() => {
    zoomBy(1 / FREE_LAYOUT_ZOOM_STEP, getViewportCenter());
  }, [zoomBy, getViewportCenter]);

  const handleResetZoom = React.useCallback(() => {
    setViewport({ x: 0, y: 0, scale: 1 });
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const onWheel = (event) => handleWheel(event);
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [handleWheel]);

  const handlePanMove = React.useCallback((event) => {
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

  const handlePanStart = React.useCallback((event) => {
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

  const handleNodeDragMove = React.useCallback((event) => {
    const state = dragStateRef.current;
    if (!state) return;
    if (dragFrameRef.current) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const scale = viewportRef.current.scale || 1;
      const dx = (event.clientX - state.startX) / scale;
      const dy = (event.clientY - state.startY) / scale;
      onUpdateNodePosition?.(state.nodeId, {
        x: state.originX + dx,
        y: state.originY + dy
      });
    });
  }, [onUpdateNodePosition]);

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

  const handleNodeDragStart = React.useCallback((nodeId, event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target?.closest('button, a, input, textarea, .ant-dropdown, .ant-select, .ant-table')) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(nodeId);
    const node = nodesById.get(nodeId);
    const origin = node?.position || { x: 0, y: 0 };
    dragStateRef.current = {
      nodeId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y
    };
    setIsDragging(true);
    window.addEventListener('pointermove', handleNodeDragMove);
    window.addEventListener('pointerup', handleNodeDragEnd);
  }, [nodesById, onSelect, handleNodeDragMove, handleNodeDragEnd]);

  const connectors = React.useMemo(() => {
    const lines = [];
    const sizes = nodeSizesRef.current;
    const visibleIds = new Set(visibleNodes.map(node => node.id));
    visibleNodes.forEach((node) => {
      if (!node.parentId || !visibleIds.has(node.parentId)) return;
      const parent = nodesById.get(node.parentId);
      if (!parent) return;
      const parentPos = parent.position;
      const childPos = node.position;
      const parentSize = sizes.get(parent.id);
      const childSize = sizes.get(node.id);
      if (!parentPos || !childPos || !parentSize || !childSize) return;
      const x1 = parentPos.x + parentSize.width / 2;
      const y1 = parentPos.y + parentSize.height;
      const x2 = childPos.x + childSize.width / 2;
      const y2 = childPos.y;
      const deltaY = Math.max(60, Math.abs(y2 - y1) * 0.5);
      const c1y = y1 + deltaY;
      const c2y = y2 - deltaY;
      const path = `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
      const edgeKey = `${node.parentId}::${node.id}`;
      lines.push({
        path,
        edgeKey,
        isUpstream: upstreamEdgeKeys.has(edgeKey),
        x1,
        y1,
        x2,
        y2
      });
    });
    return lines;
  }, [visibleNodes, nodesById, layoutVersion, upstreamEdgeKeys]);

  return (
    <div
      ref={containerRef}
      className={`free-layout-canvas relative w-full h-full ${isPanning || isDragging ? 'is-panning' : ''}`}
      onPointerDown={handlePanStart}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: '0 0'
        }}
      >
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{ overflow: 'visible' }}
          aria-hidden="true"
        >
          {connectors.map((line, index) => {
            const colorClass = line.isUpstream
              ? 'text-blue-500 dark:text-blue-300'
              : 'text-gray-300 dark:text-slate-600';
            return (
              <g key={`${line.edgeKey}-${index}`} className={colorClass}>
                <path
                  d={line.path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={line.isUpstream ? 3 : 2}
                  strokeLinecap="round"
                />
                <circle cx={line.x1} cy={line.y1} r={3} fill="currentColor" />
                <circle cx={line.x2} cy={line.y2} r={3} fill="currentColor" />
              </g>
            );
          })}
        </svg>

        {visibleNodes.map((node) => {
          const position = node.position || { x: 0, y: 0 };
          return (
            <FreeLayoutNode
              key={node.id}
              nodeId={node.id}
              position={position}
              onMeasure={handleMeasureNode}
            >
              <TreeNode
                nodeId={node.id}
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                chainData={chainData}
                tableDensity={tableDensity}
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
                onAddFilter={onAddFilter}
                onUpdateFilter={onUpdateFilter}
                onRemoveFilter={onRemoveFilter}
                onFilterCellAction={onFilterCellAction}
                showAddMenuForId={showAddMenuForId}
                setShowAddMenuForId={setShowAddMenuForId}
                showInsertMenuForId={showInsertMenuForId}
                setShowInsertMenuForId={setShowInsertMenuForId}
                renderMode="freeLayout"
                renderChildren={false}
                compactHeader
                menuId={node.id}
                headerDragProps={{
                  onPointerDown: (event) => handleNodeDragStart(node.id, event)
                }}
              />
            </FreeLayoutNode>
          );
        })}
      </div>
      <div className="absolute right-4 top-4 z-20 flex flex-col gap-1 rounded-lg border border-gray-200 bg-white/90 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
        <button
          onClick={handleZoomIn}
          className="h-7 w-7 rounded text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="h-7 w-7 rounded text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={handleResetZoom}
          className="h-7 w-7 rounded text-[10px] font-semibold text-gray-600 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
          title="Reset zoom"
        >
          {Math.round(viewport.scale * 100)}%
        </button>
      </div>
    </div>
  );
};

export { TreeNode, TablePreview, FreeLayoutCanvas };
