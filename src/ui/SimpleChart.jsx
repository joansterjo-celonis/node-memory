// src/ui/SimpleChart.js
// Visx chart renderer for richer visualizations.
import React from 'react';
import { ParentSize } from '@visx/responsive';
import { XYChart, Axis, Grid, BarSeries, LineSeries, AreaSeries, GlyphSeries } from '@visx/xychart';
import { curveLinear, curveMonotoneX, curveStep } from '@visx/curve';

const curveMap = {
  linear: curveLinear,
  monotone: curveMonotoneX,
  step: curveStep
};

const DEFAULT_SERIES_COLOR = '#2563eb';
const LABEL_FONT_SIZE = 10;

const resolveDatum = (event) => {
  if (!event) return null;
  if (event.datum) return event.datum;
  if (event.data) return event.data;
  if (event.datum?.datum) return event.datum.datum;
  return event;
};

const resolvePointerEvent = (event) =>
  event?.event || event?.evt || event?.nativeEvent || event;

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  return value;
};

const estimateLabelWidth = (label) => String(label).length * (LABEL_FONT_SIZE * 0.6);

const hexToRgb = (color) => {
  if (!color || typeof color !== 'string') return null;
  const hex = color.replace('#', '').trim();
  if (hex.length !== 6) return null;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((val) => Number.isNaN(val))) return null;
  return { r, g, b };
};

const toRgba = (color, alpha) => {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const VisxChart = ({
  data,
  xAxis,
  yAxis,
  type,
  onClick,
  showGrid = true,
  showPoints = false,
  curveType = 'linear',
  stacked = false,
  showTooltip = true,
  orientation = 'vertical',
  barGap = 0.2,
  seriesColor
}) => {
  if (!xAxis || !yAxis || !data || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-400 dark:text-slate-500">
        Configure axes to view a chart
      </div>
    );
  }

  const prepared = React.useMemo(() => {
    const rows = [];
    data.forEach((row, index) => {
      const xValue = row?.[xAxis];
      const yValue = Number(row?.[yAxis]);
      if (xValue === undefined || xValue === null || xValue === '') return;
      if (Number.isNaN(yValue)) return;
      rows.push({ ...row, __x: xValue, __y: yValue, __index: index });
    });
    return rows;
  }, [data, xAxis, yAxis]);

  if (prepared.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-400 dark:text-slate-500">
        No numeric values available for this chart
      </div>
    );
  }

  const containerRef = React.useRef(null);
  const [tooltip, setTooltip] = React.useState({ visible: false, x: 0, y: 0, width: 0, height: 0, datum: null });
  const [dragSelection, setDragSelection] = React.useState([]);
  const dragEndTimer = React.useRef(null);
  const isHorizontal = orientation === 'horizontal' && type === 'bar';
  const sample = prepared.slice(0, 12);
  const numericCount = sample.filter((row) => Number.isFinite(Number(row.__x))).length;
  const isNumericX = !isHorizontal && numericCount >= Math.ceil(sample.length / 2);
  const xAccessor = (row) => (
    isHorizontal ? row.__y : (isNumericX ? Number(row.__x) : String(row.__x))
  );
  const yAccessor = (row) => (isHorizontal ? String(row.__x) : row.__y);
  const curve = curveMap[curveType] || curveLinear;
  const normalizedGap = Number.isFinite(barGap) ? Math.min(Math.max(barGap, 0), 0.9) : 0.2;
  const bandScale = {
    type: 'band',
    paddingInner: normalizedGap,
    paddingOuter: Math.min(0.5, normalizedGap / 2)
  };
  const xScale = isHorizontal
    ? { type: 'linear', nice: true, zero: true }
    : { type: isNumericX ? 'linear' : 'band', ...(isNumericX ? {} : bandScale) };
  const yScale = isHorizontal
    ? bandScale
    : { type: 'linear', nice: true, zero: true };
  const gridColumns = isHorizontal ? true : !isNumericX;
  const gridRows = !isHorizontal;
  const categoryValues = React.useMemo(() => {
    const values = [];
    const seen = new Set();
    prepared.forEach((row) => {
      const key = row.__x;
      if (seen.has(key)) return;
      seen.add(key);
      values.push(key);
    });
    return values;
  }, [prepared]);
  const dragStartRef = React.useRef(null);

  const clearDragSelection = React.useCallback(() => {
    if (dragEndTimer.current) {
      clearTimeout(dragEndTimer.current);
      dragEndTimer.current = null;
    }
    setDragSelection([]);
  }, []);

  const hideTooltip = React.useCallback(() => {
    setTooltip((prev) => (prev.visible ? { ...prev, visible: false, datum: null } : prev));
  }, []);

  const updateTooltip = React.useCallback((event, datum) => {
    if (!datum) return;
    const sourceEvent = resolvePointerEvent(event);
    if (!sourceEvent || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nextX = sourceEvent.clientX - rect.left;
    const nextY = sourceEvent.clientY - rect.top;
    if (Number.isNaN(nextX) || Number.isNaN(nextY)) return;
    setTooltip({ visible: true, x: nextX, y: nextY, width: rect.width, height: rect.height, datum });
  }, []);

  const getSelectionRange = React.useCallback((startValue, endValue) => {
    if (startValue === undefined || startValue === null || endValue === undefined || endValue === null) {
      return [];
    }
    if (startValue === endValue) return [startValue];
    const startIndex = categoryValues.findIndex((value) => String(value) === String(startValue));
    const endIndex = categoryValues.findIndex((value) => String(value) === String(endValue));
    if (startIndex === -1 || endIndex === -1) return [];
    const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    return categoryValues.slice(from, to + 1);
  }, [categoryValues]);

  const handlePointerDown = (event) => {
    const datum = resolveDatum(event);
    if (!datum) return;
    clearDragSelection();
    dragStartRef.current = datum.__x;
    setDragSelection([datum.__x]);
  };

  const handlePointerOut = () => {
    dragStartRef.current = null;
    clearDragSelection();
    hideTooltip();
  };

  const handlePointerMove = (event) => {
    const datum = resolveDatum(event);
    if (!datum) return;
    updateTooltip(event, datum);
    if (dragStartRef.current !== null && dragStartRef.current !== undefined) {
      const range = getSelectionRange(dragStartRef.current, datum.__x);
      if (range.length) setDragSelection(range);
    }
  };

  const handlePointerUp = (event) => {
    const datum = resolveDatum(event);
    if (!datum || !onClick) return;
    const startValue = dragStartRef.current;
    const endValue = datum.__x;
    dragStartRef.current = null;
    let selection = null;
    const selectionValues = getSelectionRange(startValue, endValue);
    if (selectionValues.length > 1) selection = { values: selectionValues };
    onClick({ activePayload: [{ payload: datum }], selection });
    if (selectionValues.length) {
      setDragSelection(selectionValues);
      dragEndTimer.current = setTimeout(() => {
        clearDragSelection();
      }, 600);
    } else {
      clearDragSelection();
    }
  };

  return (
    <div className="h-full w-full relative" ref={containerRef}>
      <ParentSize>
        {({ width, height }) => {
          const resolvedWidth = Math.max(width, 240);
          const resolvedHeight = Math.max(height, 200);
          const chartMargin = { top: 16, right: 16, bottom: 32, left: 44 };
          const xTickValues = (!isHorizontal && !isNumericX)
            ? categoryValues.map((value) => String(value))
            : undefined;
          const maxLabelWidth = xTickValues && xTickValues.length > 0
            ? Math.max(...xTickValues.map(estimateLabelWidth))
            : 0;
          const chartInnerWidth = resolvedWidth - chartMargin.left - chartMargin.right;
          const hasCategoricalXAxis = Boolean(xTickValues && xTickValues.length > 0);
          const minBandWidth = hasCategoricalXAxis
            ? Math.max(32, maxLabelWidth + 12)
            : 0;
          const desiredInnerWidth = hasCategoricalXAxis
            ? Math.max(chartInnerWidth, minBandWidth * xTickValues.length)
            : chartInnerWidth;
          const chartWidth = desiredInnerWidth + chartMargin.left + chartMargin.right;
          const tickLabelOffset = 12;
          const labelHeight = LABEL_FONT_SIZE * 1.6;
          chartMargin.bottom = Math.max(chartMargin.bottom, labelHeight + tickLabelOffset + 6);
          const scrollbarGutter = hasCategoricalXAxis ? 12 : 0;
          const chartHeight = Math.max(160, resolvedHeight - scrollbarGutter);
          const selectionSet = dragSelection.length
            ? new Set(dragSelection.map((value) => String(value)))
            : null;
          const activeColor = seriesColor || DEFAULT_SERIES_COLOR;
          const mutedColor = toRgba(activeColor, 0.2);
          const resolvedColorAccessor = selectionSet
            ? (row) => (selectionSet.has(String(row.__x)) ? activeColor : mutedColor)
            : (seriesColor ? (() => seriesColor) : undefined);
          return (
            <div className="h-full w-full overflow-x-auto overflow-y-hidden">
              <div
                style={{ minWidth: chartWidth, paddingBottom: scrollbarGutter }}
                className="h-full box-border"
              >
                <XYChart
                  width={chartWidth}
                  height={chartHeight}
                  margin={chartMargin}
                  xScale={xScale}
                  yScale={yScale}
                  stacked={stacked}
                >
                  {showGrid && <Grid columns={gridColumns} rows={gridRows} />}
                  <Axis
                    orientation="bottom"
                    tickValues={xTickValues}
                    tickLabelProps={() => ({
                      fontSize: LABEL_FONT_SIZE,
                      textAnchor: 'middle',
                      angle: 0,
                      dx: 0,
                      dy: tickLabelOffset
                    })}
                  />
                  <Axis orientation="left" />

                  {type === 'bar' && (
                    <BarSeries
                      dataKey="series"
                      data={prepared}
                      xAccessor={xAccessor}
                      yAccessor={yAccessor}
                      colorAccessor={resolvedColorAccessor}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerOut={handlePointerOut}
                      onPointerUp={handlePointerUp}
                    />
                  )}
                  {type === 'line' && (
                    <LineSeries
                      dataKey="series"
                      data={prepared}
                      xAccessor={xAccessor}
                      yAccessor={yAccessor}
                      curve={curve}
                      colorAccessor={resolvedColorAccessor}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerOut={handlePointerOut}
                      onPointerUp={handlePointerUp}
                    />
                  )}
                  {type === 'area' && (
                    <AreaSeries
                      dataKey="series"
                      data={prepared}
                      xAccessor={xAccessor}
                      yAccessor={yAccessor}
                      curve={curve}
                      colorAccessor={resolvedColorAccessor}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerOut={handlePointerOut}
                      onPointerUp={handlePointerUp}
                    />
                  )}
                  {type === 'scatter' && (
                    <GlyphSeries
                      dataKey="series"
                      data={prepared}
                      xAccessor={xAccessor}
                      yAccessor={yAccessor}
                      colorAccessor={resolvedColorAccessor}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerOut={handlePointerOut}
                      onPointerUp={handlePointerUp}
                    />
                  )}
                  {showPoints && type !== 'scatter' && (
                    <GlyphSeries
                      dataKey="points"
                      data={prepared}
                      xAccessor={xAccessor}
                      yAccessor={yAccessor}
                      colorAccessor={resolvedColorAccessor}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerOut={handlePointerOut}
                      onPointerUp={handlePointerUp}
                    />
                  )}
                </XYChart>
              </div>
            </div>
          );
        }}
      </ParentSize>
      {showTooltip && tooltip.visible && tooltip.datum && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-gray-200 bg-white/95 px-2 py-1 text-[11px] text-gray-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200"
          style={{
            left: Math.max(8, Math.min(tooltip.x + 12, (tooltip.width || 0) - 160)),
            top: Math.max(8, Math.min(tooltip.y + 12, (tooltip.height || 0) - 80))
          }}
        >
          <div className="font-semibold text-gray-800 dark:text-slate-100">{formatValue(tooltip.datum.__x)}</div>
          <div className="text-gray-500 dark:text-slate-400">{formatValue(tooltip.datum.__y)}</div>
        </div>
      )}
    </div>
  );
};

export default VisxChart;
