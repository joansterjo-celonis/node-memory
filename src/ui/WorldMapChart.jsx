// src/ui/WorldMapChart.jsx
// Visx-based choropleth world map.
import React from 'react';
import { ParentSize } from '@visx/responsive';
import { Mercator } from '@visx/geo';
import { feature } from 'topojson-client';
import { geoMercator } from 'd3-geo';
import worldData from 'world-atlas/countries-110m.json';
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';

const DEFAULT_MAP_COLOR = '#2563eb';
const EMPTY_COLOR = '#e2e8f0';

try {
  countries.registerLocale(enLocale);
} catch (err) {
  // Ignore repeated registration in hot reload environments.
}

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  return value;
};

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

const interpolateColor = (start, end, t) => {
  const startRgb = hexToRgb(start);
  const endRgb = hexToRgb(end);
  if (!startRgb || !endRgb) return end;
  const clamp = Math.max(0, Math.min(1, t));
  const r = Math.round(startRgb.r + (endRgb.r - startRgb.r) * clamp);
  const g = Math.round(startRgb.g + (endRgb.g - startRgb.g) * clamp);
  const b = Math.round(startRgb.b + (endRgb.b - startRgb.b) * clamp);
  return `rgb(${r}, ${g}, ${b})`;
};

const toNumericIso = (value) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toUpperCase();
  if (!raw) return null;
  if (/^\d{3}$/.test(raw)) return raw;
  const numeric = countries.alpha3ToNumeric(raw);
  if (!numeric) return null;
  return String(numeric).padStart(3, '0');
};

const WorldMapChart = ({ data, codeKey = 'code', valueKey = 'value', seriesColor, showTooltip = true }) => {
  const containerRef = React.useRef(null);
  const [tooltip, setTooltip] = React.useState({ visible: false, x: 0, y: 0, width: 0, height: 0, datum: null });

  const world = React.useMemo(() => {
    const collection = feature(worldData, worldData.objects.countries);
    return {
      features: collection.features || [],
      geojson: collection
    };
  }, []);

  const valueById = React.useMemo(() => {
    const map = new Map();
    (data || []).forEach((row) => {
      const codeValue = row?.[codeKey];
      const numeric = toNumericIso(codeValue);
      if (!numeric) return;
      const rawValue = row?.[valueKey];
      const value = Number(rawValue);
      map.set(String(numeric), Number.isNaN(value) ? 0 : value);
    });
    return map;
  }, [data, codeKey, valueKey]);

  const valueRange = React.useMemo(() => {
    const values = Array.from(valueById.values()).filter((val) => Number.isFinite(val));
    if (values.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [valueById]);

  const handlePointerMove = (event, featureItem, value) => {
    if (!containerRef.current) return;
    const sourceEvent = event?.nativeEvent || event;
    if (!sourceEvent?.clientX) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: sourceEvent.clientX - rect.left,
      y: sourceEvent.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      datum: { feature: featureItem, value }
    });
  };

  const handlePointerLeave = () => {
    setTooltip((prev) => (prev.visible ? { ...prev, visible: false, datum: null } : prev));
  };

  const baseColor = seriesColor || DEFAULT_MAP_COLOR;
  const range = valueRange.max - valueRange.min;
  const isUniform = range === 0;
  const normalizedRange = isUniform ? 1 : range;

  return (
    <div className="h-full w-full relative" ref={containerRef}>
      <ParentSize>
        {({ width, height }) => {
          const resolvedWidth = Math.max(width, 240);
          const resolvedHeight = Math.max(height, 200);
          const projection = geoMercator().fitSize([resolvedWidth, resolvedHeight], world.geojson);
          const scale = projection.scale();
          const translate = projection.translate();
          return (
            <svg width={resolvedWidth} height={resolvedHeight}>
              <Mercator data={world.features} scale={scale} translate={translate}>
                {({ features, path }) => (
                  <g>
                    {features.map(({ feature: mapFeature }) => {
                      const id = mapFeature.id != null ? String(mapFeature.id) : '';
                      const value = valueById.get(id);
                      const fill = value === undefined
                        ? EMPTY_COLOR
                        : interpolateColor(
                          EMPTY_COLOR,
                          baseColor,
                          isUniform ? 0.85 : (value - valueRange.min) / normalizedRange
                        );
                      return (
                        <path
                          key={id}
                          d={path(mapFeature) || ''}
                          fill={fill}
                          stroke="#ffffff"
                          strokeWidth={0.5}
                          onPointerMove={(event) => handlePointerMove(event, mapFeature, value)}
                          onPointerLeave={handlePointerLeave}
                        />
                      );
                    })}
                  </g>
                )}
              </Mercator>
            </svg>
          );
        }}
      </ParentSize>
      {showTooltip && tooltip.visible && tooltip.datum && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-gray-200 bg-white/95 px-2 py-1 text-[11px] text-gray-700 shadow-sm"
          style={{
            left: Math.max(8, Math.min(tooltip.x + 12, (tooltip.width || 0) - 160)),
            top: Math.max(8, Math.min(tooltip.y + 12, (tooltip.height || 0) - 80))
          }}
        >
          <div className="font-semibold text-gray-800">
            {tooltip.datum.feature?.properties?.name
              || countries.numericToAlpha3?.(tooltip.datum.feature?.id)
              || 'Unknown'}
          </div>
          <div className="text-gray-500">{formatValue(tooltip.datum.value)}</div>
        </div>
      )}
    </div>
  );
};

export default WorldMapChart;
