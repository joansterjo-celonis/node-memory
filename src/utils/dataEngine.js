// src/utils/dataEngine.js
// Lightweight in-browser data engine for large datasets.
import { normalizeFilters } from './filterUtils';

const DEFAULT_SAMPLE_SIZE = 200;
const DEFAULT_CHART_SAMPLE_SIZE = 5000;
const DEFAULT_TOP_VALUES = 6;

const compareValues = (aRaw, bRaw) => {
  if (aRaw == null && bRaw == null) return 0;
  if (aRaw == null) return 1;
  if (bRaw == null) return -1;
  const aNum = Number(aRaw);
  const bNum = Number(bRaw);
  const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);
  if (bothNumeric) {
    if (aNum === bNum) return 0;
    return aNum - bNum;
  }
  const aText = String(aRaw);
  const bText = String(bRaw);
  return aText.localeCompare(bText, undefined, { numeric: true, sensitivity: 'base' });
};

const normalizeJoinValue = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return String(value);
};

const deriveSchemaFromRows = (rows, sampleSize = 10) => {
  const uniqueKeys = new Set();
  if (rows && rows.length > 0) {
    rows.slice(0, sampleSize).forEach((row) => {
      Object.keys(row || {}).forEach((key) => uniqueKeys.add(key));
    });
  }
  return Array.from(uniqueKeys);
};

const buildFilterPredicate = (field, operator, rawValue) => {
  if (!field) return () => true;
  const value = rawValue;
  if (operator === 'in') {
    const list = Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean)
      : String(value || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
    if (list.length === 0) return () => true;
    return (row) => list.some((item) => String(row?.[field]) == item);
  }

  return (row) => {
    const cell = row?.[field];
    if (value === null || value === undefined || value === '') return true;
    if (operator === 'equals') return String(cell) == String(value);
    if (operator === 'not_equals') return String(cell) != String(value);
    if (operator === 'gt') return Number(cell) > Number(value);
    if (operator === 'lt') return Number(cell) < Number(value);
    if (operator === 'gte') return Number(cell) >= Number(value);
    if (operator === 'lte') return Number(cell) <= Number(value);
    if (operator === 'contains') return String(cell).toLowerCase().includes(String(value).toLowerCase());
    return true;
  };
};

const createDataEngine = (dataModel = { tables: {}, order: [] }) => {
  const tables = dataModel?.tables || {};
  const queries = new Map();

  const getTableRows = (tableName) => (Array.isArray(tables?.[tableName]) ? tables[tableName] : []);
  const getTableSchema = (tableName) => deriveSchemaFromRows(getTableRows(tableName));

  const resolveRow = (query, index) => {
    if (!query || index == null || index < 0) return null;
    if (query.mode === 'materialized') {
      return query.rows?.[index] ?? null;
    }
    const parent = query.parentId ? queries.get(query.parentId) : null;
    const parentIndex = query.rowIds ? query.rowIds[index] : index;
    if (!parent) {
      const tableRows = getTableRows(query.table);
      return tableRows[parentIndex] ?? null;
    }
    return resolveRow(parent, parentIndex);
  };

  const getSortedIndices = (query, sortBy, sortDirection) => {
    if (!query || !sortBy || !sortDirection) return null;
    const cacheKey = `${sortBy}:${sortDirection}`;
    if (query.sortCache.has(cacheKey)) return query.sortCache.get(cacheKey);
    const direction = sortDirection === 'asc' ? 1 : -1;
    const indices = Array.from({ length: query.rowCount }, (_, i) => i);
    indices.sort((a, b) => {
      const aRow = resolveRow(query, a);
      const bRow = resolveRow(query, b);
      const result = compareValues(aRow?.[sortBy], bRow?.[sortBy]);
      if (result === 0) return a - b;
      return result * direction;
    });
    query.sortCache.set(cacheKey, indices);
    return indices;
  };

  const createQueryBase = (id, key, type, parentId) => ({
    id,
    key,
    type,
    parentId,
    mode: 'rows',
    rowCount: 0,
    schema: [],
    table: null,
    rowIds: null,
    rows: null,
    sortCache: new Map(),
    metricCache: new Map(),
    columnStatsCache: new Map(),
    pivotCache: new Map(),
    aggregateCache: new Map(),
    sampleCache: new Map()
  });

  const ensureQuery = (queryId, spec) => {
    const key = JSON.stringify(spec || {});
    const existing = queries.get(queryId);
    if (existing && existing.key === key) return existing;

    const type = spec?.type || 'SOURCE';
    const parentId = spec?.parentId || null;
    const query = createQueryBase(queryId, key, type, parentId);

    if (type === 'SOURCE') {
      const tableName = spec?.table || dataModel?.order?.[0];
      const rows = getTableRows(tableName);
      query.mode = 'rows';
      query.table = tableName || null;
      query.rowCount = rows.length;
      query.schema = getTableSchema(tableName);
      queries.set(queryId, query);
      return query;
    }

    const parent = parentId ? queries.get(parentId) : null;
    if (!parent) {
      queries.set(queryId, query);
      return query;
    }

    if (type === 'FILTER') {
      const params = spec?.params || {};
      const filters = normalizeFilters(params).filter((filter) => filter.field);
      if (filters.length === 0) {
        query.mode = 'rows';
        query.rowIds = null;
        query.rowCount = parent.rowCount;
        query.schema = parent.schema || [];
        queries.set(queryId, query);
        return query;
      }
      const predicates = filters.map((filter) => (
        buildFilterPredicate(filter.field, filter.operator, filter.value)
      ));
      const rowIds = [];
      for (let i = 0; i < parent.rowCount; i += 1) {
        const row = resolveRow(parent, i);
        if (predicates.every((predicate) => predicate(row))) rowIds.push(i);
      }
      query.mode = 'rows';
      query.rowIds = rowIds;
      query.rowCount = rowIds.length;
      query.schema = parent.schema || [];
      queries.set(queryId, query);
      return query;
    }

    if (type === 'AGGREGATE') {
      const params = spec?.params || {};
      const groupBy = params.groupBy;
      const metricField = params.metricField;
      const fn = params.fn || 'count';
      if (!groupBy) {
        query.mode = 'rows';
        query.rowIds = null;
        query.rowCount = parent.rowCount;
        query.schema = parent.schema || [];
        queries.set(queryId, query);
        return query;
      }
      const groups = new Map();

      if (groupBy) {
        for (let i = 0; i < parent.rowCount; i += 1) {
          const row = resolveRow(parent, i);
          const keyValue = row?.[groupBy];
          if (!groups.has(keyValue)) {
            groups.set(keyValue, {
              [groupBy]: keyValue,
              _count: 0,
              _sum: 0,
              _min: null,
              _max: null,
              _distinct: new Set()
            });
          }
          const bucket = groups.get(keyValue);
          bucket._count += 1;
          if (metricField) {
            const rawValue = row?.[metricField];
            const value = Number(rawValue);
            if (!Number.isNaN(value)) {
              bucket._sum += value;
              bucket._min = bucket._min === null ? value : Math.min(bucket._min, value);
              bucket._max = bucket._max === null ? value : Math.max(bucket._max, value);
            }
            bucket._distinct.add(rawValue);
          }
        }
      }

      const rows = Array.from(groups.values()).map((bucket) => {
        const record = { [groupBy]: bucket[groupBy] };
        if (fn === 'sum') record[metricField] = bucket._sum;
        else if (fn === 'avg') record[metricField] = bucket._count ? bucket._sum / bucket._count : 0;
        else if (fn === 'min') record[metricField] = bucket._min ?? 0;
        else if (fn === 'max') record[metricField] = bucket._max ?? 0;
        else if (fn === 'count_distinct') record[metricField] = bucket._distinct.size;
        else record['Record Count'] = bucket._count;
        return record;
      });

      query.mode = 'materialized';
      query.rows = rows;
      query.rowCount = rows.length;
      query.schema = deriveSchemaFromRows(rows);
      queries.set(queryId, query);
      return query;
    }

    if (type === 'JOIN') {
      const params = spec?.params || {};
      const rightTable = params.rightTable;
      if (!rightTable || !params.leftKey || !params.rightKey) {
        query.mode = 'rows';
        query.rowIds = null;
        query.rowCount = parent.rowCount;
        query.schema = parent.schema || [];
        queries.set(queryId, query);
        return query;
      }
      const rightTableData = rightTable ? getTableRows(rightTable) : [];
      const rightTablePrefix = rightTable || 'right';
      const joinedData = [];
      const matchedRightIndices = new Set();
      const joinType = params.joinType || 'LEFT';

      const prefixColumns = (row, prefix) =>
        Object.entries(row || {}).reduce((acc, [key, val]) => {
          acc[`${prefix}_${key}`] = val;
          return acc;
        }, {});

      const rightLookup = new Map();
      rightTableData.forEach((rightRow, rIdx) => {
        const keyValue = normalizeJoinValue(rightRow?.[params.rightKey]);
        if (keyValue === null) return;
        if (!rightLookup.has(keyValue)) rightLookup.set(keyValue, []);
        rightLookup.get(keyValue).push({ row: rightRow, index: rIdx });
      });

      for (let i = 0; i < parent.rowCount; i += 1) {
        const leftRow = resolveRow(parent, i);
        const leftKey = normalizeJoinValue(leftRow?.[params.leftKey]);
        let matchesFound = false;

        if (leftKey !== null && rightLookup.has(leftKey)) {
          matchesFound = true;
          rightLookup.get(leftKey).forEach(({ row, index }) => {
            matchedRightIndices.add(index);
            joinedData.push({ ...leftRow, ...prefixColumns(row, rightTablePrefix) });
          });
        }

        if (!matchesFound && ['LEFT', 'FULL'].includes(joinType)) {
          joinedData.push({ ...leftRow });
        }
      }

      if (['RIGHT', 'FULL'].includes(joinType)) {
        rightTableData.forEach((rightRow, rIdx) => {
          if (!matchedRightIndices.has(rIdx)) {
            joinedData.push({ ...prefixColumns(rightRow, rightTablePrefix) });
          }
        });
      }

      const schema = new Set(deriveSchemaFromRows(joinedData));
      const rightProto = rightTableData?.[0];
      if (rightProto) {
        Object.keys(rightProto).forEach((keyName) => schema.add(`${rightTablePrefix}_${keyName}`));
      }

      query.mode = 'materialized';
      query.rows = joinedData;
      query.rowCount = joinedData.length;
      query.schema = Array.from(schema);
      queries.set(queryId, query);
      return query;
    }

    queries.set(queryId, query);
    return query;
  };

  const pruneQueries = (validIds) => {
    if (!validIds || validIds.size === 0) return;
    Array.from(queries.keys()).forEach((id) => {
      if (!validIds.has(id)) queries.delete(id);
    });
  };

  const getQueryKey = (queryId) => queries.get(queryId)?.key || '';

  const getSchema = (queryId) => queries.get(queryId)?.schema || [];

  const getRowCount = (queryId) => queries.get(queryId)?.rowCount || 0;

  const getRowAt = (queryId, position, sortBy, sortDirection) => {
    const query = queries.get(queryId);
    if (!query || position < 0 || position >= query.rowCount) return null;
    const sortedIndices = getSortedIndices(query, sortBy, sortDirection);
    const index = sortedIndices ? sortedIndices[position] : position;
    return resolveRow(query, index);
  };

  const getRows = (queryId, { start = 0, size = DEFAULT_SAMPLE_SIZE, sortBy, sortDirection } = {}) => {
    const query = queries.get(queryId);
    if (!query || query.rowCount === 0 || size <= 0) return [];
    const end = Math.min(start + size, query.rowCount);
    const rows = [];
    for (let i = start; i < end; i += 1) {
      const row = getRowAt(queryId, i, sortBy, sortDirection);
      if (row) rows.push(row);
    }
    return rows;
  };

  const getSampleRows = (queryId, size = DEFAULT_SAMPLE_SIZE, sortBy, sortDirection) => {
    const query = queries.get(queryId);
    if (!query) return [];
    const cacheKey = `${size}:${sortBy || ''}:${sortDirection || ''}`;
    if (query.sampleCache.has(cacheKey)) return query.sampleCache.get(cacheKey);
    const rows = getRows(queryId, { start: 0, size: Math.min(size, query.rowCount), sortBy, sortDirection });
    query.sampleCache.set(cacheKey, rows);
    return rows;
  };

  const getMetric = (queryId, fn = 'count', field = '') => {
    const query = queries.get(queryId);
    if (!query) return 0;
    const cacheKey = `${fn}:${field || ''}`;
    if (query.metricCache.has(cacheKey)) return query.metricCache.get(cacheKey);
    if (fn === 'count') {
      query.metricCache.set(cacheKey, query.rowCount);
      return query.rowCount;
    }
    let result = 0;
    if (fn === 'count_distinct') {
      const set = new Set();
      for (let i = 0; i < query.rowCount; i += 1) {
        const row = getRowAt(queryId, i);
        const value = row?.[field];
        if (value === null || value === undefined || value === '') continue;
        set.add(value);
      }
      result = set.size;
    } else if (field) {
      const values = [];
      for (let i = 0; i < query.rowCount; i += 1) {
        const row = getRowAt(queryId, i);
        const value = Number(row?.[field]);
        if (!Number.isNaN(value)) values.push(value);
      }
      if (values.length === 0) {
        result = 0;
      } else if (fn === 'sum') {
        result = values.reduce((a, b) => a + b, 0);
      } else if (fn === 'avg') {
        result = values.reduce((a, b) => a + b, 0) / values.length;
      } else if (fn === 'min') {
        result = Math.min(...values);
      } else if (fn === 'max') {
        result = Math.max(...values);
      }
    }
    query.metricCache.set(cacheKey, result);
    return result;
  };

  const getColumnStats = (queryId, field, topN = DEFAULT_TOP_VALUES) => {
    const query = queries.get(queryId);
    if (!query || !field) return null;
    if (query.columnStatsCache.has(field)) return query.columnStatsCache.get(field);
    let nullCount = 0;
    const valueCounts = new Map();
    let numericCount = 0;
    let numericSum = 0;
    let numericMin = null;
    let numericMax = null;

    for (let i = 0; i < query.rowCount; i += 1) {
      const row = getRowAt(queryId, i);
      const value = row?.[field];
      if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
        nullCount += 1;
        continue;
      }
      const display = String(value);
      valueCounts.set(display, (valueCounts.get(display) || 0) + 1);
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        numericCount += 1;
        numericSum += numeric;
        numericMin = numericMin === null ? numeric : Math.min(numericMin, numeric);
        numericMax = numericMax === null ? numeric : Math.max(numericMax, numeric);
      }
    }

    const distinctCount = valueCounts.size;
    const nonNullCount = query.rowCount - nullCount;
    const avg = numericCount > 0 ? numericSum / numericCount : null;
    const topValues = Array.from(valueCounts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true, sensitivity: 'base' });
      })
      .slice(0, topN)
      .map(([value, count]) => ({ value, count }));
    const maxCount = topValues.reduce((acc, item) => Math.max(acc, item.count), 0);

    const stats = {
      totalRows: query.rowCount,
      nullCount,
      nonNullCount,
      distinctCount,
      min: numericMin,
      max: numericMax,
      avg,
      topValues,
      maxCount
    };
    query.columnStatsCache.set(field, stats);
    return stats;
  };

  const getAggregatedRows = (queryId, { groupBy, fn = 'count', metricField = '' } = {}) => {
    const query = queries.get(queryId);
    if (!query || !groupBy) return { rows: [], outputField: metricField || 'Record Count' };
    const cacheKey = `${groupBy}:${fn}:${metricField || ''}`;
    if (query.aggregateCache.has(cacheKey)) return query.aggregateCache.get(cacheKey);
    const groups = new Map();

    for (let i = 0; i < query.rowCount; i += 1) {
      const row = getRowAt(queryId, i);
      const keyValue = row?.[groupBy];
      if (!groups.has(keyValue)) {
        groups.set(keyValue, {
          [groupBy]: keyValue,
          _count: 0,
          _sum: 0,
          _min: null,
          _max: null,
          _distinct: new Set()
        });
      }
      const bucket = groups.get(keyValue);
      bucket._count += 1;
      if (metricField) {
        const rawValue = row?.[metricField];
        const value = Number(rawValue);
        if (!Number.isNaN(value)) {
          bucket._sum += value;
          bucket._min = bucket._min === null ? value : Math.min(bucket._min, value);
          bucket._max = bucket._max === null ? value : Math.max(bucket._max, value);
        }
        bucket._distinct.add(rawValue);
      }
    }

    const outputField = fn === 'count' ? 'Record Count' : metricField;
    const rows = Array.from(groups.values()).map((bucket) => {
      const record = { [groupBy]: bucket[groupBy] };
      if (fn === 'sum') record[metricField] = bucket._sum;
      else if (fn === 'avg') record[metricField] = bucket._count ? bucket._sum / bucket._count : 0;
      else if (fn === 'min') record[metricField] = bucket._min ?? 0;
      else if (fn === 'max') record[metricField] = bucket._max ?? 0;
      else if (fn === 'count_distinct') record[metricField] = bucket._distinct.size;
      else record['Record Count'] = bucket._count;
      return record;
    });

    const payload = { rows, outputField };
    query.aggregateCache.set(cacheKey, payload);
    return payload;
  };

  const getPivotData = (queryId, { rowField, columnField, valueField, fn = 'count' } = {}) => {
    const query = queries.get(queryId);
    if (!query || !rowField || !columnField) return { rowKeys: [], colKeys: [], matrix: [] };
    const cacheKey = `${rowField}:${columnField}:${valueField || ''}:${fn}`;
    if (query.pivotCache.has(cacheKey)) return query.pivotCache.get(cacheKey);
    const rowKeys = [];
    const colKeys = [];
    const rowIndex = new Map();
    const colIndex = new Map();
    const cells = new Map();

    const normalizeKey = (value) => (value === null || value === undefined || value === '' ? '(blank)' : String(value));
    const getCellKey = (rowKey, colKey) => `${rowKey}::${colKey}`;

    const ensureRow = (key) => {
      if (!rowIndex.has(key)) {
        rowIndex.set(key, rowKeys.length);
        rowKeys.push(key);
      }
    };

    const ensureCol = (key) => {
      if (!colIndex.has(key)) {
        colIndex.set(key, colKeys.length);
        colKeys.push(key);
      }
    };

    const ensureCell = (rowKey, colKey) => {
      const key = getCellKey(rowKey, colKey);
      if (!cells.has(key)) {
        cells.set(key, { count: 0, sum: 0, min: null, max: null, distinct: new Set() });
      }
      return cells.get(key);
    };

    for (let i = 0; i < query.rowCount; i += 1) {
      const row = getRowAt(queryId, i);
      const rowKey = normalizeKey(row?.[rowField]);
      const colKey = normalizeKey(row?.[columnField]);
      ensureRow(rowKey);
      ensureCol(colKey);
      const cell = ensureCell(rowKey, colKey);
      cell.count += 1;
      if (valueField) {
        const rawValue = row?.[valueField];
        if (fn === 'count_distinct') cell.distinct.add(rawValue);
        const value = Number(rawValue);
        if (!Number.isNaN(value)) {
          cell.sum += value;
          cell.min = cell.min === null ? value : Math.min(cell.min, value);
          cell.max = cell.max === null ? value : Math.max(cell.max, value);
        }
      }
    }

    const matrix = rowKeys.map((rowKey) =>
      colKeys.map((colKey) => {
        const cell = cells.get(getCellKey(rowKey, colKey));
        if (!cell) return null;
        if (fn === 'count') return cell.count;
        if (fn === 'count_distinct') return cell.distinct.size;
        if (fn === 'sum') return cell.sum;
        if (fn === 'avg') return cell.count ? cell.sum / cell.count : 0;
        if (fn === 'min') return cell.min ?? 0;
        if (fn === 'max') return cell.max ?? 0;
        return 0;
      })
    );

    const payload = { rowKeys, colKeys, matrix, fn, rowField, columnField };
    query.pivotCache.set(cacheKey, payload);
    return payload;
  };

  return {
    DEFAULT_SAMPLE_SIZE,
    DEFAULT_CHART_SAMPLE_SIZE,
    ensureQuery,
    pruneQueries,
    getQueryKey,
    getSchema,
    getRowCount,
    getRowAt,
    getRows,
    getSampleRows,
    getMetric,
    getColumnStats,
    getAggregatedRows,
    getPivotData
  };
};

export { createDataEngine };
