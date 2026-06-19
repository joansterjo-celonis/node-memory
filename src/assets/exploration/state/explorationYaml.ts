// YAML (de)serialisation for Exploration state. The host saves the returned
// string to its knowledge-model / backend and passes it back in as
// `initialStateYaml` on remount.
//
// Transient fields that should not round-trip are stripped on the way out.
//
// NOTE: the `yaml` package is a runtime dependency. In EMS One this is the
// same package bp-board uses; confirm before wiring up.

import YAML from 'yaml';
import type { ExplorationNode, ExplorationStateSnapshot } from './useExplorationState';

export const EXPLORATION_STATE_VERSION = 1 as const;

export interface SerializedExplorationState {
  version: typeof EXPLORATION_STATE_VERSION;
  renderMode: string;
  nodes: ExplorationNode[];
  selection: { nodeId: string | null };
  branches: {
    selection: Record<string, string>;
    entangledColors: Record<string, string>;
  };
  density?: 'comfortable' | 'dense';
}

export interface StateSummary {
  nodeCount: number;
  branchCount: number;
  leafCount: number;
  datasetCount: number;
  referencedTables: string[];
}

const TRANSIENT_NODE_KEYS: Array<keyof ExplorationNode> = ['isExpanded'];
const TRANSIENT_PARAM_KEYS = ['__files', 'assistantStatus', 'assistantError', 'assistantLlmError'];

function stripTransient(node: ExplorationNode): ExplorationNode {
  const next: ExplorationNode = { ...node };
  TRANSIENT_NODE_KEYS.forEach((key) => {
    delete (next as any)[key];
  });
  if (next.params && typeof next.params === 'object') {
    const params = { ...next.params };
    TRANSIENT_PARAM_KEYS.forEach((key) => {
      delete params[key];
    });
    next.params = params;
  }
  return next;
}

function stableKeyOrder<T extends Record<string, any>>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const keys = Object.keys(value).sort();
  const out: Record<string, any> = {};
  keys.forEach((k) => {
    const v = value[k];
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) ? stableKeyOrder(v) : v;
  });
  return out as T;
}

export function toSerialized(snapshot: ExplorationStateSnapshot): SerializedExplorationState {
  return {
    version: EXPLORATION_STATE_VERSION,
    renderMode: snapshot.renderMode,
    nodes: snapshot.nodes.map(stripTransient),
    selection: { nodeId: snapshot.selectedNodeId || null },
    branches: {
      selection: snapshot.branchSelectionByNodeId || {},
      entangledColors: snapshot.entangledColors || {},
    },
  };
}

export function toYaml(snapshot: ExplorationStateSnapshot): string {
  const serialized = toSerialized(snapshot);
  // Stable key order for diff-friendly output.
  const stable = {
    version: serialized.version,
    renderMode: serialized.renderMode,
    selection: stableKeyOrder(serialized.selection),
    branches: {
      selection: stableKeyOrder(serialized.branches.selection),
      entangledColors: stableKeyOrder(serialized.branches.entangledColors),
    },
    nodes: serialized.nodes.map((n) => stableKeyOrder(n)),
  };
  return YAML.stringify(stable, { indent: 2, lineWidth: 0 });
}

export function fromYaml(yaml: string): SerializedExplorationState | null {
  if (!yaml || typeof yaml !== 'string') return null;
  let parsed: any;
  try {
    parsed = YAML.parse(yaml);
  } catch {
    return null;
  }
  return migrate(parsed);
}

export function migrate(raw: any): SerializedExplorationState | null {
  if (!raw || typeof raw !== 'object') return null;
  const version = Number(raw.version) || 1;
  // v1 is the only version today; keep a migration scaffold for the future.
  if (version !== EXPLORATION_STATE_VERSION) {
    // Future migrations go here. For now, reject unknown versions.
    return null;
  }
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  return {
    version: EXPLORATION_STATE_VERSION,
    renderMode: typeof raw.renderMode === 'string' ? raw.renderMode : 'classic',
    nodes,
    selection: { nodeId: raw.selection?.nodeId ?? null },
    branches: {
      selection: raw.branches?.selection || {},
      entangledColors: raw.branches?.entangledColors || {},
    },
    density: raw.density === 'dense' ? 'dense' : raw.density === 'comfortable' ? 'comfortable' : undefined,
  };
}

export function summarize(state: SerializedExplorationState): StateSummary {
  const byParent = new Map<string | null, ExplorationNode[]>();
  state.nodes.forEach((n) => {
    const list = byParent.get(n.parentId ?? null) || [];
    list.push(n);
    byParent.set(n.parentId ?? null, list);
  });
  const leafCount = state.nodes.filter((n) => !byParent.has(n.id)).length;
  const branchCount = state.nodes.filter((n) => !!n.branchName).length;
  const datasetCount = state.nodes.filter((n) => !!n.params?.isDataset).length;
  const referencedTables = Array.from(
    new Set(
      state.nodes
        .flatMap((n) => [n.params?.table, n.params?.inheritedTable, n.params?.rightTable])
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    )
  );
  return {
    nodeCount: state.nodes.length,
    branchCount,
    leafCount,
    datasetCount,
    referencedTables,
  };
}
