// src/components/ColumnStatsPanel.jsx
// Middle panel showing per-column statistics.
import React from 'react';
import { Button, Card, Empty, Progress, Select, Space, Statistic, Typography } from 'antd';
import { LinkIcon, Minimize2, Share2 } from '../ui/icons';
import { formatNumber } from '../utils/nodeUtils';

const { Text, Title } = Typography;

const MAX_TOP_VALUES = 6;

const isBlank = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
};

const formatNumeric = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1000) return formatNumber(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
};

const formatPercent = (value) => `${Math.round(value)}%`;

const StatCard = ({ label, value, helper }) => (
  <Card size="small">
    <Statistic title={label} value={value} />
    {helper ? <Text type="secondary" className="text-xs">{helper}</Text> : null}
  </Card>
);

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
}) => {
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
    const valueCounts = new Map();
    let numericCount = 0;
    let numericSum = 0;
    let numericMin = null;
    let numericMax = null;

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

  const selectDropdownProps = { popupMatchSelectWidth: false, styles: { popup: { root: { minWidth: isMobile ? 240 : 320 } } } };

  const containerClassName = (isDetached || isMobile) ? 'h-full w-full' : 'h-full w-72';
  const borderClassName = (isDetached || isMobile)
    ? 'border border-transparent'
    : 'border-l border-gray-200 dark:border-slate-700';
  const detachTitle = isDetached ? 'Dock panel' : 'Detach panel';

  return (
    <div className={`${containerClassName} ${borderClassName} flex flex-col bg-white shadow-xl shadow-gray-200/40 dark:bg-slate-900 dark:shadow-black/40 z-40`}>
      <div className={`${isMobile ? 'p-3' : 'p-4'} border-b border-gray-100 bg-white dark:bg-slate-900 dark:border-slate-700`}>
        <div className="flex items-start justify-between gap-3">
          <div
            {...(isDetached ? dragHandleProps : undefined)}
            className={`min-w-0 flex-1 ${isDetached ? 'cursor-move select-none' : ''}`}
          >
            <Title level={5} style={{ margin: 0 }}>Column Stats</Title>
            <Text type="secondary">Summary for the selected column</Text>
          </div>
          <div className="flex items-center gap-1">
            {onToggleDetach && !isMobile && (
              <Button
                type="text"
                size="small"
                icon={isDetached ? <LinkIcon size={14} /> : <Share2 size={14} />}
                onClick={onToggleDetach}
                title={detachTitle}
                aria-label={detachTitle}
              />
            )}
            {onCollapse && (
              <Button
                type="text"
                size="small"
                icon={<Minimize2 size={14} />}
                onClick={onCollapse}
                title="Collapse panel"
                aria-label="Collapse panel"
              />
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
          <Space orientation="vertical" size="small" style={{ width: '100%' }}>
            <Text type="secondary">Column</Text>
            <Select
              value={selectedColumn}
              onChange={(value) => setSelectedColumn(value)}
              options={schema.map((field) => ({ label: field, value: field }))}
              {...selectDropdownProps}
              style={{ width: '100%' }}
            />
          </Space>
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

            <Card size="small" title="Numeric Summary">
              <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-2`}>
                <Statistic title="Min" value={formatNumeric(stats.min)} />
                <Statistic title="Max" value={formatNumeric(stats.max)} />
                <Statistic title="Avg" value={formatNumeric(stats.avg)} />
              </div>
            </Card>

            <Card size="small" title="Top Values" extra={<Text type="secondary">{stats.distinctCount} distinct</Text>}>
              {stats.topValues.length === 0 ? (
                <Text type="secondary">No non-blank values to summarize.</Text>
              ) : (
                <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                  {stats.topValues.map((item, index) => {
                    const width = stats.maxCount ? (item.count / stats.maxCount) * 100 : 0;
                    return (
                      <div key={`${item.value}-${index}`} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <Text className="truncate block">{item.value}</Text>
                          <Progress percent={Math.round(width)} showInfo={false} />
                        </div>
                        <Text type="secondary" className="w-12 text-right text-xs">
                          {formatNumber(item.count)}
                        </Text>
                      </div>
                    );
                  })}
                </Space>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export { ColumnStatsPanel };
