import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from './ui/tooltip';
import { Empty } from './ui/empty';
import { formatNumber } from '../lib/nodeUtils';

const TABLE_STATS_TOP_VALUES = 5;
const formatPercent = (value: number) => `${Math.round(value)}%`;
const formatNumeric = (value: any) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1000) return formatNumber(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
};

interface CellActionPayload {
  nodeId?: string;
  field: string;
  value: any;
}

interface TablePreviewProps {
  rowCount?: number;
  columns?: string[];
  getRowAt?: (index: number, sortBy: string, sortDir: string) => Record<string, any> | null;
  sampleRows?: Record<string, any>[];
  onCellClick?: (value: any, col: string, nodeId?: string) => void;
  enableInlineFilterMenu?: boolean;
  onFilterCellAction?: (action: string, payload: CellActionPayload) => void;
  onSortChange?: (nodeId: string | undefined, sortBy: string, sortDir: string) => void;
  nodeId?: string;
  sortBy?: string;
  sortDirection?: string;
  tableDensity?: 'comfortable' | 'dense';
  showTableStats?: boolean;
  getColumnStats?: (col: string) => any;
}

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
  sortBy = '',
  sortDirection = '',
  tableDensity = 'comfortable',
  showTableStats = false,
  getColumnStats
}: TablePreviewProps) => {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const rowCacheRef = React.useRef<Map<number, Record<string, any> | null>>(new Map());
  const [cellAction, setCellAction] = React.useState<{
    key: string;
    payload: CellActionPayload;
  } | null>(null);
  const normalizedSortDirection = sortDirection === 'asc' || sortDirection === 'desc' ? sortDirection : '';
  const isDense = tableDensity === 'dense';
  const rowHeight = isDense ? 28 : 36;
  const headerPadding = isDense ? 'px-2 py-1' : 'px-3 py-2';
  const cellPadding = isDense ? 'px-2 py-0.5' : 'px-3 py-1.5';
  const statsTextClassName = isDense ? 'text-[9px]' : 'text-[10px]';
  const statsMutedTextClassName = isDense
    ? 'text-[9px] text-muted-foreground/60'
    : 'text-[10px] text-muted-foreground/60';
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
      const maxCount = topValues.reduce((acc: number, item: any) => Math.max(acc, item.count || 0), 0);
      next.set(col, { ...stats, topValues, maxCount });
    });
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, getColumnStats, hasTableStats, rowCount]);

  const widthSampleRows = React.useMemo(
    () => (Array.isArray(sampleRows) ? sampleRows.slice(0, 40) : []),
    [sampleRows]
  );

  const estimatedColumnWidths = React.useMemo(() => {
    const widths: Record<string, number> = {};
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

  const totalWidth = Math.max(
    360,
    columns.reduce((sum, col) => sum + (estimatedColumnWidths[col] || 120), 0)
  );

  React.useEffect(() => {
    rowCacheRef.current.clear();
  }, [rowCount, sortBy, normalizedSortDirection]);

  React.useEffect(() => {
    setCellAction(null);
  }, [nodeId, enableInlineFilterMenu]);

  const resolveRow = React.useCallback((index: number) => {
    const cache = rowCacheRef.current;
    if (cache.has(index)) return cache.get(index);
    const row = getRowAt ? getRowAt(index, sortBy, normalizedSortDirection) : null;
    cache.set(index, row);
    return row;
  }, [getRowAt, sortBy, normalizedSortDirection]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: 20
  });

  const handleHeaderSort = (column: string) => {
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

  const renderStatsCell = (stats: any) => {
    if (!stats) {
      return <span className="text-[10px] text-muted-foreground/60">No stats</span>;
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
    const hasNumericSummary = [stats.min, stats.avg, stats.max].some((value: any) => Number.isFinite(value));
    const nullSummary = `Nulls ${formatNumber(nullCount)} (${nullPercent})`;
    const minLabel = `Min ${formatNumeric(stats.min)}`;
    const avgLabel = `Avg ${formatNumeric(stats.avg)}`;
    const maxLabel = `Max ${formatNumeric(stats.max)}`;

    return (
      <TooltipProvider delayDuration={200}>
        <div className="table-stats-content flex h-full flex-col gap-0.5">
          <div className={`flex items-center gap-1 min-w-0 ${statsTextClassName} text-muted-foreground`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate min-w-0">
                  {hasTopValue ? `Top ${topValueLabel}` : 'Top —'}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">{topTitle}</TooltipContent>
            </Tooltip>
            {hasTopValue && (
              <span className="shrink-0">{topPercent}</span>
            )}
            <span className="shrink-0 text-muted-foreground/30">·</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0">{nullSummary}</span>
              </TooltipTrigger>
              <TooltipContent side="top">{nullSummary}</TooltipContent>
            </Tooltip>
          </div>
          {hasNumericSummary && (
            <div className={`flex items-center gap-2 min-w-0 ${statsTextClassName} text-muted-foreground`}>
              <Tooltip>
                <TooltipTrigger asChild><span className="truncate">{minLabel}</span></TooltipTrigger>
                <TooltipContent side="top">{minLabel}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild><span className="truncate">{avgLabel}</span></TooltipTrigger>
                <TooltipContent side="top">{avgLabel}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild><span className="truncate">{maxLabel}</span></TooltipTrigger>
                <TooltipContent side="top">{maxLabel}</TooltipContent>
              </Tooltip>
            </div>
          )}
          <div className="table-stats-bars mt-auto flex items-end gap-0.5">
            {topValues.length === 0 ? (
              <span className={statsMutedTextClassName}>No values</span>
            ) : (
              topValues.map((item: any, index: number) => {
                const heightPercent = stats.maxCount
                  ? Math.max(20, (item.count / stats.maxCount) * 100)
                  : 0;
                const barTitle = `${item.value} (${formatNumber(item.count)})`;
                return (
                  <Tooltip key={`${item.value}-${index}`}>
                    <TooltipTrigger asChild>
                      <div
                        className="w-2 rounded-sm bg-primary/70"
                        style={{ height: `${heightPercent}%` }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top">{barTitle}</TooltipContent>
                  </Tooltip>
                );
              })
            )}
          </div>
        </div>
      </TooltipProvider>
    );
  };

  if (columns.length === 0) {
    return <Empty description="No columns available for preview" />;
  }

  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
      >
        <div style={{ minWidth: totalWidth }}>
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b border-border">
              <tr>
                {columns.map((col) => {
                  const isSorted = sortBy === col && normalizedSortDirection;
                  const sortIndicator = isSorted ? (normalizedSortDirection === 'asc' ? '^' : 'v') : '';
                  return (
                    <th
                      key={col}
                      className={`${headerPadding} text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-primary whitespace-nowrap`}
                      style={{ width: estimatedColumnWidths[col] || 120 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleHeaderSort(col);
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col}
                        {sortIndicator && (
                          <span className="text-[10px] text-muted-foreground/60">{sortIndicator}</span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
              {hasTableStats && (
                <tr className="border-b border-border">
                  {columns.map((col) => {
                    const stats = statsByColumn.get(col);
                    return (
                      <th
                        key={`stats-${col}`}
                        className={`${headerPadding} text-left align-top`}
                        style={{ width: estimatedColumnWidths[col] || 120 }}
                      >
                        {renderStatsCell(stats)}
                      </th>
                    );
                  })}
                </tr>
              )}
            </thead>
            <tbody>
              {rowCount === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-8 text-center text-muted-foreground text-xs">
                    No rows
                  </td>
                </tr>
              ) : (
                <>
                  {virtualItems.length > 0 && virtualItems[0].start > 0 && (
                    <tr>
                      <td colSpan={columns.length} style={{ height: virtualItems[0].start, padding: 0 }} />
                    </tr>
                  )}
                  {virtualItems.map((virtualRow) => {
                    const row = resolveRow(virtualRow.index);
                    return (
                      <tr
                        key={virtualRow.index}
                        className="border-b border-border/50 transition-colors hover:bg-muted/30"
                        style={{ height: rowHeight }}
                      >
                        {columns.map((col) => {
                          const displayValue = row?.[col] ?? '';
                          const cellKey = `${virtualRow.index}-${col}`;
                          const isOpen = cellAction?.key === cellKey;

                          const handleCellClick = (e: React.MouseEvent) => {
                            e.stopPropagation();
                            const value = row?.[col];
                            if (enableInlineFilterMenu && onFilterCellAction) {
                              setCellAction({
                                key: cellKey,
                                payload: { nodeId, field: col, value }
                              });
                              return;
                            }
                            if (!onCellClick) return;
                            onCellClick(value, col, nodeId);
                          };

                          if (enableInlineFilterMenu) {
                            return (
                              <td
                                key={col}
                                className={`${cellPadding} truncate max-w-0 cursor-pointer hover:bg-primary/5 hover:text-primary transition-colors`}
                                style={{ width: estimatedColumnWidths[col] || 120 }}
                              >
                                <Popover
                                  open={isOpen}
                                  onOpenChange={(open) => {
                                    if (!open) setCellAction(null);
                                  }}
                                >
                                  <PopoverTrigger asChild>
                                    <span
                                      className="block truncate cursor-pointer"
                                      onClick={handleCellClick}
                                    >
                                      {String(displayValue)}
                                    </span>
                                  </PopoverTrigger>
                                  <PopoverContent side="right" align="start" className="w-auto p-3">
                                    <div className="flex flex-col gap-2">
                                      <span className="text-xs text-muted-foreground">Apply filter</span>
                                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30">
                                        {cellAction?.payload.field} = {String(cellAction?.payload.value ?? '')}
                                      </Badge>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            if (cellAction) {
                                              onFilterCellAction?.('add-to-node', cellAction.payload);
                                            }
                                            setCellAction(null);
                                          }}
                                        >
                                          Add to this node
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            if (cellAction) {
                                              onFilterCellAction?.('create-node', cellAction.payload);
                                            }
                                            setCellAction(null);
                                          }}
                                        >
                                          New filter node
                                        </Button>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={col}
                              className={`${cellPadding} truncate max-w-0 cursor-pointer hover:bg-primary/5 hover:text-primary transition-colors`}
                              style={{ width: estimatedColumnWidths[col] || 120 }}
                              onClick={handleCellClick}
                            >
                              {String(displayValue)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {virtualItems.length > 0 && (
                    <tr>
                      <td
                        colSpan={columns.length}
                        style={{
                          height: totalHeight - (virtualItems[virtualItems.length - 1].end),
                          padding: 0
                        }}
                      />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

export default TablePreview;
