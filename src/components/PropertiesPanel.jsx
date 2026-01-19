// src/components/PropertiesPanel.js
// Right-side configuration panel for the selected node.
import React, { useState, useEffect } from 'react';
import { Database, Settings, Play, BarChart3, TrendingUp, Hash, Gauge, TableIcon, CheckSquare } from '../ui/icons';

const KPI_FUNCTIONS = [
  { value: 'count', label: 'Count' },
  { value: 'count_distinct', label: 'Distinct Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' }
];

const CHART_AGG_FUNCTIONS = [
  { value: 'none', label: 'None (raw values)' },
  ...KPI_FUNCTIONS
];

const requiresMetricField = (fn) => ['sum', 'avg', 'min', 'max', 'count_distinct'].includes(fn);
const DEFAULT_LLM_SETTINGS = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: ''
};

const readStoredLlmSettings = () => {
  if (typeof window === 'undefined' || !window.localStorage) return { ...DEFAULT_LLM_SETTINGS };
  try {
    const raw = window.localStorage.getItem('node-memory-llm-settings');
    if (!raw) return { ...DEFAULT_LLM_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_LLM_SETTINGS, ...parsed };
  } catch (err) {
    return { ...DEFAULT_LLM_SETTINGS };
  }
};

const PropertiesPanel = ({ node, updateNode, schema, data = [], dataModel, sourceStatus, onIngest, onClearData, onShowDataModel }) => {
  // Local staging for JOIN config (so user can edit multiple fields then commit).
  const [localParams, setLocalParams] = useState({});
  const [llmSettings, setLlmSettings] = useState(readStoredLlmSettings);

  useEffect(() => {
    if (node) setLocalParams(node.params || {});
  }, [node?.id, node?.params]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem('node-memory-llm-settings', JSON.stringify(llmSettings));
  }, [llmSettings]);

  const numericFields = React.useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    const sample = data.slice(0, 50);
    return schema.filter((field) => sample.some((row) => {
      const raw = row?.[field];
      if (raw === null || raw === undefined || raw === '') return false;
      const num = Number(raw);
      return !Number.isNaN(num);
    }));
  }, [data, schema]);

  const categoricalFields = React.useMemo(
    () => schema.filter((field) => !numericFields.includes(field)),
    [schema, numericFields]
  );

  if (!node) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-gray-400 text-center bg-white border-l border-gray-200">
        <Settings size={48} className="mb-4 opacity-20" />
        <p>Select a step in the chain<br/>to configure its logic.</p>
      </div>
    );
  }

  const handleChange = (key, value) => {
    const newParams = { ...node.params, [key]: value };
    updateNode(node.id, newParams);
    setLocalParams(newParams);
  };

  const handleBulkChange = (updates) => {
    const newParams = { ...node.params, ...updates };
    updateNode(node.id, newParams);
    setLocalParams(newParams);
  };

  const handleLocalChange = (key, value) => {
    setLocalParams(prev => ({ ...prev, [key]: value }));
  };

  const commitJoin = () => updateNode(node.id, localParams);
  const handleMetaChange = (key, value) => updateNode(node.id, { [key]: value }, true);

  const currentFiles = node.params?.__files || [];
  const addPendingFiles = (incoming) => {
    const merged = [...currentFiles];
    const seen = new Set(currentFiles.map(file => `${file.name}-${file.size}-${file.lastModified}`));
    incoming.forEach((file) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (!seen.has(key)) {
        merged.push(file);
        seen.add(key);
      }
    });
    handleChange('__files', merged);
  };

  const removePendingFile = (index) => {
    const next = currentFiles.filter((_, idx) => idx !== index);
    handleChange('__files', next);
  };

  const clearPendingFiles = () => handleChange('__files', []);

  const kpiMetrics = (node.type === 'COMPONENT' && node.params.subtype === 'KPI')
    ? (node.params.metrics && node.params.metrics.length > 0
      ? node.params.metrics
      : [{ id: 'metric-default', label: '', fn: node.params.fn || 'count', field: node.params.metricField || '' }])
    : [];

  const updateKpiMetric = (idx, updates) => {
    const next = kpiMetrics.map((metric, index) => index === idx ? { ...metric, ...updates } : metric);
    handleChange('metrics', next);
  };

  const addKpiMetric = () => {
    const next = [
      ...kpiMetrics,
      { id: `metric-${Date.now()}`, label: '', fn: 'count', field: '' }
    ];
    handleChange('metrics', next);
  };

  const removeKpiMetric = (idx) => {
    const next = kpiMetrics.filter((_, index) => index !== idx);
    handleChange('metrics', next);
  };

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 shadow-xl shadow-gray-200/50 w-80 animate-in slide-in-from-right duration-300 z-50">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
            {node.type === 'COMPONENT' ? node.params.subtype : node.type} Node
          </span>
        </div>
        <input
          type="text"
          value={node.title}
          onChange={(e) => handleMetaChange('title', e.target.value)}
          className="font-bold text-gray-900 text-lg w-full border-none p-0 focus:ring-0 placeholder-gray-400"
        />
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-gray-400 font-mono">ID: {node.id.split('-').pop()}</span>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex-1 overflow-y-auto space-y-6">
        {/* Shared: Branch label */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Branch Label</label>
          <input
            type="text"
            className="w-full p-2 border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            placeholder="e.g. Experiment A"
            value={node.branchName || ''}
            onChange={(e) => handleMetaChange('branchName', e.target.value)}
          />
        </div>

        <div className="h-px bg-gray-100 my-2"></div>

        {/* SOURCE CONFIG */}
        {node.type === 'SOURCE' && (
          <div className="space-y-4">
            {/* Table selector (only if XLSX has multiple sheets) */}
            {dataModel.order.length > 1 && (
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Table</label>
                <select
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  value={node.params.table || dataModel.order[0]}
                  onChange={(e) => handleChange('table', e.target.value)}
                >
                  {dataModel.order.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* File ingestion controls */}
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 block">Upload data (CSV or Excel)</label>
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls"
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                onChange={(e) => addPendingFiles(Array.from(e.target.files || []))}
              />
              <p className="text-xs text-gray-500">Tip: uploading files replaces the data model feeding the chain.</p>
            </div>

            {currentFiles.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending Files</div>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50 p-2 space-y-2">
                  {currentFiles.map((file, idx) => (
                    <div key={`${file.name}-${file.size}-${idx}`} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-700 truncate">{file.name}</div>
                        <div className="text-[10px] text-gray-400">{Math.round(file.size / 1024)} KB</div>
                      </div>
                      <button
                        onClick={() => removePendingFile(idx)}
                        className="text-[10px] text-gray-400 hover:text-red-500"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={clearPendingFiles}
                  className="text-[11px] text-gray-500 hover:text-gray-700 underline"
                >
                  Clear all
                </button>
              </div>
            )}

            <button
              onClick={() => onIngest && onIngest()}
              disabled={currentFiles.length === 0 || sourceStatus?.loading}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                currentFiles.length === 0 || sourceStatus?.loading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {sourceStatus?.loading ? 'Ingesting…' : 'Ingest Data'}
            </button>

            {/* Status + progress */}
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 space-y-2">
              <div className="flex items-start gap-2">
                <Database size={16} className="text-blue-600 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-blue-900">{sourceStatus?.title || 'No dataset loaded'}</p>
                  <p className="text-xs text-blue-700 mt-1">{sourceStatus?.detail || 'Upload a CSV or Excel file to get started.'}</p>
                </div>
              </div>
              {sourceStatus?.loading && <div className="progress-bar" />}
            </div>

            {dataModel.order.length > 0 && (
              <button
                onClick={() => onClearData && onClearData()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors border border-red-200 text-red-600 hover:bg-red-50"
              >
                Clear data
              </button>
            )}

            <button
              onClick={() => onShowDataModel && onShowDataModel()}
              disabled={dataModel.order.length === 0}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                dataModel.order.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
              title={dataModel.order.length === 0 ? 'Upload data to enable' : 'Preview Data Model'}
            >
              <Database size={14} /> Preview Data Model
            </button>
          </div>
        )}

        {/* JOIN CONFIG */}
        {node.type === 'JOIN' && (
          <div className="space-y-5">
            <div className="bg-slate-900 rounded-md p-3 text-xs font-mono text-slate-300 overflow-x-auto border border-slate-800">
              <span className="text-pink-400">SELECT</span> * <br/>
              <span className="text-pink-400">FROM</span> [Incoming_Node] <br/>
              <span className="text-pink-400">{localParams.joinType || 'LEFT'} JOIN</span> {localParams.rightTable || '...'} <br/>
              <span className="text-pink-400">ON</span> {localParams.leftKey || '?'} = {localParams.rightKey || '?'}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 block">Join With Table</label>
              <select
                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={localParams.rightTable || ''}
                onChange={(e) => handleLocalChange('rightTable', e.target.value)}
              >
                <option value="">Select Table...</option>
                {dataModel.order.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 block">Join Type</label>
              <div className="grid grid-cols-2 gap-2">
                {['INNER', 'LEFT', 'RIGHT', 'FULL'].map(t => (
                  <button
                    key={t}
                    onClick={() => handleLocalChange('joinType', t)}
                    className={`text-xs py-2 rounded border transition-all ${localParams.joinType === t ? 'bg-blue-50 border-blue-500 text-blue-700 font-medium' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {t} JOIN
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 block">Left Key</label>
                <select
                  className="w-full p-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  value={localParams.leftKey || ''}
                  onChange={(e) => handleLocalChange('leftKey', e.target.value)}
                >
                  <option value="">Col...</option>
                  {schema.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 block">Right Key</label>
                <select
                  className="w-full p-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  value={localParams.rightKey || ''}
                  onChange={(e) => handleLocalChange('rightKey', e.target.value)}
                >
                  <option value="">Col...</option>
                  {(localParams.rightTable && dataModel.tables[localParams.rightTable])
                    ? Object.keys(dataModel.tables[localParams.rightTable][0] || {}).map(f => <option key={f} value={f}>{f}</option>)
                    : null}
                </select>
              </div>
            </div>

            <button
              onClick={commitJoin}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm mt-2"
            >
              <Play size={16} /> Run Join
            </button>
          </div>
        )}

        {/* FILTER CONFIG */}
        {node.type === 'FILTER' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 block">Filter Field</label>
              <select
                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={node.params.field || ''}
                onChange={(e) => handleChange('field', e.target.value)}
              >
                <option value="">Select Field...</option>
                {schema.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1 space-y-1">
                <label className="text-sm font-semibold text-gray-700 block">Operator</label>
                <select
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={node.params.operator || 'equals'}
                  onChange={(e) => handleChange('operator', e.target.value)}
                >
                  <option value="equals">=</option>
                  <option value="not_equals">!=</option>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                  <option value="in">In list</option>
                  <option value="contains">Like</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-semibold text-gray-700 block">Value</label>
                <input
                  type="text"
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder={node.params.operator === 'in' ? 'Comma-separated values...' : 'Value...'}
                  value={node.params.value || ''}
                  onChange={(e) => handleChange('value', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* AGGREGATE CONFIG */}
        {node.type === 'AGGREGATE' && (
          <div className="space-y-5">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 block">Group By (Dimension)</label>
              <select
                className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={node.params.groupBy || ''}
                onChange={(e) => handleChange('groupBy', e.target.value)}
              >
                <option value="">Select Dimension...</option>
                {schema.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 block">Aggregation Function</label>
                <div className="grid grid-cols-2 gap-2">
                  {KPI_FUNCTIONS.map((fn) => (
                    <button
                      key={fn.value}
                      onClick={() => handleChange('fn', fn.value)}
                      className={`py-1.5 text-[11px] font-medium rounded-md transition-all ${
                        node.params.fn === fn.value
                          ? 'bg-blue-50 border border-blue-500 text-blue-700'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {fn.label}
                    </button>
                  ))}
                </div>
              </div>

              {requiresMetricField(node.params.fn || 'count') && (
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 block">Metric Field</label>
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={node.params.metricField || ''}
                    onChange={(e) => handleChange('metricField', e.target.value)}
                  >
                    <option value="">Select Numeric Field...</option>
                    {schema.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMPONENT CONFIG (TABLE / CHART / KPI / GAUGE) */}
        {node.type === 'COMPONENT' && (
          <div className="space-y-5">
            {/* Table Column Selection */}
            {node.params.subtype === 'TABLE' && (
              <>
              <div className="space-y-3">
                <label className="text-sm font-semibold text-gray-700 block">Visible Columns</label>
                <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto p-2 bg-gray-50 scrollbar-thin">
                  {schema.map(field => {
                    const isChecked = node.params.columns ? node.params.columns.includes(field) : true;
                    return (
                      <label key={field} className="flex items-center gap-2 text-xs text-gray-700 py-1.5 hover:bg-gray-100 rounded px-1.5 cursor-pointer select-none">
                        <div className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300'}`}>
                          {isChecked && <CheckSquare size={10} />}
                        </div>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const currentCols = node.params.columns || schema;
                            const newCols = e.target.checked
                              ? [...currentCols, field]
                              : currentCols.filter((c) => c !== field);
                            handleChange('columns', newCols);
                          }}
                          className="hidden"
                        />
                        <span className="truncate">{field}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex justify-between items-center px-1">
                  <button onClick={() => handleChange('columns', schema)} className="text-[10px] font-medium text-blue-600 hover:underline">Select All</button>
                  <button onClick={() => handleChange('columns', [])} className="text-[10px] font-medium text-gray-400 hover:text-gray-600 hover:underline">Clear All</button>
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-sm font-semibold text-gray-700 block">Default Sort</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-gray-500 block">Column</label>
                    <select
                      className="w-full p-2 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      value={node.params.tableSortBy || ''}
                      onChange={(e) => {
                        const nextSortBy = e.target.value;
                        const nextDirection = nextSortBy ? (node.params.tableSortDirection || 'asc') : '';
                        handleBulkChange({ tableSortBy: nextSortBy, tableSortDirection: nextDirection });
                      }}
                    >
                      <option value="">None</option>
                      {schema.map(field => <option key={field} value={field}>{field}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-gray-500 block">Direction</label>
                    <select
                      className="w-full p-2 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      value={node.params.tableSortDirection || ''}
                      onChange={(e) => handleBulkChange({ tableSortDirection: e.target.value })}
                      disabled={!node.params.tableSortBy}
                    >
                      <option value="">Select...</option>
                      <option value="asc">Ascending</option>
                      <option value="desc">Descending</option>
                    </select>
                  </div>
                </div>
              </div>
              </>
            )}

            {/* AI Assistant Config */}
            {node.params.subtype === 'AI' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-gray-700">AI Assistant</div>
                  <p className="text-xs text-gray-500">
                    Ask your question inside the node card to generate a plan of nodes.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={!!node.params.assistantUseLLM}
                      onChange={(e) => handleChange('assistantUseLLM', e.target.checked)}
                    />
                    Use LLM for smarter planning
                  </label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      OpenAI-Compatible Settings
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-gray-500 block">API Base URL</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                        value={llmSettings.baseUrl}
                        onChange={(e) => setLlmSettings(prev => ({ ...prev, baseUrl: e.target.value }))}
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-gray-500 block">Model</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                        value={llmSettings.model}
                        onChange={(e) => setLlmSettings(prev => ({ ...prev, model: e.target.value }))}
                        placeholder="gpt-4o-mini"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-gray-500 block">API Key</label>
                      <input
                        type="password"
                        className="w-full p-2 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                        value={llmSettings.apiKey}
                        onChange={(e) => setLlmSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                        placeholder="sk-..."
                      />
                      <p className="text-[10px] text-gray-400">Stored locally in your browser.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pivot Table Config */}
            {node.params.subtype === 'PIVOT' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 block">Row Field</label>
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={node.params.pivotRow || ''}
                    onChange={(e) => handleChange('pivotRow', e.target.value)}
                  >
                    <option value="">Select Row Field...</option>
                    {schema.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 block">Column Field</label>
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={node.params.pivotColumn || ''}
                    onChange={(e) => handleChange('pivotColumn', e.target.value)}
                  >
                    <option value="">Select Column Field...</option>
                    {schema.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 block">Aggregation</label>
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={node.params.pivotFn || 'count'}
                    onChange={(e) => handleChange('pivotFn', e.target.value)}
                  >
                    {KPI_FUNCTIONS.map(fn => (
                      <option key={fn.value} value={fn.value}>{fn.label}</option>
                    ))}
                  </select>
                </div>
                {requiresMetricField(node.params.pivotFn || 'count') && (
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700 block">Value Field</label>
                    <select
                      className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={node.params.pivotValue || ''}
                      onChange={(e) => handleChange('pivotValue', e.target.value)}
                    >
                      <option value="">Select Value Field...</option>
                      {schema.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Chart Type Selector */}
            {node.params.subtype === 'CHART' && (
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 block">Chart Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleChange('chartType', 'bar')}
                    className={`p-2.5 border rounded-lg flex items-center justify-center gap-2 text-sm transition-all ${node.params.chartType === 'bar' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}
                  >
                    <BarChart3 size={18}/> Bar
                  </button>
                  <button
                    onClick={() => handleChange('chartType', 'line')}
                    className={`p-2.5 border rounded-lg flex items-center justify-center gap-2 text-sm transition-all ${node.params.chartType === 'line' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}
                  >
                    <TrendingUp size={18}/> Line
                  </button>
                  <button
                    onClick={() => handleChange('chartType', 'area')}
                    className={`p-2.5 border rounded-lg flex items-center justify-center gap-2 text-sm transition-all ${node.params.chartType === 'area' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}
                  >
                    <TrendingUp size={18}/> Area
                  </button>
                  <button
                    onClick={() => handleChange('chartType', 'scatter')}
                    className={`p-2.5 border rounded-lg flex items-center justify-center gap-2 text-sm transition-all ${node.params.chartType === 'scatter' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}
                  >
                    <Hash size={18}/> Scatter
                  </button>
                </div>
              </div>
            )}

            {/* Axis Config for Charts */}
            {node.params.subtype === 'CHART' && (
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 block">X Axis (Category)</label>
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={node.params.xAxis || ''}
                    onChange={(e) => handleChange('xAxis', e.target.value)}
                  >
                    <option value="">Auto Select</option>
                    {categoricalFields.length > 0 && (
                      <optgroup label="Categorical">
                        {categoricalFields.map(f => <option key={f} value={f}>{f}</option>)}
                      </optgroup>
                    )}
                    {numericFields.length > 0 && (
                      <optgroup label="Numeric">
                        {numericFields.map(f => <option key={f} value={f}>{f}</option>)}
                      </optgroup>
                    )}
                    {categoricalFields.length === 0 && numericFields.length === 0 && (
                      schema.map(f => <option key={f} value={f}>{f}</option>)
                    )}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 block">Y Axis (Value)</label>
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={node.params.yAxis || ''}
                    onChange={(e) => handleChange('yAxis', e.target.value)}
                  >
                    <option value="">Auto Select</option>
                    {(numericFields.length > 0 ? numericFields : schema).map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 block">Y Axis Aggregation</label>
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={node.params.chartAggFn ?? 'none'}
                    onChange={(e) => handleChange('chartAggFn', e.target.value)}
                    disabled={node.params.chartType === 'scatter'}
                  >
                    {CHART_AGG_FUNCTIONS.map(fn => (
                      <option key={fn.value} value={fn.value}>{fn.label}</option>
                    ))}
                  </select>
                  {node.params.chartType === 'scatter' && (
                    <p className="text-[11px] text-gray-400">Aggregation is not applied to scatter charts.</p>
                  )}
                </div>
              </div>
            )}

            {node.params.subtype === 'CHART' && (
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <label className="text-sm font-semibold text-gray-700 block">Chart Options</label>
                <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={node.params.chartShowGrid !== false}
                      onChange={(e) => handleChange('chartShowGrid', e.target.checked)}
                    />
                    Show grid
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={node.params.chartShowTooltip !== false}
                      onChange={(e) => handleChange('chartShowTooltip', e.target.checked)}
                    />
                    Show tooltip
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!node.params.chartShowPoints}
                      onChange={(e) => handleChange('chartShowPoints', e.target.checked)}
                    />
                    Show points
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!node.params.chartStacked}
                      onChange={(e) => handleChange('chartStacked', e.target.checked)}
                    />
                    Stacked
                  </label>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-500 block">Curve</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                    value={node.params.chartCurve || 'linear'}
                    onChange={(e) => handleChange('chartCurve', e.target.value)}
                  >
                    <option value="linear">Linear</option>
                    <option value="monotone">Monotone</option>
                    <option value="step">Step</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-500 block">Orientation</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                    value={node.params.chartOrientation || 'vertical'}
                    onChange={(e) => handleChange('chartOrientation', e.target.value)}
                    disabled={node.params.chartType !== 'bar'}
                  >
                    <option value="vertical">Vertical (columns)</option>
                    <option value="horizontal">Horizontal (bars)</option>
                  </select>
                  {node.params.chartType !== 'bar' && (
                    <p className="text-[11px] text-gray-400">Orientation applies to bar charts.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-500 block">Bar Gap</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="0.8"
                      step="0.05"
                      className="w-full"
                      value={node.params.chartBarGap ?? 0.2}
                      onChange={(e) => handleChange('chartBarGap', Number(e.target.value))}
                      disabled={node.params.chartType !== 'bar'}
                    />
                    <span className="text-[10px] text-gray-400 w-10 text-right">
                      {(node.params.chartBarGap ?? 0.2).toFixed(2)}
                    </span>
                  </div>
                  {node.params.chartType !== 'bar' && (
                    <p className="text-[11px] text-gray-400">Bar gap applies to bar charts.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-500 block">Series Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-8 w-12 border border-gray-200 rounded"
                      value={node.params.chartColor || '#2563eb'}
                      onChange={(e) => handleChange('chartColor', e.target.value)}
                    />
                    <input
                      type="text"
                      className="flex-1 p-2 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      value={node.params.chartColor || '#2563eb'}
                      onChange={(e) => handleChange('chartColor', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* KPI metric config */}
            {node.params.subtype === 'KPI' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-gray-700">Metrics</label>
                  <button
                    onClick={addKpiMetric}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    Add Metric
                  </button>
                </div>
                <div className="space-y-3">
                  {kpiMetrics.map((metric, idx) => (
                    <div key={metric.id || idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="flex-1 p-2 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                          placeholder="Label (optional)"
                          value={metric.label || ''}
                          onChange={(e) => updateKpiMetric(idx, { label: e.target.value })}
                        />
                        {kpiMetrics.length > 1 && (
                          <button
                            onClick={() => removeKpiMetric(idx)}
                            className="text-[10px] text-gray-400 hover:text-red-500"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-gray-500 block">Aggregation</label>
                          <select
                            className="w-full p-2 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                            value={metric.fn || 'count'}
                            onChange={(e) => updateKpiMetric(idx, { fn: e.target.value })}
                          >
                            {KPI_FUNCTIONS.map(fn => (
                              <option key={fn.value} value={fn.value}>{fn.label}</option>
                            ))}
                          </select>
                        </div>
                        {requiresMetricField(metric.fn || 'count') && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-gray-500 block">Field</label>
                            <select
                              className="w-full p-2 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                              value={metric.field || ''}
                              onChange={(e) => updateKpiMetric(idx, { field: e.target.value })}
                            >
                              <option value="">Select Field...</option>
                              {schema.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* GAUGE metric config */}
            {node.params.subtype === 'GAUGE' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 block">Aggregation</label>
                  <select
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={node.params.fn || 'count'}
                    onChange={(e) => handleChange('fn', e.target.value)}
                  >
                    {KPI_FUNCTIONS.map(fn => (
                      <option key={fn.value} value={fn.value}>{fn.label}</option>
                    ))}
                  </select>
                </div>
                {requiresMetricField(node.params.fn || 'count') && (
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700 block">Metric Field</label>
                    <select
                      className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={node.params.metricField || ''}
                      onChange={(e) => handleChange('metricField', e.target.value)}
                    >
                      <option value="">Select Field...</option>
                      {schema.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Gauge target */}
            {node.params.subtype === 'GAUGE' && (
              <div className="space-y-1 pt-2 border-t border-gray-100">
                <label className="text-sm font-semibold text-gray-700 block">Target Value (Max)</label>
                <input
                  type="number"
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={node.params.target || 100}
                  onChange={(e) => handleChange('target', Number(e.target.value))}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { PropertiesPanel };
