# Exploration Asset

Self-contained React+TypeScript folder bundle extracted from the
`figma-quiz` prototype, designed to drop into **EMS One FE** (Angular host)
as a standalone asset.

## Quick start

1. Copy this entire folder into `src/assets/exploration/` in the EMS
   repository.
2. Add the runtime dependencies listed below to EMS's `package.json`.
3. Wire the host's Tailwind pipeline so it compiles `tailwind.config.cjs`
   in this folder and emits `styles/exploration.css`. (Or add this folder
   to the host's existing Tailwind `content` array if that's simpler. The
   `important: '.exploration-asset'` rule scopes all generated classes.)
4. Import the CSS once: `import '@ems/assets/exploration/styles/exploration.css'`.
5. Use one of the two entry points below.

### React host

```tsx
import {
  ExplorationAsset,
  createInMemoryDataProvider,
} from './assets/exploration';

export function Demo() {
  const provider = createInMemoryDataProvider({
    orders: [{ id: 1, region: 'NA', revenue: 120 } /* ... */],
  });
  return (
    <ExplorationAsset
      assetId="demo"
      dataProvider={provider}
      onStateChange={(yaml) => console.log(yaml)}
    />
  );
}
```

### Angular host (imperative mount)

```ts
import { mountExplorationAsset, ExplorationMountHandle } from './assets/exploration';

@Component({ selector: 'ems-exploration', template: '<div #host></div>' })
export class ExplorationHostComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  private handle?: ExplorationMountHandle;

  ngAfterViewInit() {
    this.handle = mountExplorationAsset(this.host.nativeElement, {
      assetId: this.assetId,
      dataProvider: this.knowledgeModelProvider, // your DataProvider impl
      initialStateYaml: this.yaml,
      onStateChange: (yaml) => this.onDirty(yaml),
      theme: this.themeService.isDark ? 'dark' : 'light',
    });
  }
  ngOnDestroy() { this.handle?.unmount(); }
}
```

A web-component wrapper is an alternative integration the EMS team may
prefer (see the plan §9); it's deliberately not included here so we can
match whatever pattern `bp-board` already uses.

## Folder layout

```
exploration/
  ExplorationAsset.tsx       top-level entry (React)
  ExplorationAssetView.tsx   canvas switch (tree / free-layout)
  mount.ts                   imperative mount for non-React hosts
  index.ts                   public exports
  components/                UI
    TreeNode.tsx             TreeNode + FreeLayoutCanvas (3,317 LOC)
    TablePreview.tsx         virtualized table w/ column stats
    PropertiesPanel.tsx      right rail — step config
    ColumnStatsPanel.tsx     stats for selected node
    GraphMinimapPanel.tsx    overlay minimap
    HelpModal.tsx            in-asset docs
    ui/                      shadcn primitives (scoped)
  charts/                    visx + d3 chart renderers
    SimpleChart.tsx
    WorldMapChart.tsx
  icons.ts                   curated re-exports from lucide-react
  lib/                       pure logic
    dataEngine.ts            alasql-backed query engine
    nodeUtils.ts             graph traversal helpers
    filterUtils.ts           filter normalisation
    minimapLayout.ts         shared layout for the minimap
    constants.ts             pruned constants (no session storage)
    cn.ts                    clsx + tailwind-merge
  state/
    useExplorationState.ts   node graph state + history + filters
    explorationYaml.ts       YAML (de)serialisation
  data/
    DataProvider.ts          abstract provider interface + helpers
    useKnowledgeModelTables.ts  provider -> alasql adapter
  styles/
    exploration.css          scoped Tailwind + design tokens
  tailwind.config.cjs        asset-local Tailwind (important-scoped)
```

## Public API

See `ExplorationAsset.tsx` for the full `ExplorationAssetProps` type. Key
props:

| Prop                | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `assetId`           | Stable id from EMS (keys the asset instance).                           |
| `dataProvider`      | The knowledge-model bridge. See `data/DataProvider.ts`.                 |
| `initialStateYaml`  | Hydrate from a YAML string previously emitted by `onStateChange`.       |
| `onStateChange`     | Called with a new YAML snapshot and a summary whenever state changes.   |
| `capabilities`      | Toggle free-layout / minimap / mobile / panels / help / AI assistant.   |
| `theme`             | `'light' \| 'dark' \| 'auto'` (applied via a root class, no global).     |
| `density`           | Table density.                                                          |
| `readOnly`          | Disables node mutation and save.                                        |
| `onRequestSave`     | If provided, a Save button appears in the header (enabled when dirty).  |
| `onAssistantRequest`| Host-supplied LLM hook. Only called when `capabilities.aiAssistant`.    |

## DataProvider contract

Defined in `data/DataProvider.ts`:

```ts
interface DataProvider {
  listTables(): Promise<TableMeta[]>;
  getSchema(name: string): Promise<Column[]>;
  getRows(name: string, opts?: GetRowsOptions): Promise<RowsPage>;
  executeQuery?(sql: string, bindings?: Record<string, unknown>): Promise<ExecuteQueryResult>;
}
```

`useKnowledgeModelTables` lazily pages through `getRows` for each table
referenced by SOURCE/JOIN nodes and hydrates the in-memory dataModel that
`createDataEngine` operates on. `executeQuery` is an optional escape hatch
for backend-side SQL.

The concrete EMS implementation should match `bp-board`'s provider (auth
headers, pagination shape, retry policy) — that's deliberately left
unspecified here.

## YAML state format

`toYaml(snapshot)` emits stable, diff-friendly YAML that looks like:

```yaml
version: 1
renderMode: classic
selection:
  nodeId: node-start
branches:
  selection: {}
  entangledColors: {}
nodes:
  - branchName: Main
    id: node-start
    isExpanded: true          # stripped on ser, shown here for clarity
    params:
      ingestionMode: api
      inheritedTable: ''
      table: null
    parentId: null
    title: Load Raw Data
    type: SOURCE
```

Transient fields (`isExpanded`, `__files`, assistant runtime status) are
stripped so the YAML only contains user-meaningful configuration.

## Dependencies

Add to EMS's `package.json`:

```
"alasql",
"clsx",
"class-variance-authority",
"tailwind-merge",
"lucide-react",
"@tanstack/react-table",
"@tanstack/react-virtual",
"@visx/curve",
"@visx/responsive",
"@visx/xychart",
"@visx/geo",
"d3-geo",
"topojson-client",
"world-atlas",
"i18n-iso-countries",
"yaml",
"@radix-ui/react-checkbox",
"@radix-ui/react-dialog",
"@radix-ui/react-dropdown-menu",
"@radix-ui/react-label",
"@radix-ui/react-popover",
"@radix-ui/react-progress",
"@radix-ui/react-radio-group",
"@radix-ui/react-select",
"@radix-ui/react-separator",
"@radix-ui/react-slider",
"@radix-ui/react-slot",
"@radix-ui/react-switch",
"@radix-ui/react-tabs",
"@radix-ui/react-tooltip"
```

Dev deps (only needed for the asset's Tailwind pass if it's separate from
the host's): `tailwindcss`, `tailwindcss-animate`, `postcss`, `autoprefixer`.

Peer: `react`, `react-dom` (from host).

## What's NOT in this bundle

Intentionally left behind in `figma-quiz`:

- Landing / explorations list / workbench dependency graph
- Raw Dataset asset (`RawDatasetAssetView`)
- SQL Transformation asset (`SqlTransformationAssetView`)
- File ingestion (CSV/XLSX upload, `utils/ingest.js`, XLSX CDN, sample
  file). Ingestion controls inside `PropertiesPanel` remain for the
  manual-mode SOURCE node, but no `onIngest`/`onClearData` wiring is
  passed in by default — those surface as no-ops.
- Local `nma-session-v1` / `nma-explorations` localStorage persistence
- Theme + density global dropdowns (the asset takes both as props)
- AI Assistant LLM wiring (shell is preserved behind `capabilities.aiAssistant`;
  LLM call is a host-provided callback)

## TODO for the EMS-side integration

- [ ] Pick a React-in-Angular mount strategy (web-component vs imperative
      mount vs iframe) to match `bp-board`.
- [ ] Implement the concrete `DataProvider` against the knowledge-model
      endpoints.
- [ ] Decide where / when YAML snapshots are saved (debounce + retry).
- [ ] Wire the AI Assistant callback (optional; capability-gated).
- [ ] Confirm bundle-size budget around `world-atlas` + `i18n-iso-countries`
      (lazy-load if needed).
