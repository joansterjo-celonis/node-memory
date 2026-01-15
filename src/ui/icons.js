// src/ui/icons.js
// Inline SVG icons so the app stays fully static (no build step, no icon CDN).
const React = window.React;

const createIcon = (paths) => (props) => {
  const size = props.size || 24;
  const strokeWidth = props.strokeWidth || 2;
  const className = props.className || '';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {Array.isArray(paths)
        ? paths.map((d, i) => <path key={i} d={d} />)
        : <path d={paths} />}
    </svg>
  );
};

// Export all icons on a single global to avoid module imports.
window.Icons = {
  createIcon,
  Plus: createIcon('M5 12h14M12 5v14'),
  Filter: createIcon(['M22 3H2l8 9.46V19l4 2v-8.54L22 3z']),
  BarChart3: createIcon(['M3 3v18h18', 'M18 17V9', 'M13 17V5', 'M8 17v-3']),
  Database: createIcon(['M21 5c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2s.9-2 2-2h14c1.1 0 2 .9 2 2z', 'M21 12c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2s.9-2 2-2h14c1.1 0 2 .9 2 2z', 'M21 19c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2s.9-2 2-2h14c1.1 0 2 .9 2 2z']),
  Trash2: createIcon(['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2']),
  Settings: createIcon(['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', 'M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0']),
  TableIcon: createIcon(['M12 3v18', 'M3 12h18', 'M3 3h18v18H3z']),
  Play: createIcon('M5 3l14 9-14 9V3z'),
  Save: createIcon(['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z', 'M17 21v-8H7v8', 'M7 3v5h8']),
  ChevronRight: createIcon('M9 18l6-6-6-6'),
  ChevronDown: createIcon('M6 9l6 6 6-6'),
  ChevronsDown: createIcon('M7 7l5 5 5-5M7 12l5 5 5-5'),
  ChevronsUp: createIcon('M7 17l5-5 5 5M7 12l5-5 5 5'),
  Sigma: createIcon('M18 7c0 2-2 4-4 4H8M14 7c0-2-2-4-4-4M10 21V3'),
  Layout: createIcon(['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'M3.27 6.96L12 12.01l8.73-5.05', 'M12 22.08V12']),
  Undo: createIcon(['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13']),
  Redo: createIcon(['M21 7v6h-6', 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13']),
  Share2: createIcon(['M18 8a3 3 0 1 0-2.977-2.63l-4.94 2.47a3 3 0 1 0 0 4.319l4.94 2.47a3 3 0 1 0 .895-1.789l-4.94-2.47a3.027 3.027 0 0 0 0-.74l4.94-2.47C18.456 8.778 18 8.402 18 8z']),
  FileJson: createIcon(['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1', 'M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1']),
  X: createIcon('M18 6L6 18M6 6l12 12'),
  GitBranch: createIcon(['M6 3v12', 'M18 21v-6', 'M6 15a4 4 0 0 0 4 4h8']),
  Hash: createIcon(['M4 9h16', 'M4 15h16', 'M10 3L8 21', 'M16 3l-2 18']),
  TrendingUp: createIcon(['M23 6l-9.5 9.5-5-5L1 18', 'M17 6h6v6']),
  Gauge: createIcon(['M12 22a8 8 0 1 0-8-8', 'M12 14l3-3']),
  LinkIcon: createIcon(['M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0 0-7.07 5 5 0 0 0-7.07 0L10 6', 'M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 0 7.07 5 5 0 0 0 7.07 0L14 18']),
  CheckSquare: createIcon(['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11']),
  Minimize2: createIcon(['M4 14h6v6', 'M20 10h-6V4'])
};
