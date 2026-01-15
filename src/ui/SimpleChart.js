// src/ui/SimpleChart.js
// A tiny SVG chart (bar/line) to keep the static build lightweight.
const React = window.React;

const SimpleChart = ({ data, xAxis, yAxis, type, onClick }) => {
  if (!xAxis || !yAxis || !data || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-400">
        Configure axes to view a chart
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => Number(d[yAxis]) || 0), 1);
  const width = 300;
  const height = 140;
  const padding = 24;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="cursor-pointer">
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#E5E7EB" />

      {type === 'line' ? (
        <polyline
          fill="none"
          stroke="#3B82F6"
          strokeWidth="2"
          points={data.map((d, i) => {
            const x = padding + (i * (width - 2 * padding) / Math.max(1, data.length - 1));
            const y = height - padding - ((Number(d[yAxis]) || 0) / maxValue) * (height - 2 * padding);
            return `${x},${y}`;
          }).join(' ')}
        />
      ) : (
        data.map((d, i) => {
          const x = padding + (i * (width - 2 * padding) / data.length);
          const barW = (width - 2 * padding) / data.length * 0.6;
          const h = ((Number(d[yAxis]) || 0) / maxValue) * (height - 2 * padding);
          return (
            <rect
              key={i}
              x={x - barW / 2}
              y={height - padding - h}
              width={barW}
              height={h}
              fill="#3B82F6"
              onClick={() => onClick && onClick({ activePayload: [{ payload: d }] })}
            />
          );
        })
      )}
    </svg>
  );
};

window.SimpleChart = SimpleChart;
