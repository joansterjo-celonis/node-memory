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
  showTooltip = true
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

  const sample = prepared.slice(0, 12);
  const numericCount = sample.filter((row) => Number.isFinite(Number(row.__x))).length;
  const isNumericX = numericCount >= Math.ceil(sample.length / 2);
  const xAccessor = (row) => (isNumericX ? Number(row.__x) : String(row.__x));
  const yAccessor = (row) => row.__y;
  const curve = curveMap[curveType] || curveLinear;

  const handlePointerUp = (event) => {
    const datum = resolveDatum(event);
    if (!datum || !onClick) return;
    onClick({ activePayload: [{ payload: datum }] });
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
              xScale={{ type: isNumericX ? 'linear' : 'band' }}
              yScale={{ type: 'linear', nice: true, zero: true }}
              stacked={stacked}
            >
              {showGrid && <Grid columns={!isNumericX} rows />}
              <Axis orientation="bottom" />
              <Axis orientation="left" />

              {type === 'bar' && (
                <BarSeries
                  dataKey="series"
                  data={prepared}
                  xAccessor={xAccessor}
                  yAccessor={yAccessor}
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
                  onPointerUp={handlePointerUp}
                />
              )}
              {type === 'scatter' && (
                <GlyphSeries
                  dataKey="series"
                  data={prepared}
                  xAccessor={xAccessor}
                  yAccessor={yAccessor}
                  onPointerUp={handlePointerUp}
                />
              )}
              {showPoints && type !== 'scatter' && (
                <GlyphSeries
                  dataKey="points"
                  data={prepared}
                  xAccessor={xAccessor}
                  yAccessor={yAccessor}
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
