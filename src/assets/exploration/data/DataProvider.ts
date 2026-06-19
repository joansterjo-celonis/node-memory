// DataProvider: abstract interface between the Exploration asset and the
// EMS One knowledge-model. Intentionally decoupled from any specific HTTP
// client or auth strategy; the host supplies a concrete implementation
// (mirror the shape used by bp-board's asset).

export type Row = Record<string, any>;

export type ColumnDataType = 'string' | 'number' | 'boolean' | 'date' | 'unknown';

export interface Column {
  name: string;
  dtype?: ColumnDataType;
  nullable?: boolean;
}

export type TableKind = 'entity' | 'view' | 'dataset' | 'external';

export interface TableMeta {
  name: string;
  label?: string;
  rowCount?: number;
  schema?: Column[];
  kind?: TableKind;
}

export interface GetRowsOptions {
  cursor?: string;
  limit?: number;
  fields?: string[];
}

export interface RowsPage {
  rows: Row[];
  nextCursor?: string;
}

export interface ExecuteQueryResult {
  schema: Column[];
  rows: Row[];
  rowCount: number;
}

export interface DataProvider {
  listTables(): Promise<TableMeta[]>;
  getSchema(tableName: string): Promise<Column[]>;
  getRows(tableName: string, opts?: GetRowsOptions): Promise<RowsPage>;
  /**
   * Optional escape hatch. When present, the asset can delegate large-table
   * transformations to the backend instead of running them through alasql.
   * Invoked only when tableMeta.rowCount exceeds the local threshold.
   */
  executeQuery?(sql: string, bindings?: Record<string, unknown>): Promise<ExecuteQueryResult>;
}

/**
 * In-memory provider backed by a plain `{ name -> rows[] }` map. Useful for
 * tests, Storybook, and early integration before the EMS data provider is
 * wired up. Not exported as default — host apps should supply their own.
 */
export function createInMemoryDataProvider(
  tables: Record<string, Row[]>,
  labels: Record<string, string> = {}
): DataProvider {
  const schemaFromRows = (rows: Row[]): Column[] => {
    const keys = new Set<string>();
    rows.slice(0, 25).forEach((row) => {
      Object.keys(row || {}).forEach((key) => keys.add(key));
    });
    return Array.from(keys).map((name) => ({ name, dtype: 'unknown' }));
  };

  return {
    async listTables(): Promise<TableMeta[]> {
      return Object.keys(tables).map((name) => ({
        name,
        label: labels[name] || name,
        rowCount: tables[name]?.length || 0,
        kind: 'entity',
      }));
    },
    async getSchema(tableName: string): Promise<Column[]> {
      const rows = tables[tableName] || [];
      return schemaFromRows(rows);
    },
    async getRows(tableName: string, opts: GetRowsOptions = {}): Promise<RowsPage> {
      const rows = tables[tableName] || [];
      if (!opts.limit) return { rows };
      const offset = opts.cursor ? Number(opts.cursor) || 0 : 0;
      const slice = rows.slice(offset, offset + opts.limit);
      const nextCursor =
        offset + opts.limit < rows.length ? String(offset + opts.limit) : undefined;
      return { rows: slice, nextCursor };
    },
  };
}
