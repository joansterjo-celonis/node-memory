// Hook that bridges a DataProvider to the in-memory `dataModel` shape the
// alasql-backed dataEngine expects, and produces `chainData` for the node
// graph. Lazy-loads tables referenced by SOURCE/JOIN nodes.

import { useEffect, useMemo, useRef, useState } from 'react';
// @ts-ignore - ported JS module
import { createDataEngine } from '../lib/dataEngine';
// @ts-ignore - ported JS module
import { getCalculationOrder } from '../lib/nodeUtils';
import type { DataProvider, Row, TableMeta } from './DataProvider';
import type { ExplorationNode } from '../state/useExplorationState';

// Maximum rows pulled per table when eagerly materializing for alasql.
// Tables with more rows should either be paged through with cursors or
// pushed to `executeQuery` via the escape hatch.
const DEFAULT_MAX_ROWS_PER_TABLE = 50_000;

interface DataModel {
  tables: Record<string, Row[]>;
  order: string[];
}

interface UseKnowledgeModelTablesOptions {
  provider: DataProvider;
  nodes: ExplorationNode[];
  maxRowsPerTable?: number;
}

interface UseKnowledgeModelTablesResult {
  dataModel: DataModel;
  tableMetadata: TableMeta[];
  chainData: any[];
  dataEngine: any;
  isLoading: boolean;
  error: Error | null;
}

function collectReferencedTables(nodes: ExplorationNode[]): string[] {
  const set = new Set<string>();
  nodes.forEach((n) => {
    const table = n.params?.table;
    const inherited = n.params?.inheritedTable;
    const right = n.params?.rightTable;
    if (table) set.add(table);
    if (inherited) set.add(inherited);
    if (right) set.add(right);
  });
  return Array.from(set);
}

function buildNodeSpec(node: ExplorationNode, parentKey: string, model: DataModel) {
  if (node.params?.isDataset && node.params?.isFlattened && Array.isArray(node.params?.datasetSnapshot?.rows)) {
    return { type: 'DATASET', params: { snapshot: node.params.datasetSnapshot } };
  }
  if (node.type === 'SOURCE') {
    const ingestionMode = node.params?.ingestionMode || 'api';
    const inheritedTable = node.params?.inheritedTable || '';
    const table =
      ingestionMode === 'inherited'
        ? inheritedTable
        : node.params?.table || model?.order?.[0];
    return { type: 'SOURCE', table };
  }
  if (node.type === 'FILTER') {
    return { type: 'FILTER', parentId: node.parentId, parentKey, params: node.params };
  }
  if (node.type === 'AGGREGATE') {
    return { type: 'AGGREGATE', parentId: node.parentId, parentKey, params: node.params };
  }
  if (node.type === 'JOIN') {
    return { type: 'JOIN', parentId: node.parentId, parentKey, params: node.params };
  }
  return { type: 'FILTER', parentId: node.parentId, parentKey, params: {} };
}

export function useKnowledgeModelTables({
  provider,
  nodes,
  maxRowsPerTable = DEFAULT_MAX_ROWS_PER_TABLE,
}: UseKnowledgeModelTablesOptions): UseKnowledgeModelTablesResult {
  const [tableMetadata, setTableMetadata] = useState<TableMeta[]>([]);
  const [tables, setTables] = useState<Record<string, Row[]>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const inflightRef = useRef<Set<string>>(new Set());

  // Fetch the table catalog once per provider identity.
  useEffect(() => {
    let cancelled = false;
    provider
      .listTables()
      .then((list) => {
        if (cancelled) return;
        setTableMetadata(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  // Lazily load tables referenced by the current node graph.
  const referencedTables = useMemo(() => collectReferencedTables(nodes), [nodes]);

  useEffect(() => {
    let cancelled = false;
    const toLoad = referencedTables.filter(
      (name) => !tables[name] && !inflightRef.current.has(name)
    );
    if (toLoad.length === 0) return;

    toLoad.forEach((name) => inflightRef.current.add(name));
    setIsLoading(true);

    (async () => {
      const loaded: Record<string, Row[]> = {};
      for (const name of toLoad) {
        try {
          const rowsAcc: Row[] = [];
          let cursor: string | undefined;
          // Page through until we hit the row cap or run out.
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const remaining = maxRowsPerTable - rowsAcc.length;
            if (remaining <= 0) break;
            const page = await provider.getRows(name, {
              cursor,
              limit: Math.min(remaining, 5000),
            });
            rowsAcc.push(...page.rows);
            if (!page.nextCursor || page.rows.length === 0) break;
            cursor = page.nextCursor;
          }
          loaded[name] = rowsAcc;
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err : new Error(String(err)));
          }
        } finally {
          inflightRef.current.delete(name);
        }
      }
      if (cancelled) return;
      setTables((prev) => ({ ...prev, ...loaded }));
      setOrder((prev) => {
        const next = [...prev];
        Object.keys(loaded).forEach((name) => {
          if (!next.includes(name)) next.push(name);
        });
        return next;
      });
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [provider, referencedTables, tables, maxRowsPerTable]);

  const dataModel: DataModel = useMemo(() => ({ tables, order }), [tables, order]);

  const dataEngine = useMemo(
    () => (createDataEngine as any)(dataModel, { externalTables: {} }),
    [dataModel]
  );

  const chainData = useMemo(() => {
    const orderedNodes = getCalculationOrder(nodes) as ExplorationNode[];
    const results: any[] = [];
    const validIds = new Set(nodes.map((n) => n.id));

    orderedNodes.forEach((node) => {
      const parentKey = node.parentId ? dataEngine.getQueryKey(node.parentId) : '';
      const spec = buildNodeSpec(node, parentKey, dataModel);
      const query = dataEngine.ensureQuery(node.id, spec);
      const sampleRows = dataEngine.getSampleRows(node.id, dataEngine.DEFAULT_SAMPLE_SIZE, '', '');
      results.push({
        nodeId: node.id,
        queryId: node.id,
        schema: query.schema || [],
        rowCount: query.rowCount || 0,
        error: query.error || '',
        data: sampleRows,
        sampleRows,
        getRowAt: (index: number, sortBy: string, sortDirection: string) =>
          dataEngine.getRowAt(node.id, index, sortBy, sortDirection),
        getRows: (range: any, sortBy: string, sortDirection: string) =>
          dataEngine.getRows(node.id, { ...range, sortBy, sortDirection }),
        getMetric: (fn: string, field: string) => dataEngine.getMetric(node.id, fn, field),
        getPivotData: (args: any) => dataEngine.getPivotData(node.id, args),
        getAggregatedRows: (args: any) => dataEngine.getAggregatedRows(node.id, args),
        getSampleRows: (size: number, sortBy: string, sortDirection: string) =>
          dataEngine.getSampleRows(node.id, size, sortBy, sortDirection),
        getColumnStats: (field: string) => dataEngine.getColumnStats(node.id, field),
      });
    });
    dataEngine.pruneQueries(validIds);
    return results;
  }, [nodes, dataEngine, dataModel]);

  return { dataModel, tableMetadata, chainData, dataEngine, isLoading, error };
}
