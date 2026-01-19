// src/ui/SimpleChart.js
// Visx chart renderer for richer visualizations.
import React from 'react';
import { ParentSize } from '@visx/responsive';
import { XYChart, Axis, Grid, Tooltip, BarSeries, LineSeries, AreaSeries, GlyphSeries } from '@visx/xychart';
import { curveLinear, curveMonotoneX, curveStep } from '@visx/curve';

const curveMap = {
  linear: curveLinear,
  monotone: curveMonotoneX,
  step: curveStep
};

const resolveDatum = (event) => {
  if (!event) return null;
  if (event.datum) return event.datum;
  if (event.data) return event.data;
  if (event.datum?.datum) return event.datum.datum;
  return event;
};

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  return value;
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
      <div className="h-full flex items-center justify-center text-xs text-gray-400">
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
      <div className="h-full flex items-center justify-center text-xs text-gray-400">
        No numeric values available for this chart
      </div>
    );
  }

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
  const colorAccessor = seriesColor ? (() => seriesColor) : undefined;
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

  const handlePointerDown = (event) => {
    const datum = resolveDatum(event);
    if (!datum) return;
    dragStartRef.current = datum.__x;
  };

  const handlePointerOut = () => {
    dragStartRef.current = null;
  };

  const handlePointerUp = (event) => {
    const datum = resolveDatum(event);
    if (!datum || !onClick) return;
    const startValue = dragStartRef.current;
    const endValue = datum.__x;
    dragStartRef.current = null;
    let selection = null;
    if (startValue !== undefined && startValue !== null && endValue !== undefined && endValue !== null) {
      if (startValue !== endValue) {
        const startIndex = categoryValues.findIndex((value) => String(value) === String(startValue));
        const endIndex = categoryValues.findIndex((value) => String(value) === String(endValue));
        if (startIndex !== -1 && endIndex !== -1) {
          const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          selection = { values: categoryValues.slice(from, to + 1) };
        }
      }
    }
    onClick({ activePayload: [{ payload: datum }], selection });
  };

  return (
    <div className="h-full w-full">
      <ParentSize>
        {({ width, height }) => {
          const resolvedWidth = Math.max(width, 240);
          const resolvedHeight = Math.max(height, 200);
          return (
            <XYChart
              width={resolvedWidth}
              height={resolvedHeight}
              margin={{ top: 16, right: 16, bottom: 32, left: 44 }}
              xScale={xScale}
              yScale={yScale}
              stacked={stacked}
            >
              {showGrid && <Grid columns={gridColumns} rows={gridRows} />}
              <Axis orientation="bottom" />
              <Axis orientation="left" />

              {type === 'bar' && (
                <BarSeries
                  dataKey="series"
                  data={prepared}
                  xAccessor={xAccessor}
                  yAccessor={yAccessor}
                  colorAccessor={colorAccessor}
                  onPointerDown={handlePointerDown}
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
                  colorAccessor={colorAccessor}
                  onPointerDown={handlePointerDown}
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
                  colorAccessor={colorAccessor}
                  onPointerDown={handlePointerDown}
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
                  colorAccessor={colorAccessor}
                  onPointerDown={handlePointerDown}
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
                  colorAccessor={colorAccessor}
                  onPointerDown={handlePointerDown}
                  onPointerOut={handlePointerOut}
                  onPointerUp={handlePointerUp}
                />
              )}

              {showTooltip && (
                <Tooltip
                  snapTooltipToDatumX
                  snapTooltipToDatumY
                  showSeriesGlyphs
                  renderTooltip={({ tooltipData }) => {
                    const nearest = tooltipData?.nearestDatum?.datum;
                    if (!nearest) return null;
                    return (
                      <div className="text-xs">
                        <div className="font-semibold text-gray-800">{formatValue(nearest.__x)}</div>
                        <div className="text-gray-500">{formatValue(nearest.__y)}</div>
                      </div>
                    );
                  }}
                />
              )}
            </XYChart>
          );
        }}
      </ParentSize>
    </div>
  );
};

export default VisxChart;
