// src/app/AnalysisApp.js
// Main application component: ingestion, history, engine, and layout.
import React, { useState, useMemo, useEffect } from 'react';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { TreeNode } from '../components/TreeNode';
import { Layout, Database, FileJson, Settings, Undo, Redo, TableIcon, X } from '../ui/icons';
import { readFileAsText, readFileAsArrayBuffer, parseCSV, parseXLSX } from '../utils/ingest';
import { getChildren, getCalculationOrder, getNodeResult } from '../utils/nodeUtils';

const createInitialNodes = () => ([
  {
    id: 'node-start',
    parentId: null,
    type: 'SOURCE',
    title: 'Load Raw Data',
    description: 'Upload dataset',
    branchName: 'Main',
    isExpanded: true,
    params: { table: null, __files: [] }
  }
]);

const AnalysisApp = () => {
  // -------------------------------------------------------------------
  // Ingestion state
  // -------------------------------------------------------------------
  const [dataModel, setDataModel] = useState({ tables: {}, order: [] });
  const [rawDataName, setRawDataName] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);

  // -------------------------------------------------------------------
  // History state (undo / redo)
  // -------------------------------------------------------------------
  const [history, setHistory] = useState([createInitialNodes()]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const nodes = history[historyIndex];

  const [selectedNodeId, setSelectedNodeId] = useState('node-start');
  const [showAddMenuForId, setShowAddMenuForId] = useState(null);
  const [showInsertMenuForId, setShowInsertMenuForId] = useState(null);
  const [showDataModel, setShowDataModel] = useState(false);
  const [viewMode, setViewMode] = useState('canvas');
  const [dataModelSorts, setDataModelSorts] = useState({});
  const [explorations, setExplorations] = useState([]);
  const [activeExplorationId, setActiveExplorationId] = useState(null);
  const [saveError, setSaveError] = useState(null);

  // -------------------------------------------------------------------
  // File ingestion pipeline (triggered by explicit "Ingest Data" button)
  // -------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!selectedFiles || selectedFiles.length === 0) {
        setIsLoadingFile(false);
        return;
      }

      setLoadError(null);
      setIsLoadingFile(true);

      try {
        // Allow UI to render progress state
        await new Promise(resolve => setTimeout(resolve, 50));

        const tables = {};
        const order = [];
        const fileNames = [];

        const addTable = (name, rows) => {
          const base = name || 'data';
          let finalName = base;
          let suffix = 2;
          while (tables[finalName]) {
            finalName = `${base} (${suffix++})`;
          }
          tables[finalName] = rows;
          order.push(finalName);
        };

        for (const file of selectedFiles) {
          const name = file.name || 'Uploaded file';
          const lower = name.toLowerCase();
          const baseName = name.replace(/\.(csv|xlsx|xls)$/i, '') || 'data';
          fileNames.push(name);

          if (lower.endsWith('.csv')) {
            const text = await readFileAsText(file);
            const rows = parseCSV(text);
            if (!rows || rows.length === 0) throw new Error(`No rows found in ${name}.`);
            addTable(baseName, rows);
          } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
            if (!window.XLSX) throw new Error('Excel parsing library failed to load. Please refresh and try again.');
            const buf = await readFileAsArrayBuffer(file);
            const workbookTables = parseXLSX(buf);
            const hasRows = Object.values(workbookTables).some(arr => Array.isArray(arr) && arr.length > 0);
            if (!hasRows) throw new Error(`No rows found in ${name}.`);
            Object.entries(workbookTables).forEach(([sheetName, rows]) => {
              if (!Array.isArray(rows) || rows.length === 0) return;
              addTable(`${baseName}:${sheetName}`, rows);
            });
          } else {
            throw new Error('Unsupported file type. Please upload CSV or XLSX.');
          }
        }

        if (!order.length) {
          throw new Error('No rows found in the uploaded files.');
        }

        if (!cancelled) {
          const model = { tables, order };
          setDataModel(model);
          setDataModelSorts({});
          setRawDataName(fileNames.length === 1 ? fileNames[0] : `${fileNames.length} files`);

          // If SOURCE node has no table selected, set default silently.
          const defaultTable = model.order[0] || null;
          if (defaultTable) {
            updateNode('node-start', { ...nodes.find(n => n.id === 'node-start').params, table: defaultTable }, false, true);
          }
        }
      } catch (err) {
        if (!cancelled) setLoadError(err?.message || String(err));
      } finally {
        if (!cancelled) setIsLoadingFile(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [selectedFiles]);

  // -------------------------------------------------------------------
  // History helpers
  // -------------------------------------------------------------------
  const updateNodes = (newNodes) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newNodes);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => { if (historyIndex > 0) setHistoryIndex(historyIndex - 1); };
  const redo = () => { if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1); };

  const EXPLORATION_STORAGE_KEY = 'nma-explorations';
  const loadExplorations = () => {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const raw = window.localStorage.getItem(EXPLORATION_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  };

  const persistExplorations = (next) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(EXPLORATION_STORAGE_KEY, JSON.stringify(next));
  };

  useEffect(() => {
    setExplorations(loadExplorations());
  }, []);

  // -------------------------------------------------------------------
  // Node updates (params + metadata)
  // -------------------------------------------------------------------
  const updateNode = (id, updates, isMeta = false, silent = false) => {
    const newNodes = nodes.map(n => {
      if (n.id !== id) return n;
      if (isMeta) return { ...n, ...updates };
      return { ...n, params: updates };
    });

    if (silent) {
      const newHistory = [...history];
      newHistory[historyIndex] = newNodes;
      setHistory(newHistory);
    } else {
      updateNodes(newNodes);
    }
  };

  // If user selects files, keep them pending until they click ingest
  const updateNodeFromPanel = (id, params, isMeta = false) => {
    if (id === 'node-start' && params && Object.prototype.hasOwnProperty.call(params, '__files')) {
      setPendingFiles(params.__files || []);
    }
    updateNode(id, params, isMeta);
  };

  const ingestPendingFiles = () => {
    if (!pendingFiles || pendingFiles.length === 0) {
      setLoadError('Please select one or more files to ingest.');
      return;
    }
    setLoadError(null);
    setSelectedFiles([...pendingFiles]);
  };

  const clearIngestedData = () => {
    setIsLoadingFile(false);
    setDataModel({ tables: {}, order: [] });
    setDataModelSorts({});
    setRawDataName(null);
    setLoadError(null);
    setSelectedFiles([]);
    setPendingFiles([]);
    setShowDataModel(false);

    const sourceNode = nodes.find(node => node.id === 'node-start');
    if (sourceNode) {
      updateNode('node-start', { ...sourceNode.params, table: null, __files: [] });
    }
  };

  // -------------------------------------------------------------------
  // Tree engine (process the graph of nodes)
  // -------------------------------------------------------------------
  const chainData = useMemo(() => {
    const order = getCalculationOrder(nodes);
    const resultsMap = new Map();

    for (const node of order) {
      let currentData = node.parentId && resultsMap.has(node.parentId)
        ? [...resultsMap.get(node.parentId).data]
        : [];

      if (node.type === 'SOURCE') {
        const table = node.params.table || dataModel.order[0];
        currentData = table ? [...(dataModel.tables[table] || [])] : [];
      } else if (node.type === 'FILTER' && node.params.field) {
        currentData = currentData.filter(item => {
          const val = item[node.params.field];
          const filterVal = node.params.value;
          if (!filterVal && filterVal !== 0) return true;
          if (node.params.operator === 'equals') return String(val) == String(filterVal);
          if (node.params.operator === 'not_equals') return String(val) != String(filterVal);
          if (node.params.operator === 'gt') return Number(val) > Number(filterVal);
          if (node.params.operator === 'lt') return Number(val) < Number(filterVal);
          if (node.params.operator === 'gte') return Number(val) >= Number(filterVal);
          if (node.params.operator === 'lte') return Number(val) <= Number(filterVal);
          if (node.params.operator === 'contains') return String(val).toLowerCase().includes(String(filterVal).toLowerCase());
          if (node.params.operator === 'in') {
            const list = Array.isArray(filterVal)
              ? filterVal.map(value => String(value).trim()).filter(Boolean)
              : String(filterVal)
                .split(',')
                .map(value => value.trim())
                .filter(Boolean);
            if (list.length === 0) return true;
            return list.some(value => String(val) == value);
          }
          return true;
        });
      } else if (node.type === 'AGGREGATE' && node.params.groupBy) {
        const groups = {};
        currentData.forEach(item => {
          const key = item[node.params.groupBy];
          if (!groups[key]) {
            groups[key] = {
              [node.params.groupBy]: key,
              _count: 0,
              _sum: 0,
              _min: null,
              _max: null,
              _distinct: new Set()
            };
          }
          groups[key]._count++;
          if (node.params.metricField) {
            const rawValue = item[node.params.metricField];
            const value = Number(rawValue);
            if (!Number.isNaN(value)) {
              groups[key]._sum += value;
              groups[key]._min = groups[key]._min === null ? value : Math.min(groups[key]._min, value);
              groups[key]._max = groups[key]._max === null ? value : Math.max(groups[key]._max, value);
            }
            groups[key]._distinct.add(rawValue);
          }
        });
        currentData = Object.values(groups).map((g) => {
          const res = { [node.params.groupBy]: g[node.params.groupBy] };
          if (node.params.fn === 'sum') res[node.params.metricField] = g._sum;
          else if (node.params.fn === 'avg') res[node.params.metricField] = g._count ? g._sum / g._count : 0;
          else if (node.params.fn === 'min') res[node.params.metricField] = g._min ?? 0;
          else if (node.params.fn === 'max') res[node.params.metricField] = g._max ?? 0;
          else if (node.params.fn === 'count_distinct') res[node.params.metricField] = g._distinct.size;
          else res['Record Count'] = g._count;
          return res;
        });
      } else if (node.type === 'JOIN' && node.params.rightTable && node.params.leftKey && node.params.rightKey) {
        const rightTableData = dataModel.tables[node.params.rightTable] || [];
        const rightTablePrefix = node.params.rightTable;
        const joinedData = [];
        const matchedRightIndices = new Set();
        const joinType = node.params.joinType || 'LEFT';

        const normalizeJoinValue = (value) => {
          if (value === undefined || value === null) return null;
          if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed === '' ? null : trimmed;
          }
          return String(value);
        };

        const prefixColumns = (row, prefix) => {
          return Object.entries(row).reduce((acc, [key, val]) => {
            acc[`${prefix}_${key}`] = val;
            return acc;
          }, {});
        };

        const rightLookup = new Map();
        rightTableData.forEach((rightRow, rIdx) => {
          const key = normalizeJoinValue(rightRow[node.params.rightKey]);
          if (key === null) return;
          if (!rightLookup.has(key)) rightLookup.set(key, []);
          rightLookup.get(key).push({ row: rightRow, index: rIdx });
        });

        currentData.forEach(leftRow => {
          const leftKey = normalizeJoinValue(leftRow[node.params.leftKey]);
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
        });

        if (['RIGHT', 'FULL'].includes(joinType)) {
          rightTableData.forEach((rightRow, rIdx) => {
            if (!matchedRightIndices.has(rIdx)) {
              joinedData.push({ ...prefixColumns(rightRow, rightTablePrefix) });
            }
          });
        }

        currentData = joinedData;
      }

      // Schema extraction (robust for joins/empties)
      const uniqueKeys = new Set();
      if (currentData.length > 0) {
        currentData.slice(0, 10).forEach(row => {
          Object.keys(row).forEach(k => uniqueKeys.add(k));
        });
      }

      if (node.type === 'JOIN' && node.params.rightTable) {
        const proto = (dataModel.tables[node.params.rightTable] || [])[0];
        if (proto) Object.keys(proto).forEach(k => uniqueKeys.add(`${node.params.rightTable}_${k}`));
      }

      resultsMap.set(node.id, {
        nodeId: node.id,
        data: currentData,
        schema: Array.from(uniqueKeys)
      });
    }

    return Array.from(resultsMap.values());
  }, [nodes, dataModel]);

  // -------------------------------------------------------------------
  // Node operations (add/insert/remove/toggle)
  // -------------------------------------------------------------------
  const getDefaultParams = (subtype) => ({
    subtype,
    operator: 'equals',
    fn: 'count',
    chartType: 'bar',
    chartAggFn: 'sum',
    chartBarGap: 0.2,
    chartColor: '#2563eb',
    chartOrientation: 'vertical',
    chartShowGrid: true,
    chartShowTooltip: true,
    chartShowPoints: false,
    chartStacked: false,
    chartCurve: 'linear',
    tableSortBy: '',
    tableSortDirection: '',
    target: 100,
    joinType: 'LEFT',
    metrics: [],
    pivotRow: '',
    pivotColumn: '',
    pivotValue: '',
    pivotFn: 'count',
    assistantQuestion: '',
    assistantUseLLM: false,
    assistantStatus: 'idle',
    assistantSummary: '',
    assistantError: '',
    assistantLlmError: '',
    assistantPlan: []
  });

  const addNode = (type, parentId, subtype = 'TABLE') => {
    const newId = `node-${Date.now()}`;
    const siblings = getChildren(nodes, parentId);
    const branchName = siblings.length > 0 ? `Fork ${siblings.length + 1}` : undefined;

    const newNode = {
      id: newId,
      parentId,
      type,
      title: 'New Step',
      branchName,
      isExpanded: true,
      params: getDefaultParams(subtype)
    };

    const updatedNodes = nodes.map(n => n.id === parentId ? { ...n, areChildrenCollapsed: false } : n);
    updateNodes([...updatedNodes, newNode]);
    setSelectedNodeId(newId);
    setShowAddMenuForId(null);
  };

  const insertNode = (type, parentId, subtype = 'TABLE') => {
    const newId = `node-${Date.now()}`;
    const newNode = {
      id: newId,
      parentId,
      type,
      title: 'Inserted Step',
      isExpanded: true,
      params: getDefaultParams(subtype)
    };

    let updatedNodes = nodes.map(n => n.id === parentId ? { ...n, areChildrenCollapsed: false } : n);
    updatedNodes = updatedNodes.map(n => n.parentId === parentId ? { ...n, parentId: newId } : n);

    updateNodes([...updatedNodes, newNode]);
    setSelectedNodeId(newId);
    setShowInsertMenuForId(null);
  };

  const removeNode = (id) => {
    const nodesToDelete = new Set([id]);
    let poolToCheck = [id];
    while (poolToCheck.length > 0) {
      const current = poolToCheck.pop();
      const children = getChildren(nodes, current);
      children.forEach(c => { nodesToDelete.add(c.id); poolToCheck.push(c.id); });
    }
    const filtered = nodes.filter(n => !nodesToDelete.has(n.id));
    updateNodes(filtered);
    if (selectedNodeId === id) setSelectedNodeId('node-start');
  };

  const toggleNodeExpansion = (id) => {
    const newNodes = nodes.map(n => n.id === id ? { ...n, isExpanded: !n.isExpanded } : n);
    const newHistory = [...history];
    newHistory[historyIndex] = newNodes;
    setHistory(newHistory);
  };

  const toggleChildrenCollapse = (id) => {
    const newNodes = nodes.map(n => n.id === id ? { ...n, areChildrenCollapsed: !n.areChildrenCollapsed } : n);
    const newHistory = [...history];
    newHistory[historyIndex] = newNodes;
    setHistory(newHistory);
  };

  const toggleBranchCollapse = (id) => {
    const newNodes = nodes.map(n => n.id === id ? { ...n, isBranchCollapsed: !n.isBranchCollapsed } : n);
    const newHistory = [...history];
    newHistory[historyIndex] = newNodes;
    setHistory(newHistory);
  };

  const handleSelect = (id) => {
    setSelectedNodeId(id);
    const newNodes = nodes.map(n => n.id === id ? { ...n, isExpanded: true } : n);
    const newHistory = [...history];
    newHistory[historyIndex] = newNodes;
    setHistory(newHistory);
  };

  const buildInValue = (values) => values.map((value) => String(value)).join(', ');

  const addFilterNode = ({ parentId, field, operator = 'equals', value }) => {
    if (!parentId || !field) return;
    const newId = `node-${Date.now()}`;
    const newNode = {
      id: newId,
      parentId,
      type: 'FILTER',
      title: 'Filter Data',
      isExpanded: true,
      params: { field, operator, value }
    };

    const updatedNodes = nodes.map(n => n.id === parentId ? { ...n, areChildrenCollapsed: false } : n);
    updateNodes([...updatedNodes, newNode]);
    setSelectedNodeId(newId);
  };

  const handleChartDrillDown = (data, chartMeta, parentId) => {
    if (!data || !parentId) return;
    const xAxisField = chartMeta?.xAxis;
    if (!xAxisField) return;
    const payload = data.activePayload?.[0]?.payload;
    const clickedValue = payload?.__x;
    const selectionValues = data.selection?.values || (clickedValue !== undefined ? [clickedValue] : []);
    if (!selectionValues.length) return;
    const operator = selectionValues.length > 1 ? 'in' : 'equals';
    const value = operator === 'in' ? buildInValue(selectionValues) : selectionValues[0];
    addFilterNode({ parentId, field: xAxisField, operator, value });
  };

  const handleTableCellClick = (value, field, parentId) => {
    addFilterNode({ parentId, field, operator: 'equals', value });
  };

  const handleTableSortChange = (nodeId, sortBy, sortDirection) => {
    const targetNode = nodes.find(n => n.id === nodeId);
    if (!targetNode) return;
    const nextSortBy = sortBy || '';
    const nextSortDirection = nextSortBy ? (sortDirection || 'asc') : '';
    updateNode(nodeId, { ...targetNode.params, tableSortBy: nextSortBy, tableSortDirection: nextSortDirection });
  };

  const getSortedRows = (rows, sortBy, sortDirection) => {
    if (!sortBy || !sortDirection) return rows;
    const withIndex = rows.map((row, index) => ({ row, index }));
    const direction = sortDirection === 'asc' ? 1 : -1;
    withIndex.sort((a, b) => {
      const aRaw = a.row?.[sortBy];
      const bRaw = b.row?.[sortBy];
      if (aRaw == null && bRaw == null) return a.index - b.index;
      if (aRaw == null) return 1;
      if (bRaw == null) return -1;
      const aNum = Number(aRaw);
      const bNum = Number(bRaw);
      const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);
      if (bothNumeric) {
        if (aNum === bNum) return a.index - b.index;
        return (aNum - bNum) * direction;
      }
      const aText = String(aRaw);
      const bText = String(bRaw);
      const result = aText.localeCompare(bText, undefined, { numeric: true, sensitivity: 'base' });
      if (result === 0) return a.index - b.index;
      return result * direction;
    });
    return withIndex.map(item => item.row);
  };

  const handleDataModelSort = (tableName, column) => {
    setDataModelSorts((prev) => {
      const current = prev[tableName] || { sortBy: '', sortDirection: '' };
      if (current.sortBy !== column) {
        return { ...prev, [tableName]: { sortBy: column, sortDirection: 'asc' } };
      }
      if (current.sortDirection === 'asc') {
        return { ...prev, [tableName]: { sortBy: column, sortDirection: 'desc' } };
      }
      return { ...prev, [tableName]: { sortBy: '', sortDirection: '' } };
    });
  };

  const getExplorationStats = (model) => {
    const order = model?.order || [];
    const rowCount = order.reduce((sum, name) => sum + ((model.tables?.[name] || []).length), 0);
    return { tableCount: order.length, rowCount };
  };

  const sanitizeNodesForStorage = (nodesToSave) =>
    nodesToSave.map(node => {
      if (node.type !== 'SOURCE') return node;
      return { ...node, params: { ...node.params, __files: [] } };
    });

  const saveExploration = () => {
    setSaveError(null);
    const now = new Date().toISOString();
    const stats = getExplorationStats(dataModel);
    const existing = explorations.find(exp => exp.id === activeExplorationId);
    const baseName = rawDataName || 'Exploration';
    const name = existing?.name || baseName;
    const payload = {
      id: existing?.id || `exp-${Date.now()}`,
      name,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      nodes: sanitizeNodesForStorage(nodes),
      dataModel,
      rawDataName,
      tableCount: stats.tableCount,
      rowCount: stats.rowCount
    };
    const next = existing
      ? explorations.map(exp => exp.id === payload.id ? payload : exp)
      : [payload, ...explorations];
    try {
      persistExplorations(next);
      setExplorations(next);
      setActiveExplorationId(payload.id);
      setShowDataModel(false);
      setViewMode('landing');
    } catch (err) {
      setSaveError('Unable to save this exploration. Storage may be full.');
    }
  };

  const openExploration = (exploration) => {
    if (!exploration) return;
    const nextNodes = exploration.nodes || createInitialNodes();
    setHistory([nextNodes]);
    setHistoryIndex(0);
    setSelectedNodeId(nextNodes[0]?.id || 'node-start');
    setDataModel(exploration.dataModel || { tables: {}, order: [] });
    setRawDataName(exploration.rawDataName || exploration.name || null);
    setLoadError(null);
    setSelectedFiles([]);
    setPendingFiles([]);
    setShowDataModel(false);
    setShowAddMenuForId(null);
    setShowInsertMenuForId(null);
    setActiveExplorationId(exploration.id);
    setViewMode('canvas');
  };

  const deleteExploration = (id) => {
    const next = explorations.filter(exp => exp.id !== id);
    try {
      persistExplorations(next);
    } catch (err) {
      // Ignore storage errors on delete.
    }
    setExplorations(next);
    if (activeExplorationId === id) {
      setActiveExplorationId(null);
    }
  };

  const startNewExploration = () => {
    const nextNodes = createInitialNodes();
    setHistory([nextNodes]);
    setHistoryIndex(0);
    setSelectedNodeId(nextNodes[0]?.id || 'node-start');
    setDataModel({ tables: {}, order: [] });
    setRawDataName(null);
    setLoadError(null);
    setSelectedFiles([]);
    setPendingFiles([]);
    setShowDataModel(false);
    setShowAddMenuForId(null);
    setShowInsertMenuForId(null);
    setActiveExplorationId(null);
    setViewMode('canvas');
  };

  // -------------------------------------------------------------------
  // AI assistant helper (rule-based planner)
  // -------------------------------------------------------------------
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalizeText = (value) => value.toLowerCase();
  const getStoredLlmSettings = () => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { baseUrl: '', model: '', apiKey: '' };
    }
    try {
      const raw = window.localStorage.getItem('node-memory-llm-settings');
      if (!raw) return { baseUrl: '', model: '', apiKey: '' };
      const parsed = JSON.parse(raw);
      return {
        baseUrl: parsed.baseUrl || '',
        model: parsed.model || '',
        apiKey: parsed.apiKey || ''
      };
    } catch (err) {
      return { baseUrl: '', model: '', apiKey: '' };
    }
  };

  const getNumericFields = (data, schema) => {
    const sample = data.slice(0, 50);
    return schema.filter((field) => sample.some((row) => {
      const raw = row[field];
      if (raw === null || raw === undefined || raw === '') return false;
      const num = Number(raw);
      return !Number.isNaN(num);
    }));
  };

  const matchFieldsInQuestion = (question, schema) => {
    const lower = normalizeText(question);
    return schema.filter((field) => {
      const raw = field.toLowerCase();
      const variants = [raw, raw.replace(/_/g, ' '), `${raw}s`];
      return variants.some((variant) => lower.includes(variant));
    });
  };

  const pickGroupField = (matches, nonNumeric, schema) => {
    if (matches.length === 0) return nonNumeric[0] || schema[0] || null;
    const nonNumericMatch = matches.find((field) => nonNumeric.includes(field));
    return nonNumericMatch || matches[0] || null;
  };

  const pickMetricField = (matches, numeric) => {
    const numericMatch = matches.find((field) => numeric.includes(field));
    return numericMatch || numeric[0] || '';
  };

  const parseFiltersFromQuestion = (question, schema) => {
    const filters = [];
    for (const field of schema) {
      const escaped = escapeRegExp(field);
      const pattern = new RegExp(`${escaped}\\s*(=|equals|is|>=|<=|>|<|at least|at most|above|below|greater than|less than)\\s*([\\w\\-\\.]+)`, 'i');
      const trailingPattern = new RegExp(`${escaped}[^0-9]{0,10}([0-9]+(?:\\.[0-9]+)?)\\s*(and\\s+above|or\\s+more|and\\s+below|or\\s+less)?`, 'i');
      const containsPattern = new RegExp(`${escaped}\\s*(contains|includes)\\s*([\\w\\-\\.]+)`, 'i');
      const match = question.match(pattern);
      if (match) {
        const operatorToken = match[1].toLowerCase();
        const value = match[2];
        const operator = operatorToken === '>' || operatorToken === 'greater than' || operatorToken === 'above'
          ? 'gt'
          : operatorToken === '<' || operatorToken === 'less than' || operatorToken === 'below'
            ? 'lt'
            : operatorToken === '>=' || operatorToken === 'at least'
              ? 'gte'
              : operatorToken === '<=' || operatorToken === 'at most'
                ? 'lte'
                : 'equals';
        filters.push({ field, operator, value });
        continue;
      }
      const trailingMatch = question.match(trailingPattern);
      if (trailingMatch) {
        const value = trailingMatch[1];
        const qualifier = (trailingMatch[2] || '').toLowerCase();
        const operator = qualifier.includes('above') || qualifier.includes('more') ? 'gte'
          : qualifier.includes('below') || qualifier.includes('less') ? 'lte'
            : 'equals';
        filters.push({ field, operator, value });
        continue;
      }
      const containsMatch = question.match(containsPattern);
      if (containsMatch) {
        filters.push({ field, operator: 'contains', value: containsMatch[2] });
      }
    }
    return filters;
  };

  const extractCandidateValues = (question) => {
    const quoted = Array.from(question.matchAll(/["']([^"']+)["']/g)).map(match => match[1]);
    const capitalized = Array.from(question.matchAll(/\b[A-Z][a-zA-Z0-9]+\b/g)).map(match => match[0]);
    const stop = new Set(['How', 'What', 'Which', 'Average', 'Count', 'Total', 'Show', 'Find', 'List', 'Models']);
    return [...new Set([...quoted, ...capitalized].filter(token => !stop.has(token)))];
  };

  const inferValueFiltersFromQuestion = (question, schema, data) => {
    const candidates = extractCandidateValues(question);
    if (!candidates.length || !data.length) return [];
    const filters = [];
    const usedFields = new Set();
    candidates.forEach((candidate) => {
      const lowerCandidate = candidate.toLowerCase();
      for (const field of schema) {
        if (usedFields.has(field)) continue;
        const hasMatch = data.slice(0, 50).some((row) => {
          const raw = row[field];
          if (raw === null || raw === undefined) return false;
          return String(raw).toLowerCase() === lowerCandidate;
        });
        if (hasMatch) {
          filters.push({ field, operator: 'equals', value: candidate });
          usedFields.add(field);
          break;
        }
      }
    });
    return filters;
  };

  const extractThreshold = (question) => {
    const lower = normalizeText(question);
    const numberMatch = lower.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!numberMatch) return null;
    const value = numberMatch[1];
    const operator = lower.includes('at least') || lower.includes('above') || lower.includes('greater than') || lower.includes('>=') || lower.includes('or more')
      ? 'gte'
      : lower.includes('at most') || lower.includes('below') || lower.includes('less than') || lower.includes('<=') || lower.includes('or less')
        ? 'lte'
        : null;
    return { value, operator };
  };

  const findFieldByKeyword = (schema, keywords) => {
    const lowerSchema = schema.map(field => ({ field, lower: field.toLowerCase() }));
    for (const keyword of keywords) {
      const match = lowerSchema.find((item) => item.lower.includes(keyword));
      if (match) return match.field;
    }
    return null;
  };

  const detectAggregation = (lower) => {
    if (lower.includes('distinct') || lower.includes('unique')) return 'count_distinct';
    if (lower.includes('average') || lower.includes('avg') || lower.includes('mean')) return 'avg';
    if (lower.includes('sum') || lower.includes('total')) return 'sum';
    if (lower.includes('minimum') || lower.includes('min')) return 'min';
    if (lower.includes('maximum') || lower.includes('max') || lower.includes('highest')) return 'max';
    if (lower.includes('count') || lower.includes('how many')) return 'count';
    return 'count';
  };

  const buildAssistantPlan = (question, schema, data) => {
    const trimmed = question.trim();
    if (!trimmed) {
      return { ok: false, error: 'Please enter a question so I can build a plan.' };
    }
    if (!schema || schema.length === 0) {
      return { ok: false, error: 'No columns available yet. Connect a data source first.' };
    }

    const lower = normalizeText(trimmed);
    const matchedFields = matchFieldsInQuestion(trimmed, schema);
    const numericFields = getNumericFields(data, schema);
    const nonNumericFields = schema.filter((field) => !numericFields.includes(field));
    const parsedFilters = parseFiltersFromQuestion(trimmed, schema);
    const inferredFilters = inferValueFiltersFromQuestion(trimmed, schema, data);
    const filters = [...parsedFilters, ...inferredFilters].filter((item, idx, arr) => (
      arr.findIndex(other => other.field === item.field && other.value === item.value) === idx
    ));
    const fn = detectAggregation(lower);

    const wantsPivot = lower.includes('pivot');
    const wantsChart = /(chart|graph|plot)/.test(lower);
    const wantsGauge = lower.includes('gauge');
    const wantsTable = /(table|list|rows|records)/.test(lower);
    const wantsKpi = /(kpi|metric|number|total|count|sum|avg|average|min|max|distinct)/.test(lower);
    const groupIntent = /(group by|by |per |each )/.test(lower);

    const countIntent = /(how many|number of|count)/.test(lower);
    const avgIntent = /(average|avg|mean)/.test(lower);
    const modelField = findFieldByKeyword(schema, ['model', 'sku', 'style', 'product']);
    const ratingField = findFieldByKeyword(schema, ['rating', 'score', 'stars', 'review']);
    const threshold = extractThreshold(trimmed);

    let view = 'TABLE';
    if (wantsPivot) view = 'PIVOT';
    else if (wantsChart) view = 'CHART';
    else if (wantsGauge) view = 'GAUGE';
    else if (wantsKpi) view = 'KPI';
    else if (wantsTable) view = 'TABLE';

    const groupField = groupIntent ? pickGroupField(matchedFields, nonNumericFields, schema) : null;
    const metricField = pickMetricField(matchedFields, numericFields);
    const fnDetected = /(distinct|unique|average|avg|mean|sum|total|minimum|min|maximum|max|count|how many)/.test(lower);
    const needsMetricField = ['sum', 'avg', 'min', 'max', 'count_distinct'].includes(fn);

    if (needsMetricField && !metricField) {
      return { ok: false, error: 'I could not find a numeric column for that aggregation.' };
    }

    const steps = [];
    const planSteps = [];

    if (filters.length) {
      filters.forEach((filter) => {
        steps.push({
          type: 'FILTER',
          params: { field: filter.field, operator: filter.operator, value: filter.value },
          title: 'Filter Data'
        });
        planSteps.push(`Filter ${filter.field} ${filter.operator} ${filter.value}`);
      });
    }

    const shouldAggregate = !!groupField && !wantsPivot && (fnDetected || view === 'CHART' || view === 'TABLE');
    let aggOutputField = null;
    if (shouldAggregate) {
      const aggFn = fnDetected ? fn : 'count';
      const aggParams = { groupBy: groupField, fn: aggFn, metricField: needsMetricField ? metricField : '' };
      aggOutputField = aggFn === 'count' ? 'Record Count' : metricField;
      steps.push({
        type: 'AGGREGATE',
        params: aggParams,
        title: 'Aggregate'
      });
      planSteps.push(aggFn === 'count'
        ? `Count records by ${groupField}`
        : `${aggFn} ${metricField} by ${groupField}`);
    }

    let componentParams = getDefaultParams(view);
    let componentTitle = `${view} View`;
    let hasCustomKpiMetrics = false;

    const averageModelPlan = avgIntent && countIntent && modelField && ratingField && threshold && threshold.operator;
    if (averageModelPlan) {
      const preFilters = steps.filter(step => step.type === 'FILTER');
      steps.length = 0;
      steps.push(...preFilters);
      steps.push({
        type: 'AGGREGATE',
        params: { groupBy: modelField, fn: 'avg', metricField: ratingField },
        title: 'Average Rating by Model'
      });
      steps.push({
        type: 'FILTER',
        params: { field: ratingField, operator: threshold.operator, value: threshold.value },
        title: 'Filter by Rating'
      });
      view = 'KPI';
      componentParams = getDefaultParams(view);
      componentTitle = 'KPI';
      componentParams.metrics = [{ id: `metric-${Date.now()}`, label: '', fn: 'count', field: '' }];
      hasCustomKpiMetrics = true;
      planSteps.push(`Average ${ratingField} by ${modelField}`);
      planSteps.push(`Filter ${ratingField} ${threshold.operator} ${threshold.value}`);
    }

    if (view === 'TABLE') {
      componentTitle = 'Table View';
    }

    if (view === 'PIVOT') {
      const pivotFields = matchedFields.length >= 2 ? matchedFields : schema.slice(0, 2);
      if (pivotFields.length < 2) {
        return { ok: false, error: 'Pivot tables need both a row and a column field.' };
      }
      const rowField = pivotFields[0];
      const columnField = pivotFields[1];
      if (needsMetricField && !metricField) {
        return { ok: false, error: 'Select a numeric field to compute the pivot values.' };
      }
      componentParams.pivotRow = rowField;
      componentParams.pivotColumn = columnField;
      componentParams.pivotValue = needsMetricField ? metricField : '';
      componentParams.pivotFn = fnDetected ? fn : 'count';
      componentTitle = 'Pivot Table';
      planSteps.push(`Pivot ${rowField} by ${columnField}`);
    }

    if (view === 'KPI') {
      componentTitle = componentTitle || 'KPI';
      if (!hasCustomKpiMetrics) {
        componentParams.metrics = [
          { id: `metric-${Date.now()}`, label: '', fn, field: needsMetricField ? metricField : '' }
        ];
        componentParams.fn = fn;
        componentParams.metricField = needsMetricField ? metricField : '';
        planSteps.push(needsMetricField
          ? `${fn} of ${metricField}`
          : 'Count records');
      }
    }

    if (view === 'GAUGE') {
      componentTitle = 'Gauge';
      componentParams.fn = fn;
      componentParams.metricField = needsMetricField ? metricField : '';
      planSteps.push(needsMetricField
        ? `${fn} of ${metricField}`
        : 'Count records');
    }

    if (view === 'CHART') {
      const xAxis = groupField || nonNumericFields[0] || matchedFields[0];
      const yAxis = shouldAggregate ? aggOutputField : (metricField || numericFields[0]);
      if (!xAxis || !yAxis) {
        return { ok: false, error: 'Charts need both a category and a numeric field.' };
      }
      componentTitle = 'Chart';
      componentParams.chartType = lower.includes('line') ? 'line' : 'bar';
      componentParams.xAxis = xAxis;
      componentParams.yAxis = yAxis;
      planSteps.push(`Chart ${yAxis} by ${xAxis}`);
    }

    steps.push({
      type: 'COMPONENT',
      params: componentParams,
      subtype: view,
      title: componentTitle
    });

    const summary = `Built ${steps.length} step${steps.length === 1 ? '' : 's'}: ${steps.map(s => s.title).join(' → ')}.`;
    return { ok: true, steps, planSteps, summary };
  };

  const extractJsonPayload = (text) => {
    if (!text) return null;
    const fenced = text.match(/```json([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch (err) {
        return null;
      }
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (err) {
        return null;
      }
    }
    return null;
  };

  const sanitizePlan = (payload) => {
    if (!payload || !Array.isArray(payload.steps)) return null;
    const steps = payload.steps
      .filter(step => step && typeof step.type === 'string')
      .map(step => ({
        type: step.type.toUpperCase(),
        subtype: step.subtype ? String(step.subtype).toUpperCase() : undefined,
        title: step.title || '',
        params: step.params || {}
      }))
      .filter(step => ['FILTER', 'AGGREGATE', 'JOIN', 'COMPONENT'].includes(step.type));
    if (!steps.length) return null;
    return {
      ok: payload.ok !== false,
      steps,
      planSteps: Array.isArray(payload.planSteps) ? payload.planSteps : [],
      summary: payload.summary || ''
    };
  };

  const validatePlanForQuestion = (plan, question) => {
    const lower = normalizeText(question);
    const hasAverage = /(average|avg|mean)/.test(lower);
    const hasThreshold = /([0-9]+(?:\.[0-9]+)?)/.test(lower)
      && /(above|below|>=|<=|greater|less|at least|at most|or more|or less)/.test(lower);
    const hasConditions = /(with|where|and|equals|is)/.test(lower) || hasThreshold;
    const hasFilter = plan.steps.some(step => step.type === 'FILTER');
    const hasAggregate = plan.steps.some(step => step.type === 'AGGREGATE');
    const hasComponent = plan.steps.some(step => step.type === 'COMPONENT');
    if (!hasComponent) return { ok: false, error: 'Plan missing a component step.' };
    if (hasConditions && !hasFilter) return { ok: false, error: 'Plan missing filter steps.' };
    if (hasAverage && !hasAggregate) return { ok: false, error: 'Plan missing aggregation for averages.' };
    return { ok: true };
  };

  const callLlmPlanner = async ({ question, schema, data }) => {
    const settings = getStoredLlmSettings();
    if (!settings.baseUrl || !settings.model || !settings.apiKey) {
      return { ok: false, error: 'LLM settings are missing.' };
    }

    const systemPrompt = [
      'You are a data analysis assistant.',
      'Return a JSON object only (no markdown).',
      'Schema is a list of column names, dataSample is example rows.',
      'If you cannot build a plan, return { "ok": false, "error": "reason" }.',
      'Always include FILTER steps for explicit conditions (names, categories, thresholds).',
      'If the question asks for averages/sums/min/max by a dimension, include an AGGREGATE step.',
      'If the question asks "how many" with a threshold on an average, use AGGREGATE then FILTER then KPI.',
      'Otherwise return:',
      '{ "ok": true, "summary": "...", "planSteps": ["..."], "steps": [',
      '{ "type": "FILTER", "title": "...", "params": { "field": "...", "operator": "equals|not_equals|contains|gt|lt|gte|lte", "value": "..." } },',
      '{ "type": "AGGREGATE", "title": "...", "params": { "groupBy": "...", "fn": "count|count_distinct|sum|avg|min|max", "metricField": "..." } },',
      '{ "type": "COMPONENT", "subtype": "TABLE|PIVOT|CHART|KPI|GAUGE", "title": "...", "params": { ... } } ] }',
      'Use only columns from schema. Keep params minimal.',
      'Example for: "How many models of Sneakers does Adidas have with an Average rating of 4.3 and above?"',
      '{ "ok": true, "summary": "Count models with avg rating >= 4.3 for Adidas Sneakers.",',
      '"planSteps": ["Filter brand = Adidas", "Filter category = Sneakers", "Average rating by model", "Filter rating >= 4.3", "Count models"],',
      '"steps": [',
      '{ "type": "FILTER", "title": "Filter Brand", "params": { "field": "brand", "operator": "equals", "value": "Adidas" } },',
      '{ "type": "FILTER", "title": "Filter Category", "params": { "field": "category", "operator": "equals", "value": "Sneakers" } },',
      '{ "type": "AGGREGATE", "title": "Average Rating by Model", "params": { "groupBy": "model", "fn": "avg", "metricField": "rating" } },',
      '{ "type": "FILTER", "title": "Filter by Rating", "params": { "field": "rating", "operator": "gte", "value": "4.3" } },',
      '{ "type": "COMPONENT", "subtype": "KPI", "title": "KPI", "params": { "metrics": [{ "fn": "count", "field": "" }] } }',
      '] }'
    ].join(' ');

    const body = {
      model: settings.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify({
            question,
            schema,
            dataSample: data.slice(0, 20)
          })
        }
      ]
    };

    try {
      const res = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const message = await res.text();
        let detail = message;
        try {
          const parsed = JSON.parse(message);
          detail = parsed?.error?.message || parsed?.message || message;
        } catch (err) {
          // keep raw message
        }
        return { ok: false, error: `LLM request failed (${res.status}). ${detail}` };
      }

      const payload = await res.json();
      const content = payload?.choices?.[0]?.message?.content;
      const parsed = extractJsonPayload(content);
      if (!parsed) return { ok: false, error: 'LLM response could not be parsed.' };
      if (parsed.ok === false) return { ok: false, error: parsed.error || 'LLM could not build a plan.' };
      const sanitized = sanitizePlan(parsed);
      if (!sanitized) return { ok: false, error: 'LLM plan was invalid.' };
      const validation = validatePlanForQuestion(sanitized, question);
      if (!validation.ok) return { ok: false, error: validation.error };
      return sanitized;
    } catch (err) {
      const message = err?.message || 'LLM request failed.';
      return { ok: false, error: `Network error: ${message}` };
    }
  };

  const applyAssistantPlan = (nodeId, plan, assistantUpdate) => {
    const baseNodes = nodes.map((node) => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        areChildrenCollapsed: false,
        params: { ...node.params, ...assistantUpdate }
      };
    });

    if (!plan || plan.length === 0) {
      updateNodes(baseNodes);
      return;
    }

    let parentId = nodeId;
    const newNodes = plan.map((step, index) => {
      const newId = `node-${Date.now()}-${index}`;
      const params = step.type === 'COMPONENT'
        ? { ...getDefaultParams(step.subtype), ...step.params, subtype: step.subtype }
        : { ...getDefaultParams(step.subtype || 'TABLE'), ...step.params };
      const title = step.title || (step.type === 'COMPONENT' ? `${step.subtype} View` : 'New Step');
      const newNode = {
        id: newId,
        parentId,
        type: step.type,
        title,
        isExpanded: true,
        params
      };
      parentId = newId;
      return newNode;
    });

    updateNodes([...baseNodes, ...newNodes]);
    setSelectedNodeId(newNodes[newNodes.length - 1]?.id || nodeId);
  };

  const handleAssistantRequest = async (nodeId, question) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const result = getNodeResult(chainData, nodeId);
    const schema = result?.schema || [];
    const data = result?.data || [];
    const llmAttempted = node.params.assistantUseLLM === true;
    applyAssistantPlan(nodeId, [], {
      assistantQuestion: question,
      assistantStatus: 'loading',
      assistantError: '',
      assistantLlmError: '',
      assistantSummary: '',
      assistantPlan: []
    });

    let plan = null;
    let llmError = '';
    if (llmAttempted) {
      const llmPlan = await callLlmPlanner({ question, schema, data });
      if (llmPlan.ok) {
        plan = llmPlan;
      } else {
        plan = null;
        llmError = llmPlan.error || 'LLM unavailable.';
      }
    }

    const fallback = plan ? null : buildAssistantPlan(question, schema, data);
    const finalPlan = plan || fallback;

    if (!finalPlan || !finalPlan.ok) {
      applyAssistantPlan(nodeId, [], {
        assistantQuestion: question,
        assistantStatus: 'error',
        assistantError: finalPlan?.error || 'Unable to build a plan for that question.',
        assistantLlmError: llmAttempted ? llmError : '',
        assistantSummary: '',
        assistantPlan: []
      });
      return;
    }

    const summaryPrefix = plan
      ? ''
      : (llmAttempted
        ? (llmError ? `LLM unavailable: ${llmError}. ` : 'LLM unavailable. ')
        : 'LLM disabled. ');
    applyAssistantPlan(nodeId, finalPlan.steps, {
      assistantQuestion: question,
      assistantStatus: 'success',
      assistantError: '',
      assistantLlmError: llmAttempted ? llmError : '',
      assistantSummary: `${summaryPrefix}${finalPlan.summary || ''}`.trim(),
      assistantPlan: finalPlan.planSteps
    });
  };

  // -------------------------------------------------------------------
  // Derived status for SOURCE panel
  // -------------------------------------------------------------------
  const sourceStatus = (() => {
    if (isLoadingFile) return { title: 'Loading…', detail: 'Parsing files and building tables…', loading: true };
    if (loadError) return { title: 'Error', detail: loadError };
    const tableCount = dataModel.order.length;
    const totalRows = dataModel.order.reduce((sum, name) => sum + ((dataModel.tables[name] || []).length), 0);
    const label = rawDataName || 'Dataset';
    if (tableCount === 0) {
      return { title: 'No data', detail: 'Upload a CSV or Excel file to get started.' };
    }
    return { title: 'Connected', detail: `${label} loaded with ${tableCount} tables and ${totalRows} rows.` };
  })();

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* 1. LEFT SIDEBAR */}
      <div className="w-16 flex-shrink-0 bg-white flex flex-col items-center text-slate-500 border-r border-gray-200 z-50">
        <div className="w-full h-16 bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
          <Layout size={22} />
        </div>
        <div className="flex-1 w-full flex flex-col items-center py-6 gap-6">
          <div
            onClick={() => {
              setShowDataModel(false);
              setViewMode('landing');
            }}
            className={`p-2.5 rounded-lg cursor-pointer transition-colors relative group ${
              viewMode === 'landing' ? 'bg-slate-100 text-slate-900' : 'hover:bg-slate-100'
            }`}
            title="Explorations"
          >
            <FileJson size={20} />
          </div>
          <div className="mt-auto p-2.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors relative group">
            <Settings size={20} />
          </div>
        </div>
      </div>

      {/* 2. MAIN CANVAS AREA */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-[#F8FAFC]">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 justify-between shadow-sm z-40 relative">
          <div className="flex items-center gap-4">
            <div>
              <div className="font-bold text-gray-900 text-lg">Node Memory Analytics</div>
              <div className="text-xs text-gray-400">Exploration workspace</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {viewMode === 'canvas' ? (
              <>
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button onClick={undo} disabled={historyIndex === 0} className="p-1.5 text-gray-600 hover:bg-white rounded disabled:opacity-30 disabled:hover:bg-transparent" title="Undo">
                    <Undo size={16} />
                  </button>
                  <button onClick={redo} disabled={historyIndex === history.length - 1} className="p-1.5 text-gray-600 hover:bg-white rounded disabled:opacity-30 disabled:hover:bg-transparent" title="Redo">
                    <Redo size={16} />
                  </button>
                </div>
                <button onClick={saveExploration} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm">
                  Save & Exit
                </button>
                {saveError && <span className="text-xs text-red-500">{saveError}</span>}
              </>
            ) : (
              <button onClick={startNewExploration} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm">
                New Exploration
              </button>
            )}
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center text-xs font-semibold shadow-md">
              NMA
            </div>
          </div>
        </header>

        {viewMode === 'landing' ? (
          <div className="flex-1 overflow-auto bg-slate-50">
            <div className="max-w-6xl mx-auto px-10 py-12 space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Explorations</h2>
                  <p className="text-sm text-gray-500">Pick up where you left off or start something new.</p>
                </div>
                <button
                  onClick={startNewExploration}
                  className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-800"
                >
                  New Exploration
                </button>
              </div>

              {explorations.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center shadow-sm">
                  <div className="text-lg font-semibold text-gray-900">No explorations yet</div>
                  <p className="text-sm text-gray-500 mt-2">
                    Upload data, build a workflow, then Save & Exit to see it here.
                  </p>
                  <button
                    onClick={startNewExploration}
                    className="mt-6 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
                  >
                    Create your first exploration
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {explorations.map((exp) => {
                    const order = exp.dataModel?.order || [];
                    const tableCount = exp.tableCount ?? order.length;
                    const rowCount = exp.rowCount ?? order.reduce((sum, name) => sum + ((exp.dataModel?.tables?.[name] || []).length), 0);
                    const updated = exp.updatedAt ? new Date(exp.updatedAt).toLocaleString() : '';
                    return (
                      <div key={exp.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{exp.name || 'Exploration'}</div>
                            <div className="text-xs text-gray-400 mt-1">Updated {updated}</div>
                          </div>
                          <button
                            onClick={() => deleteExploration(exp.id)}
                            className="text-[11px] text-gray-400 hover:text-red-500"
                          >
                            Delete
                          </button>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>{tableCount} tables</span>
                          <span>{rowCount} rows</span>
                        </div>
                        <div className="mt-auto flex items-center gap-2">
                          <button
                            onClick={() => openExploration(exp)}
                            className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700"
                          >
                            Open Exploration
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className="flex-1 overflow-auto bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-slate-50 cursor-grab active:cursor-grabbing"
            onClick={() => {
              setShowAddMenuForId(null);
              setShowInsertMenuForId(null);
            }}
          >
            <div className="min-w-full inline-flex justify-center p-20 items-start min-h-full">
              <TreeNode
                nodeId="node-start"
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                chainData={chainData}
                onSelect={handleSelect}
                onAdd={addNode}
                onInsert={insertNode}
                onRemove={removeNode}
                onToggleExpand={toggleNodeExpansion}
                onToggleChildren={toggleChildrenCollapse}
                onToggleBranch={toggleBranchCollapse}
                onDrillDown={handleChartDrillDown}
                onTableCellClick={handleTableCellClick}
                onTableSortChange={handleTableSortChange}
                onAssistantRequest={handleAssistantRequest}
                showAddMenuForId={showAddMenuForId}
                setShowAddMenuForId={setShowAddMenuForId}
                showInsertMenuForId={showInsertMenuForId}
                setShowInsertMenuForId={setShowInsertMenuForId}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. PROPERTIES PANEL */}
      {viewMode === 'canvas' && (
        <PropertiesPanel
          node={nodes.find(n => n.id === selectedNodeId)}
          updateNode={updateNodeFromPanel}
          schema={getNodeResult(chainData, selectedNodeId)?.schema || []}
          data={getNodeResult(chainData, selectedNodeId)?.data || []}
          dataModel={dataModel}
          sourceStatus={sourceStatus}
          onIngest={ingestPendingFiles}
          onClearData={clearIngestedData}
          onShowDataModel={() => setShowDataModel(true)}
        />
      )}

      {/* 4. DATA MODEL MODAL */}
      {showDataModel && (
        <div className="absolute inset-0 z-[60] bg-black/50 flex items-center justify-center p-8 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded text-blue-600"><Database size={20} /></div>
                <div>
                  <h2 className="font-bold text-lg text-gray-900">Data Model Preview</h2>
                  <p className="text-sm text-gray-500">Available tables and schemas</p>
                </div>
              </div>
              <button onClick={() => setShowDataModel(false)} className="p-2 hover:bg-gray-200 rounded-full text-gray-500"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-auto p-8 bg-slate-50">
              {dataModel.order.length === 0 ? (
                <div className="text-sm text-gray-500">Upload a CSV/XLSX file to populate the data model.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {dataModel.order.map((tableName) => {
                    const baseRow = (dataModel.tables[tableName] || [])[0] || {};
                    const rows = Object.keys(baseRow).map((col) => ({
                      column: col,
                      sample: String(baseRow[col] ?? '')
                    }));
                    const sortState = dataModelSorts[tableName] || { sortBy: '', sortDirection: '' };
                    const sortedRows = getSortedRows(rows, sortState.sortBy, sortState.sortDirection);
                    const resolveIndicator = (columnKey) => {
                      if (sortState.sortBy !== columnKey) return '';
                      return sortState.sortDirection === 'asc' ? '^' : 'v';
                    };
                    return (
                      <div key={tableName} className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col">
                        <div className="p-4 border-b border-gray-100 font-bold text-gray-800 flex items-center gap-2">
                          <TableIcon size={16} className="text-gray-400" />
                          {tableName.toUpperCase()}
                        </div>
                        <div className="p-0">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                              <tr>
                                {['column', 'sample'].map((columnKey) => (
                                  <th
                                    key={columnKey}
                                    role="button"
                                    aria-sort={sortState.sortBy === columnKey
                                      ? (sortState.sortDirection === 'asc' ? 'ascending' : 'descending')
                                      : 'none'}
                                    onClick={() => handleDataModelSort(tableName, columnKey)}
                                    className="p-3 font-semibold cursor-pointer hover:text-blue-600"
                                  >
                                    <span className="inline-flex items-center gap-1">
                                      {columnKey === 'column' ? 'Column' : 'Sample'}
                                      {resolveIndicator(columnKey) && (
                                        <span className="text-[10px] text-gray-400">{resolveIndicator(columnKey)}</span>
                                      )}
                                    </span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {sortedRows.map((row) => (
                                <tr key={row.column}>
                                  <td className="p-3 font-medium text-gray-700">{row.column}</td>
                                  <td className="p-3 text-gray-400 truncate max-w-[100px]">{row.sample}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-auto p-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
                          {(dataModel.tables[tableName] || []).length} total records
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalysisApp;
