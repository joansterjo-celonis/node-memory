// src/components/TablePreview.jsx
// Shared table preview with stats and inline filtering.
import React from 'react';
import { Button, Empty, Popover, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { formatNumber } from '../utils/nodeUtils';

const { Text } = Typography;

const TABLE_STATS_TOP_VALUES = 5;
const formatPercent = (value) => `${Math.round(value)}%`;
const formatNumeric = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1000) return formatNumber(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
};

const getElementLayoutHeight = (element) => {
  if (!element) return 0;
  return element.offsetHeight || element.clientHeight || 0;
};

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
  tableDensity = 'comfortable',
  showTableStats = false,
  getColumnStats
}) => {
  const containerRef = React.useRef(null);
  const rowCacheRef = React.useRef(new Map());
  const [tableHeight, setTableHeight] = React.useState(220);
  const [headerHeight, setHeaderHeight] = React.useState(38);
  const [cellAction, setCellAction] = React.useState(null);
  const normalizedSortDirection = sortDirection === 'asc' || sortDirection === 'desc' ? sortDirection : '';
  const densityClassName = tableDensity === 'dense' ? 'table-density-dense' : 'table-density-comfortable';
  const isCompactHeader = tableDensity === 'dense';
  const statsTextClassName = isCompactHeader ? 'text-[9px]' : 'text-[10px]';
  const statsMutedTextClassName = isCompactHeader
    ? 'text-[9px] text-gray-400 dark:text-slate-500'
    : 'text-[10px] text-gray-400 dark:text-slate-500';
  const hasTableStats = showTableStats && typeof getColumnStats === 'function';
  const statsByColumn = React.useMemo(() => {
    if (!hasTableStats) return new Map();
    const next = new Map();
    columns.forEach((col) => {
      const stats = getColumnStats?.(col);
      if (!stats) return;
      const topValues = Array.isArray(stats.topValues)
        ? stats.topValues.slice(0, TABLE_STATS_TOP_VALUES)
        : [];
      const maxCount = topValues.reduce((acc, item) => Math.max(acc, item.count || 0), 0);
      next.set(col, { ...stats, topValues, maxCount });
    });
    return next;
  }, [columns, getColumnStats, hasTableStats, rowCount]);

  const renderStatsCell = (stats) => {
    if (!stats) {
      return <span className="text-[10px] text-gray-400 dark:text-slate-500">No stats</span>;
    }

    const totalRows = stats.totalRows ?? rowCount ?? 0;
    const nullCount = stats.nullCount ?? 0;
    const nullPercent = totalRows ? formatPercent((nullCount / totalRows) * 100) : '0%';
    const topValues = stats.topValues || [];
    const topItem = topValues[0];
    const topValueCount = topItem?.count ?? 0;
    const showNullAsTop = nullCount > topValueCount;
    const topValueLabel = showNullAsTop
      ? '[null]'
      : (topItem ? String(topItem.value) : '—');
    const topValueCountResolved = showNullAsTop ? nullCount : topValueCount;
    const topPercent = totalRows ? formatPercent((topValueCountResolved / totalRows) * 100) : '0%';
    const topTitle = (topItem || showNullAsTop)
      ? `${topValueLabel} (${formatNumber(topValueCountResolved)} / ${formatNumber(totalRows)} • ${topPercent})`
      : 'No values';
    const hasTopValue = Boolean(topItem) || showNullAsTop;
    const hasNumericSummary = [stats.min, stats.avg, stats.max].some((value) => Number.isFinite(value));
    const nullSummary = `Nulls ${formatNumber(nullCount)} (${nullPercent})`;
    const minLabel = `Min ${formatNumeric(stats.min)}`;
    const avgLabel = `Avg ${formatNumeric(stats.avg)}`;
    const maxLabel = `Max ${formatNumeric(stats.max)}`;

    return (
      <div className="table-stats-content flex h-full flex-col gap-0.5">
        <div className={`flex items-center gap-1 min-w-0 ${statsTextClassName} text-gray-500 dark:text-slate-400`}>
          <Tooltip title={topTitle}>
            <span className="truncate min-w-0">
              {hasTopValue ? `Top ${topValueLabel}` : 'Top —'}
            </span>
          </Tooltip>
          {hasTopValue && (
            <span className="shrink-0">
              {topPercent}
            </span>
          )}
          <span className="shrink-0 text-gray-300 dark:text-slate-600">·</span>
          <Tooltip title={nullSummary}>
            <span className="shrink-0">
              {nullSummary}
            </span>
          </Tooltip>
        </div>
        {hasNumericSummary && (
          <div className={`flex items-center gap-2 min-w-0 ${statsTextClassName} text-gray-500 dark:text-slate-400`}>
            <Tooltip title={minLabel}>
              <span className="truncate">{minLabel}</span>
            </Tooltip>
            <Tooltip title={avgLabel}>
              <span className="truncate">{avgLabel}</span>
            </Tooltip>
            <Tooltip title={maxLabel}>
              <span className="truncate">{maxLabel}</span>
            </Tooltip>
          </div>
        )}
        <div className="table-stats-bars mt-auto flex items-end gap-0.5">
          {topValues.length === 0 ? (
            <span className={statsMutedTextClassName}>No values</span>
          ) : (
            topValues.map((item, index) => {
              const heightPercent = stats.maxCount
                ? Math.max(20, (item.count / stats.maxCount) * 100)
                : 0;
              const barTitle = `${item.value} (${formatNumber(item.count)})`;
              return (
                <Tooltip key={`${item.value}-${index}`} title={barTitle}>
                  <div
                    className="w-2 rounded-sm bg-blue-500/70 dark:bg-blue-400/70"
                    style={{ height: `${heightPercent}%` }}
                  />
                </Tooltip>
              );
            })
          )}
        </div>
      </div>
    );
  };

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const updateLayoutMetrics = () => {
      const nextHeight = getElementLayoutHeight(el);
      if (nextHeight) setTableHeight(nextHeight);
      const header = el.querySelector('.ant-table-header') || el.querySelector('.ant-table-thead');
      if (header) {
        const nextHeaderHeight = getElementLayoutHeight(header);
        if (nextHeaderHeight) {
          setHeaderHeight((prev) => (prev === nextHeaderHeight ? prev : nextHeaderHeight));
        }
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
    <Space orientation="vertical" size="small">
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
    const headerTitle = (
      <span className="inline-flex items-center gap-1">
        {col}
        {sortIndicator && <span className="text-[10px] text-gray-400 dark:text-slate-500">{sortIndicator}</span>}
      </span>
    );
    const baseColumn = {
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
    const buildSortHeaderCell = () => ({
      onClick: (e) => {
        e.stopPropagation();
        handleHeaderSort(col);
      },
      className: 'cursor-pointer select-none hover:text-blue-600'
    });

    if (!hasTableStats) {
      return {
        title: headerTitle,
        ...baseColumn,
        onHeaderCell: buildSortHeaderCell
      };
    }

    const stats = statsByColumn.get(col);
    return {
      title: headerTitle,
      key: `${col}-group`,
      width: baseColumn.width,
      onHeaderCell: buildSortHeaderCell,
      children: [
        {
          ...baseColumn,
          title: renderStatsCell(stats),
          onHeaderCell: () => ({
            className: 'table-stats-header-cell',
            onClick: (e) => {
              e.stopPropagation();
            }
          })
        }
      ]
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

export default TablePreview;
