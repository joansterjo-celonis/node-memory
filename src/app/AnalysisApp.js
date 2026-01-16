// src/app/AnalysisApp.js
// Main application component: ingestion, history, engine, and layout.
const React = window.React;
const { useState, useMemo, useEffect } = React;

const { PropertiesPanel } = window;
const { TreeNode } = window;
const { Layout, Database, FileJson, Settings, Undo, Redo, TableIcon, X } = window.Icons;
const { readFileAsText, readFileAsArrayBuffer, parseCSV, parseXLSX, buildDataModelFromCSV, buildDataModelFromXLSX } = window.Ingest;
const { getChildren, getCalculationOrder, getNodeResult } = window.NodeUtils;

const AnalysisApp = () => {
  // -------------------------------------------------------------------
  // Ingestion state
  // -------------------------------------------------------------------
  const [dataModel, setDataModel] = useState({ tables: {}, order: [] });
  const [rawDataName, setRawDataName] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);

  // -------------------------------------------------------------------
  // History state (undo / redo)
  // -------------------------------------------------------------------
  const [history, setHistory] = useState([
    [
      {
        id: 'node-start',
        parentId: null,
        type: 'SOURCE',
        title: 'Load Raw Data',
        description: 'Upload dataset',
        branchName: 'Main',
        isExpanded: true,
        params: { table: null, __file: null }
      }
    ]
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const nodes = history[historyIndex];

  const [selectedNodeId, setSelectedNodeId] = useState('node-start');
  const [showAddMenuForId, setShowAddMenuForId] = useState(null);
  const [showInsertMenuForId, setShowInsertMenuForId] = useState(null);
  const [showDataModel, setShowDataModel] = useState(false);

  // -------------------------------------------------------------------
  // File ingestion pipeline (triggered by explicit "Ingest Data" button)
  // -------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!selectedFile) {
        setIsLoadingFile(false);
        return;
      }

      setLoadError(null);
      setIsLoadingFile(true);

      try {
        // Allow UI to render progress state
        await new Promise(resolve => setTimeout(resolve, 50));

        const name = selectedFile.name || 'Uploaded file';
        const lower = name.toLowerCase();

        let model = { tables: {}, order: [] };
        if (lower.endsWith('.csv')) {
          const text = await readFileAsText(selectedFile);
          const rows = parseCSV(text);
          if (!rows || rows.length === 0) throw new Error('No rows found in CSV.');
          model = buildDataModelFromCSV(name, rows);
        } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
          if (!window.XLSX) throw new Error('Excel parsing library failed to load. Please refresh and try again.');
          const buf = await readFileAsArrayBuffer(selectedFile);
          const tables = parseXLSX(buf);
          const hasRows = Object.values(tables).some(arr => Array.isArray(arr) && arr.length > 0);
          if (!hasRows) throw new Error('No rows found in workbook.');
          model = buildDataModelFromXLSX(tables);
        } else {
          throw new Error('Unsupported file type. Please upload CSV or XLSX.');
        }

        if (!cancelled) {
          setDataModel(model);
          setRawDataName(name);

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
  }, [selectedFile]);

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

  // If user selects a file, keep it pending until they click ingest
  const updateNodeFromPanel = (id, params, isMeta = false) => {
    if (id === 'node-start' && params && Object.prototype.hasOwnProperty.call(params, '__file')) {
      setPendingFile(params.__file || null);
    }
    updateNode(id, params, isMeta);
  };

  const ingestPendingFile = () => {
    if (!pendingFile) {
      setLoadError('Please select a file to ingest.');
      return;
    }
    setLoadError(null);
    setSelectedFile(pendingFile);
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
          if (node.params.operator === 'contains') return String(val).toLowerCase().includes(String(filterVal).toLowerCase());
          return true;
        });
      } else if (node.type === 'AGGREGATE' && node.params.groupBy) {
        const groups = {};
        currentData.forEach(item => {
          const key = item[node.params.groupBy];
          if (!groups[key]) groups[key] = { [node.params.groupBy]: key, _count: 0, _sum: 0, _raw: [] };
          groups[key]._count++;
          groups[key]._raw.push(item);
          if (node.params.metricField) {
            groups[key]._sum += (Number(item[node.params.metricField]) || 0);
          }
        });
        currentData = Object.values(groups).map((g) => {
          const res = { [node.params.groupBy]: g[node.params.groupBy] };
          if (node.params.fn === 'sum') res[node.params.metricField] = g._sum;
          else if (node.params.fn === 'avg') res[node.params.metricField] = Math.round(g._sum / g._count);
          else res['Record Count'] = g._count;
          return res;
        });
      } else if (node.type === 'JOIN' && node.params.rightTable && node.params.leftKey && node.params.rightKey) {
        const rightTableData = dataModel.tables[node.params.rightTable] || [];
        const rightTablePrefix = node.params.rightTable;
        const joinedData = [];
        const matchedRightIndices = new Set();

        const prefixColumns = (row, prefix) => {
          return Object.entries(row).reduce((acc, [key, val]) => {
            acc[`${prefix}_${key}`] = val;
            return acc;
          }, {});
        };

        currentData.forEach(leftRow => {
          const leftVal = leftRow[node.params.leftKey];
          let matchesFound = false;
          if (leftVal !== undefined && leftVal !== null && leftVal !== '') {
            rightTableData.forEach((rightRow, rIdx) => {
              if (String(rightRow[node.params.rightKey]) === String(leftVal)) {
                matchesFound = true;
                matchedRightIndices.add(rIdx);
                joinedData.push({ ...leftRow, ...prefixColumns(rightRow, rightTablePrefix) });
              }
            });
          }
          if (!matchesFound && ['LEFT', 'FULL'].includes(node.params.joinType || 'LEFT')) {
            joinedData.push({ ...leftRow });
          }
        });

        if (['RIGHT', 'FULL'].includes(node.params.joinType)) {
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
      params: {
        subtype,
        operator: 'equals',
        fn: 'count',
        chartType: 'bar',
        target: 100,
        joinType: 'LEFT',
        metrics: [],
        pivotRow: '',
        pivotColumn: '',
        pivotValue: '',
        pivotFn: 'count'
      }
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
      params: {
        subtype,
        operator: 'equals',
        fn: 'count',
        chartType: 'bar',
        target: 100,
        joinType: 'LEFT',
        metrics: [],
        pivotRow: '',
        pivotColumn: '',
        pivotValue: '',
        pivotFn: 'count'
      }
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

  const handleChartDrillDown = (data, xAxisField, parentId) => {
    if (!data || !data.activePayload) return;
    addNode('FILTER', parentId);
  };

  const handleTableCellClick = (value, field, parentId) => {
    const newId = `node-${Date.now()}`;
    const newNode = {
      id: newId,
      parentId,
      type: 'FILTER',
      title: 'Filter Data',
      isExpanded: true,
      params: { field, operator: 'equals', value }
    };

    const updatedNodes = nodes.map(n => n.id === parentId ? { ...n, areChildrenCollapsed: false } : n);
    updateNodes([...updatedNodes, newNode]);
    setSelectedNodeId(newId);
  };

  // -------------------------------------------------------------------
  // Derived status for SOURCE panel
  // -------------------------------------------------------------------
  const sourceStatus = (() => {
    if (isLoadingFile) return { title: 'Loading…', detail: 'Parsing file and building table…', loading: true };
    if (loadError) return { title: 'Error', detail: loadError };
    const table = nodes.find(n => n.id === 'node-start')?.params.table || dataModel.order[0];
    const count = table ? (dataModel.tables[table] || []).length : 0;
    return { title: 'Connected', detail: `${rawDataName || 'Dataset'} loaded with ${count} rows.` };
  })();

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* 1. LEFT SIDEBAR */}
      <div className="w-16 flex-shrink-0 bg-slate-900 flex flex-col items-center py-6 gap-6 text-slate-400 border-r border-slate-800 z-50">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-900/50 mb-4 ring-1 ring-white/10">
          <Layout size={20} />
        </div>
        <div
          onClick={() => setShowDataModel(true)}
          className="p-2.5 bg-slate-800 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors text-white relative group"
          title="Data Model"
        >
          <Database size={20} />
        </div>
        <div className="p-2.5 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors relative group" title="Saved Analysis">
          <FileJson size={20} />
        </div>
        <div className="mt-auto p-2.5 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors relative group">
          <Settings size={20} />
        </div>
      </div>

      {/* 2. MAIN CANVAS AREA */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-[#F8FAFC]">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 justify-between shadow-sm z-40 relative">
          <div className="flex items-center gap-4">
            <h1 className="font-bold text-gray-900 text-lg">Invoice Analysis <span className="text-gray-400 font-normal mx-2">/</span> Canvas</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button onClick={undo} disabled={historyIndex === 0} className="p-1.5 text-gray-600 hover:bg-white rounded disabled:opacity-30 disabled:hover:bg-transparent" title="Undo">
                <Undo size={16} />
              </button>
              <button onClick={redo} disabled={historyIndex === history.length - 1} className="p-1.5 text-gray-600 hover:bg-white rounded disabled:opacity-30 disabled:hover:bg-transparent" title="Redo">
                <Redo size={16} />
              </button>
            </div>
            <button className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm">Save</button>
          </div>
        </header>

        {/* Infinite canvas scroll area */}
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
              showAddMenuForId={showAddMenuForId}
              setShowAddMenuForId={setShowAddMenuForId}
              showInsertMenuForId={showInsertMenuForId}
              setShowInsertMenuForId={setShowInsertMenuForId}
            />
          </div>
        </div>
      </div>

      {/* 3. PROPERTIES PANEL */}
      <PropertiesPanel
        node={nodes.find(n => n.id === selectedNodeId)}
        updateNode={updateNodeFromPanel}
        schema={getNodeResult(chainData, selectedNodeId)?.schema || []}
        dataModel={dataModel}
        sourceStatus={sourceStatus}
        onIngest={ingestPendingFile}
      />

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
                  {dataModel.order.map(tableName => (
                    <div key={tableName} className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col">
                      <div className="p-4 border-b border-gray-100 font-bold text-gray-800 flex items-center gap-2">
                        <TableIcon size={16} className="text-gray-400" />
                        {tableName.toUpperCase()}
                      </div>
                      <div className="p-0">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                            <tr><th className="p-3 font-semibold">Column</th><th className="p-3 font-semibold">Sample</th></tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {Object.keys((dataModel.tables[tableName] || [])[0] || {}).map(col => (
                              <tr key={col}>
                                <td className="p-3 font-medium text-gray-700">{col}</td>
                                <td className="p-3 text-gray-400 truncate max-w-[100px]">{String((dataModel.tables[tableName] || [])[0]?.[col] || '')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-auto p-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
                        {(dataModel.tables[tableName] || []).length} total records
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

window.AnalysisApp = AnalysisApp;
