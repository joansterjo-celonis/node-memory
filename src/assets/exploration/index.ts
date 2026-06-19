// Public exports for the Exploration asset.
//
// Import `./styles/exploration.css` once at the host's entry point so the
// scoped Tailwind build is applied to the asset root. The CSS is emitted by
// the asset-local `tailwind.config.cjs` pass.

export { default as ExplorationAsset, default } from './ExplorationAsset';
export type {
  ExplorationAssetProps,
  ExplorationCapabilities,
} from './ExplorationAsset';

export { mountExplorationAsset } from './mount';
export type { ExplorationMountHandle } from './mount';

export type {
  DataProvider,
  TableMeta,
  Column,
  ColumnDataType,
  TableKind,
  Row,
  RowsPage,
  GetRowsOptions,
  ExecuteQueryResult,
} from './data/DataProvider';
export { createInMemoryDataProvider } from './data/DataProvider';

export {
  toYaml,
  fromYaml,
  toSerialized,
  summarize,
  migrate,
  EXPLORATION_STATE_VERSION,
} from './state/explorationYaml';
export type {
  SerializedExplorationState,
  StateSummary,
} from './state/explorationYaml';

export type {
  ExplorationNode,
  ExplorationStateSnapshot,
} from './state/useExplorationState';
