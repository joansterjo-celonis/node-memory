import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Empty } from '@/components/ui/empty';
import { Statistic } from '@/components/ui/statistic';
import { LinkIcon, Minimize2, Share2 } from '../ui/icons';
import { formatNumber } from '../utils/nodeUtils';

const MAX_TOP_VALUES = 6;

const isBlank = (value: any) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
};

const formatNumeric = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1000) return formatNumber(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
};

const formatPercent = (value: number) => `${Math.round(value)}%`;

interface StatCardProps {
  label: string;
  value: string;
  helper?: string;
}

const StatCard = ({ label, value, helper }: StatCardProps) => (
  <Card>
    <CardContent className="p-3">
      <Statistic title={label} value={value} />
      {helper ? <p className="text-xs text-muted-foreground mt-1">{helper}</p> : null}
    </CardContent>
  </Card>
);

interface ColumnStatsPanelProps {
  node: any;
  schema?: string[];
  data?: any[];
  rowCount?: number;
  getColumnStats?: (column: string) => any;
  onCollapse?: () => void;
  onToggleDetach?: () => void;
  isDetached?: boolean;
  isMobile?: boolean;
  dragHandleProps?: Record<string, any>;
}

const ColumnStatsPanel = ({
  node,
  schema = [],
  data = [],
  rowCount = 0,
  getColumnStats,
  onCollapse,
  onToggleDetach,
  isDetached = false,
  isMobile = false,
  dragHandleProps
}: ColumnStatsPanelProps) => {
  const [selectedColumn, setSelectedColumn] = React.useState('');

  React.useEffect(() => {
    if (!schema || schema.length === 0) {
      setSelectedColumn('');
      return;
    }
    setSelectedColumn((prev) => (prev && schema.includes(prev) ? prev : schema[0]));
  }, [schema, node?.id]);

  const stats = React.useMemo(() => {
    if (!selectedColumn) return null;
    if (getColumnStats) return getColumnStats(selectedColumn);
    const totalRows = data.length;
    let nullCount = 0;
    const valueCounts = new Map<string, number>();
    let numericCount = 0;
    let numericSum = 0;
    let numericMin: number | null = null;
    let numericMax: number | null = null;

    data.forEach((row) => {
      const value = row?.[selectedColumn];
      if (isBlank(value)) {
        nullCount += 1;
        return;
      }
      const display = String(value);
      valueCounts.set(display, (valueCounts.get(display) || 0) + 1);
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        numericCount += 1;
        numericSum += numeric;
        numericMin = numericMin === null ? numeric : Math.min(numericMin, numeric);
        numericMax = numericMax === null ? numeric : Math.max(numericMax, numeric);
      }
    });

    const distinctCount = valueCounts.size;
    const nonNullCount = totalRows - nullCount;
    const avg = numericCount > 0 ? numericSum / numericCount : null;

    const topValues = Array.from(valueCounts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true, sensitivity: 'base' });
      })
      .slice(0, MAX_TOP_VALUES)
      .map(([value, count]) => ({ value, count }));

    const maxCount = topValues.reduce((acc, item) => Math.max(acc, item.count), 0);

    return {
      totalRows,
      nullCount,
      nonNullCount,
      distinctCount,
      min: numericMin,
      max: numericMax,
      avg,
      topValues,
      maxCount
    };
  }, [data, selectedColumn, getColumnStats]);

  const totalRows = stats?.totalRows ?? rowCount ?? data.length;
  const hasData = schema.length > 0 && totalRows > 0;
  const nullRate = stats && stats.totalRows > 0 ? (stats.nullCount / stats.totalRows) * 100 : 0;

  const containerClassName = (isDetached || isMobile) ? 'h-full w-full' : 'h-full w-72';
  const borderClassName = (isDetached || isMobile)
    ? 'border border-transparent'
    : 'border-l border-border';
  const detachTitle = isDetached ? 'Dock panel' : 'Detach panel';

  return (
    <div className={`${containerClassName} ${borderClassName} flex flex-col bg-background shadow-xl shadow-muted/40 z-40`}>
      <div className={`${isMobile ? 'p-3' : 'p-4'} border-b border-border bg-background`}>
        <div className="flex items-start justify-between gap-3">
          <div
            {...(isDetached ? dragHandleProps : undefined)}
            className={`min-w-0 flex-1 ${isDetached ? 'cursor-move select-none' : ''}`}
          >
            <h3 className="text-base font-semibold text-foreground">Column Stats</h3>
            <p className="text-sm text-muted-foreground">Summary for the selected column</p>
          </div>
          <div className="flex items-center gap-1">
            {onToggleDetach && !isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onToggleDetach}
                title={detachTitle}
                aria-label={detachTitle}
              >
                {isDetached ? <LinkIcon size={14} /> : <Share2 size={14} />}
              </Button>
            )}
            {onCollapse && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onCollapse}
                title="Collapse panel"
                aria-label="Collapse panel"
              >
                <Minimize2 size={14} />
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className={`flex-1 overflow-y-auto ${isMobile ? 'p-3' : 'p-4'} space-y-4`}>
        {!node && (
          <Empty description="Select a node to see column statistics." />
        )}
        {node && schema.length === 0 && (
          <Empty description="No columns available yet." />
        )}
        {node && schema.length > 0 && (
          <div className="space-y-1.5 w-full">
            <p className="text-sm text-muted-foreground">Column</p>
            <Select value={selectedColumn} onValueChange={setSelectedColumn}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {schema.map((field) => (
                  <SelectItem key={field} value={field}>{field}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {node && schema.length > 0 && !hasData && (
          <Empty description="No rows available yet." />
        )}

        {node && hasData && stats && (
          <>
            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
              <StatCard label="Rows" value={formatNumber(stats.totalRows)} />
              <StatCard label="Non-null" value={formatNumber(stats.nonNullCount)} />
              <StatCard
                label="Nulls"
                value={formatNumber(stats.nullCount)}
                helper={stats.totalRows > 0 ? `${formatPercent(nullRate)} null rate` : ''}
              />
              <StatCard label="Distinct" value={formatNumber(stats.distinctCount)} />
            </div>

            <Card>
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm font-medium">Numeric Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-2`}>
                  <Statistic title="Min" value={formatNumeric(stats.min)} />
                  <Statistic title="Max" value={formatNumeric(stats.max)} />
                  <Statistic title="Avg" value={formatNumeric(stats.avg)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Top Values</CardTitle>
                  <span className="text-xs text-muted-foreground">{stats.distinctCount} distinct</span>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {stats.topValues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No non-blank values to summarize.</p>
                ) : (
                  <div className="space-y-2 w-full">
                    {stats.topValues.map((item, index) => {
                      const width = stats.maxCount ? (item.count / stats.maxCount) * 100 : 0;
                      return (
                        <div key={`${item.value}-${index}`} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="truncate block text-sm">{item.value}</span>
                            <Progress value={Math.round(width)} className="h-1.5" />
                          </div>
                          <span className="w-12 text-right text-xs text-muted-foreground">
                            {formatNumber(item.count)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export { ColumnStatsPanel };
