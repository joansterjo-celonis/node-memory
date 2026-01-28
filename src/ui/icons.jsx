// src/ui/icons.js
// Inline SVG icons (local, no external CDN).
import {
  createIcon,
  Add,
  ArrowClockwise,
  ArrowCounterclockwise,
  ArrowLeft as FluentArrowLeft,
  ArrowMinimize,
  ArrowTrending,
  Apps,
  Branch,
  CheckmarkSquare,
  ChevronDoubleDown,
  ChevronDoubleUp,
  ChevronDown as FluentChevronDown,
  ChevronRight as FluentChevronRight,
  Code,
  DataBarVertical,
  Database as FluentDatabase,
  Delete,
  Dismiss,
  Edit as FluentEdit,
  Filter as FluentFilter,
  Gauge as FluentGauge,
  Globe as FluentGlobe,
  LayoutCellFour,
  Link as FluentLink,
  MathSymbols,
  NumberSymbol,
  MoreHorizontal as FluentMoreHorizontal,
  Play as FluentPlay,
  Save as FluentSave,
  Settings as FluentSettings,
  Share,
  Table as FluentTable
} from './fluentIconsRegular';

export { createIcon };

// Alias map: existing app icon names -> Fluent UI regular icons.
export const Plus = Add;
export const AppsIcon = Apps;
export const Filter = FluentFilter;
export const BarChart3 = DataBarVertical;
export const Database = FluentDatabase;
export const Trash2 = Delete;
export const Edit = FluentEdit;
export const Settings = FluentSettings;
export const TableIcon = FluentTable;
export const Play = FluentPlay;
export const Save = FluentSave;
export const ChevronRight = FluentChevronRight;
export const ChevronDown = FluentChevronDown;
export const ChevronsDown = ChevronDoubleDown;
export const ChevronsUp = ChevronDoubleUp;
export const Sigma = MathSymbols;
export const Layout = LayoutCellFour;
export const Undo = ArrowCounterclockwise;
export const Redo = ArrowClockwise;
export const ArrowLeft = FluentArrowLeft;
export const Share2 = Share;
export const FileJson = Code;
export const X = Dismiss;
export const GitBranch = Branch;
export const Hash = NumberSymbol;
export const TrendingUp = ArrowTrending;
export const Globe = FluentGlobe;
export const Gauge = FluentGauge;
export const LinkIcon = FluentLink;
export const CheckSquare = CheckmarkSquare;
export const Minimize2 = ArrowMinimize;
export const MoreHorizontal = FluentMoreHorizontal;
