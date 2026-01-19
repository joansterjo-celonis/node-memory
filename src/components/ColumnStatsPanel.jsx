// src/components/ColumnStatsPanel.jsx
// Middle panel showing per-column statistics.
import React from 'react';
import { formatNumber } from '../utils/nodeUtils';

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
  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</div>
    <div className="text-lg font-bold text-gray-900">{value}</div>
    {helper ? <div className="text-[10px] text-gray-400 mt-1">{helper}</div> : null}
  </div>
);

const ColumnStatsPanel = ({ node, schema = [], data = [] }) => {
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
  }, [data, selectedColumn]);

  const hasData = schema.length > 0 && data.length > 0;
  const nullRate = stats && stats.totalRows > 0 ? (stats.nullCount / stats.totalRows) * 100 : 0;

  return (
    <div className="h-full w-72 flex flex-col bg-white border-l border-gray-200 shadow-xl shadow-gray-200/40 z-40">
      <div className="p-4 border-b border-gray-100 bg-white">
        <div className="text-xs font-bold uppercase tracking-wider text-blue-600">Column Stats</div>
        <div className="text-[11px] text-gray-400 mt-1">Summary for the selected column</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!node && (
          <div className="text-xs text-gray-400">Select a node to see column statistics.</div>
        )}
        {node && schema.length === 0 && (
          <div className="text-xs text-gray-400">No columns available yet.</div>
        )}
        {node && schema.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Column</label>
            <select
              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={selectedColumn}
              onChange={(e) => setSelectedColumn(e.target.value)}
            >
              {schema.map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          </div>
        )}

        {node && schema.length > 0 && !hasData && (
          <div className="text-xs text-gray-400">No rows available yet.</div>
        )}

        {node && hasData && stats && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Rows" value={formatNumber(stats.totalRows)} />
              <StatCard label="Non-null" value={formatNumber(stats.nonNullCount)} />
              <StatCard
                label="Nulls"
                value={formatNumber(stats.nullCount)}
                helper={stats.totalRows > 0 ? `${formatPercent(nullRate)} null rate` : ''}
              />
              <StatCard label="Distinct" value={formatNumber(stats.distinctCount)} />
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Numeric Summary</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Min</div>
                  <div className="text-sm font-semibold text-gray-900">{formatNumeric(stats.min)}</div>
                </div>
                <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Max</div>
                  <div className="text-sm font-semibold text-gray-900">{formatNumeric(stats.max)}</div>
                </div>
                <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Avg</div>
                  <div className="text-sm font-semibold text-gray-900">{formatNumeric(stats.avg)}</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Top Values</div>
                <div className="text-[10px] text-gray-400">{stats.distinctCount} distinct</div>
              </div>
              {stats.topValues.length === 0 ? (
                <div className="text-xs text-gray-400">No non-blank values to summarize.</div>
              ) : (
                <div className="space-y-2">
                  {stats.topValues.map((item, index) => {
                    const width = stats.maxCount ? (item.count / stats.maxCount) * 100 : 0;
                    return (
                      <div key={`${item.value}-${index}`} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-700 truncate">{item.value}</div>
                          <div className="h-1.5 bg-gray-100 rounded">
                            <div
                              className="h-1.5 bg-blue-500 rounded"
                              style={{ width: `${width}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="text-[10px] text-gray-500 w-12 text-right">
                          {formatNumber(item.count)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export { ColumnStatsPanel };
