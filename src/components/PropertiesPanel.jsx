// src/components/PropertiesPanel.js
// Right-side configuration panel for the selected node.
import React, { useState, useEffect } from 'react';
import {
  Button,
  Card,
  Checkbox,
  ColorPicker,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Progress,
  Radio,
  Select,
  Segmented,
  Slider,
  Space,
  Switch,
  Typography,
  Upload
} from 'antd';
import { Database, Settings, Play, BarChart3, TrendingUp, Hash, Globe, Plus, Trash2 } from '../ui/icons';

const { Title, Text } = Typography;

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
      <div className="h-full flex flex-col bg-white border-l border-gray-200">
        <Card className="m-4">
          <Empty
            image={<Settings size={48} className="opacity-20" />}
            description="Select a step in the chain to configure its logic."
          />
        </Card>
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

  const handleChartTypeChange = (nextType) => {
    const updates = { chartType: nextType };
    if (nextType === 'map' && (!node.params.chartAggFn || node.params.chartAggFn === 'none')) {
      updates.chartAggFn = 'count';
    }
    handleBulkChange(updates);
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

  const selectedColumns = Array.isArray(node.params?.columns) ? node.params.columns : schema;
  const selectDropdownProps = { popupMatchSelectWidth: false, dropdownStyle: { minWidth: 320 } };
  const fullWidthSelect = { ...selectDropdownProps, style: { width: '100%' } };
  const isSourceError = sourceStatus?.title === 'Error';

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
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Text type="secondary" className="uppercase tracking-wider text-[11px]">
            {node.type === 'COMPONENT' ? node.params.subtype : node.type} Node
          </Text>
          <Input
            size="middle"
            bordered={false}
            value={node.title}
            onChange={(e) => handleMetaChange('title', e.target.value)}
            placeholder="Node title"
            style={{ paddingInline: 0, paddingBlock: 0 }}
          />
          <Text type="secondary" className="font-mono text-[11px]">
            ID: {node.id.split('-').pop()}
          </Text>
        </Space>
      </div>

      {/* Body */}
      <div className="p-5 flex-1 overflow-y-auto space-y-6">
        <Form layout="vertical" requiredMark={false}>
          {/* Shared: Branch label */}
          <Form.Item label="Branch Label">
            <Input
              placeholder="e.g. Experiment A"
              value={node.branchName || ''}
              onChange={(e) => handleMetaChange('branchName', e.target.value)}
            />
          </Form.Item>

          <Divider />

        {/* SOURCE CONFIG */}
        {node.type === 'SOURCE' && (
          <div className="space-y-4">
            {/* Table selector (only if XLSX has multiple sheets) */}
            {dataModel.order.length > 1 && (
              <Form.Item label="Table">
                <Select
                  value={node.params.table || dataModel.order[0]}
                  onChange={(value) => handleChange('table', value)}
                  options={dataModel.order.map((name) => ({ label: name, value: name }))}
                  {...fullWidthSelect}
                />
              </Form.Item>
            )}

            {/* File ingestion controls */}
            <Form.Item label="Upload data (CSV or Excel)">
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Upload
                  multiple
                  accept=".csv,.xlsx,.xls"
                  beforeUpload={() => false}
                  showUploadList={false}
                  onChange={({ fileList }) => {
                    const files = fileList.map((file) => file.originFileObj).filter(Boolean);
                    if (files.length) addPendingFiles(files);
                  }}
                >
                  <Button icon={<Plus size={14} />}>Select files</Button>
                </Upload>
                <Text type="secondary" className="text-xs">
                  Tip: uploading files replaces the data model feeding the chain.
                </Text>
              </Space>
            </Form.Item>

            {currentFiles.length > 0 && (
              <Card size="small" title="Pending Files">
                <List
                  size="small"
                  dataSource={currentFiles}
                  locale={{ emptyText: 'No pending files' }}
                  renderItem={(file, idx) => (
                    <List.Item
                      actions={[
                        <Button
                          key={`remove-${file.name}-${idx}`}
                          type="text"
                          danger
                          size="small"
                          onClick={() => removePendingFile(idx)}
                        >
                          Remove
                        </Button>
                      ]}
                    >
                      <List.Item.Meta
                        title={<Text ellipsis>{file.name}</Text>}
                        description={<Text type="secondary">{Math.round(file.size / 1024)} KB</Text>}
                      />
                    </List.Item>
                  )}
                />
                <Button type="link" size="small" onClick={clearPendingFiles}>
                  Clear all
                </Button>
              </Card>
            )}

            <Button
              type="primary"
              block
              onClick={() => onIngest && onIngest()}
              disabled={currentFiles.length === 0 || sourceStatus?.loading}
              loading={sourceStatus?.loading}
            >
              {sourceStatus?.loading ? 'Ingesting…' : 'Ingest Data'}
            </Button>

            {/* Status + progress */}
            <Card size="small">
              <Space align="start">
                <Database size={18} className={isSourceError ? 'text-red-500' : 'text-blue-600'} />
                <Space direction="vertical" size={0}>
                  <Text strong type={isSourceError ? 'danger' : undefined}>
                    {sourceStatus?.title || 'No dataset loaded'}
                  </Text>
                  <Text type="secondary" className="text-xs">
                    {sourceStatus?.detail || 'Upload a CSV or Excel file to get started.'}
                  </Text>
                </Space>
              </Space>
            </Card>
            {sourceStatus?.loading && <Progress percent={100} showInfo={false} status="active" />}

            {dataModel.order.length > 0 && (
              <Button danger block onClick={() => onClearData && onClearData()}>
                Clear data
              </Button>
            )}

            <Button
              type="default"
              block
              icon={<Database size={14} />}
              onClick={() => onShowDataModel && onShowDataModel()}
              disabled={dataModel.order.length === 0}
            >
              Preview Data Model
            </Button>
          </div>
        )}

        {/* JOIN CONFIG */}
        {node.type === 'JOIN' && (
          <div className="space-y-5">
            <Card size="small">
              <div className="text-xs font-mono text-slate-300 bg-slate-900 rounded-md p-3 overflow-x-auto border border-slate-800">
                <span className="text-pink-400">SELECT</span> * <br />
                <span className="text-pink-400">FROM</span> [Incoming_Node] <br />
                <span className="text-pink-400">{localParams.joinType || 'LEFT'} JOIN</span> {localParams.rightTable || '...'} <br />
                <span className="text-pink-400">ON</span> {localParams.leftKey || '?'} = {localParams.rightKey || '?'}
              </div>
            </Card>

            <Form.Item label="Join With Table">
              <Select
                value={localParams.rightTable || ''}
                onChange={(value) => handleLocalChange('rightTable', value)}
                options={[
                  { label: 'Select Table...', value: '' },
                  ...dataModel.order.map((name) => ({ label: name, value: name }))
                ]}
                {...fullWidthSelect}
              />
            </Form.Item>

            <Form.Item label="Join Type">
              <Radio.Group
                value={localParams.joinType || 'LEFT'}
                onChange={(e) => handleLocalChange('joinType', e.target.value)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8
                }}
              >
                {['INNER', 'LEFT', 'RIGHT', 'FULL'].map((t) => (
                  <Radio.Button key={t} value={t} style={{ width: '100%', textAlign: 'center' }}>
                    {t} JOIN
                  </Radio.Button>
                ))}
              </Radio.Group>
            </Form.Item>

            <div className="grid grid-cols-2 gap-2">
              <Form.Item label="Left Key" style={{ marginBottom: 0 }}>
                <Select
                  value={localParams.leftKey || ''}
                  onChange={(value) => handleLocalChange('leftKey', value)}
                  options={[
                    { label: 'Col...', value: '' },
                    ...schema.map((f) => ({ label: f, value: f }))
                  ]}
                  {...fullWidthSelect}
                />
              </Form.Item>
              <Form.Item label="Right Key" style={{ marginBottom: 0 }}>
                <Select
                  value={localParams.rightKey || ''}
                  onChange={(value) => handleLocalChange('rightKey', value)}
                  options={[
                    { label: 'Col...', value: '' },
                    ...((localParams.rightTable && dataModel.tables[localParams.rightTable])
                      ? Object.keys(dataModel.tables[localParams.rightTable][0] || {}).map((f) => ({ label: f, value: f }))
                      : [])
                  ]}
                  {...fullWidthSelect}
                />
              </Form.Item>
            </div>

            <Button type="primary" block icon={<Play size={16} />} onClick={commitJoin}>
              Run Join
            </Button>
          </div>
        )}

        {/* FILTER CONFIG */}
        {node.type === 'FILTER' && (
          <div className="space-y-4">
            <Form.Item label="Filter Field">
              <Select
                value={node.params.field || ''}
                onChange={(value) => handleChange('field', value)}
                options={[
                  { label: 'Select Field...', value: '' },
                  ...schema.map((f) => ({ label: f, value: f }))
                ]}
                {...fullWidthSelect}
              />
            </Form.Item>
            <Space size="small" style={{ width: '100%' }}>
              <Form.Item label="Operator" style={{ flex: 1, minWidth: 0 }}>
                <Select
                  value={node.params.operator || 'equals'}
                  onChange={(value) => handleChange('operator', value)}
                  options={[
                    { label: '=', value: 'equals' },
                    { label: '!=', value: 'not_equals' },
                    { label: '>', value: 'gt' },
                    { label: '<', value: 'lt' },
                    { label: 'In list', value: 'in' },
                    { label: 'Like', value: 'contains' }
                  ]}
                  {...selectDropdownProps}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item label="Value" style={{ flex: 2, minWidth: 0 }}>
                <Input
                  placeholder={node.params.operator === 'in' ? 'Comma-separated values...' : 'Value...'}
                  value={node.params.value || ''}
                  onChange={(e) => handleChange('value', e.target.value)}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Space>
          </div>
        )}

        {/* AGGREGATE CONFIG */}
        {node.type === 'AGGREGATE' && (
          <div className="space-y-5">
            <Form.Item label="Group By (Dimension)">
              <Select
                value={node.params.groupBy || ''}
                onChange={(value) => handleChange('groupBy', value)}
                options={[
                  { label: 'Select Dimension...', value: '' },
                  ...schema.map((f) => ({ label: f, value: f }))
                ]}
                {...fullWidthSelect}
              />
            </Form.Item>

            <Divider />
            <Form.Item label="Aggregation Function">
              <Radio.Group
                value={node.params.fn || 'count'}
                onChange={(e) => handleChange('fn', e.target.value)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8
                }}
              >
                {KPI_FUNCTIONS.map((fn) => (
                  <Radio.Button
                    key={fn.value}
                    value={fn.value}
                    style={{ width: '100%', textAlign: 'center' }}
                  >
                    {fn.label}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </Form.Item>

            {requiresMetricField(node.params.fn || 'count') && (
              <Form.Item label="Metric Field">
                <Select
                  value={node.params.metricField || ''}
                  onChange={(value) => handleChange('metricField', value)}
                  options={[
                    { label: 'Select Numeric Field...', value: '' },
                    ...schema.map((f) => ({ label: f, value: f }))
                  ]}
                  {...fullWidthSelect}
                />
              </Form.Item>
            )}
          </div>
        )}

        {/* COMPONENT CONFIG (TABLE / CHART / KPI / GAUGE) */}
        {node.type === 'COMPONENT' && (
          <div className="space-y-5">
            {/* Table Column Selection */}
            {node.params.subtype === 'TABLE' && (
              <>
              <Form.Item label="Visible Columns">
                <Checkbox.Group
                  value={selectedColumns}
                  onChange={(values) => handleChange('columns', values)}
                  options={schema.map((field) => ({ label: field, value: field }))}
                  style={{ maxHeight: 200, overflowY: 'auto', display: 'grid', gap: 4 }}
                />
                <Space size="small" style={{ marginTop: 8 }}>
                  <Button type="link" size="small" onClick={() => handleChange('columns', schema)}>
                    Select All
                  </Button>
                  <Button type="link" size="small" onClick={() => handleChange('columns', [])}>
                    Clear All
                  </Button>
                </Space>
              </Form.Item>
              <Divider />
              <Form.Item label="Default Sort">
                <Space size="small" style={{ width: '100%' }}>
                  <Select
                    placeholder="Column"
                    value={node.params.tableSortBy || ''}
                    onChange={(value) => {
                      const nextDirection = value ? (node.params.tableSortDirection || 'asc') : '';
                      handleBulkChange({ tableSortBy: value, tableSortDirection: nextDirection });
                    }}
                    options={[
                      { label: 'None', value: '' },
                      ...schema.map((field) => ({ label: field, value: field }))
                    ]}
                    style={{ flex: 1, minWidth: 0, width: '100%' }}
                    {...selectDropdownProps}
                  />
                  <Select
                    placeholder="Direction"
                    value={node.params.tableSortDirection || ''}
                    onChange={(value) => handleBulkChange({ tableSortDirection: value })}
                    disabled={!node.params.tableSortBy}
                    options={[
                      { label: 'Select...', value: '' },
                      { label: 'Ascending', value: 'asc' },
                      { label: 'Descending', value: 'desc' }
                    ]}
                    style={{ flex: 1, minWidth: 0, width: '100%' }}
                  />
                </Space>
              </Form.Item>
              </>
            )}

            {/* AI Assistant Config */}
            {node.params.subtype === 'AI' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <Title level={5} style={{ margin: 0 }}>AI Assistant</Title>
                  <Text type="secondary">
                    Ask your question inside the node card to generate a plan of nodes.
                  </Text>
                </div>
                <Form.Item label="Use LLM for smarter planning">
                  <Switch
                    checked={!!node.params.assistantUseLLM}
                    onChange={(checked) => handleChange('assistantUseLLM', checked)}
                  />
                </Form.Item>
                <Card size="small" title="OpenAI-Compatible Settings">
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Form.Item label="API Base URL">
                      <Input
                        value={llmSettings.baseUrl}
                        onChange={(e) => setLlmSettings(prev => ({ ...prev, baseUrl: e.target.value }))}
                        placeholder="https://api.openai.com/v1"
                      />
                    </Form.Item>
                    <Form.Item label="Model">
                      <Input
                        value={llmSettings.model}
                        onChange={(e) => setLlmSettings(prev => ({ ...prev, model: e.target.value }))}
                        placeholder="gpt-4o-mini"
                      />
                    </Form.Item>
                    <Form.Item label="API Key">
                      <Input.Password
                        value={llmSettings.apiKey}
                        onChange={(e) => setLlmSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                        placeholder="sk-..."
                      />
                      <Text type="secondary" className="text-xs">
                        Stored locally in your browser.
                      </Text>
                    </Form.Item>
                  </Space>
                </Card>
              </div>
            )}

            {/* Pivot Table Config */}
            {node.params.subtype === 'PIVOT' && (
              <div className="space-y-4">
                <Form.Item label="Row Field">
                  <Select
                    value={node.params.pivotRow || ''}
                    onChange={(value) => handleChange('pivotRow', value)}
                    options={[
                      { label: 'Select Row Field...', value: '' },
                      ...schema.map((f) => ({ label: f, value: f }))
                    ]}
                    {...fullWidthSelect}
                  />
                </Form.Item>
                <Form.Item label="Column Field">
                  <Select
                    value={node.params.pivotColumn || ''}
                    onChange={(value) => handleChange('pivotColumn', value)}
                    options={[
                      { label: 'Select Column Field...', value: '' },
                      ...schema.map((f) => ({ label: f, value: f }))
                    ]}
                    {...fullWidthSelect}
                  />
                </Form.Item>
                <Form.Item label="Aggregation">
                  <Select
                    value={node.params.pivotFn || 'count'}
                    onChange={(value) => handleChange('pivotFn', value)}
                    options={KPI_FUNCTIONS.map((fn) => ({ label: fn.label, value: fn.value }))}
                    {...fullWidthSelect}
                  />
                </Form.Item>
                {requiresMetricField(node.params.pivotFn || 'count') && (
                  <Form.Item label="Value Field">
                    <Select
                      value={node.params.pivotValue || ''}
                      onChange={(value) => handleChange('pivotValue', value)}
                      options={[
                        { label: 'Select Value Field...', value: '' },
                        ...schema.map((f) => ({ label: f, value: f }))
                      ]}
                      {...fullWidthSelect}
                    />
                  </Form.Item>
                )}
              </div>
            )}

            {/* Chart Type Selector */}
            {node.params.subtype === 'CHART' && (
              <Form.Item label="Chart Type">
                <Segmented
                  value={node.params.chartType || 'bar'}
                  onChange={(value) => handleChartTypeChange(value)}
                  options={[
                    { label: <Space size="small"><BarChart3 size={16} />Bar</Space>, value: 'bar' },
                    { label: <Space size="small"><TrendingUp size={16} />Line</Space>, value: 'line' },
                    { label: <Space size="small"><TrendingUp size={16} />Area</Space>, value: 'area' },
                    { label: <Space size="small"><Hash size={16} />Scatter</Space>, value: 'scatter' },
                    { label: <Space size="small"><Globe size={16} />Map</Space>, value: 'map' }
                  ]}
                  block
                />
              </Form.Item>
            )}

            {/* Axis Config for Charts */}
            {node.params.subtype === 'CHART' && (
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <Form.Item
                  label={node.params.chartType === 'map' ? 'Map Field (ISO-3)' : 'X Axis (Category)'}
                >
                  <Select
                    value={node.params.xAxis || ''}
                    onChange={(value) => handleChange('xAxis', value)}
                    options={[
                      { label: 'Auto Select', value: '' },
                      ...(categoricalFields.length > 0
                        ? categoricalFields.map((f) => ({ label: f, value: f }))
                        : []),
                      ...(numericFields.length > 0
                        ? numericFields.map((f) => ({ label: f, value: f }))
                        : []),
                      ...(categoricalFields.length === 0 && numericFields.length === 0
                        ? schema.map((f) => ({ label: f, value: f }))
                        : [])
                    ]}
                    {...fullWidthSelect}
                  />
                </Form.Item>
                <Form.Item label={node.params.chartType === 'map' ? 'Value Field' : 'Y Axis (Value)'}>
                  <Select
                    value={node.params.yAxis || ''}
                    onChange={(value) => handleChange('yAxis', value)}
                    options={[
                      { label: 'Auto Select', value: '' },
                      ...(numericFields.length > 0 ? numericFields : schema).map((f) => ({ label: f, value: f }))
                    ]}
                    {...fullWidthSelect}
                  />
                </Form.Item>
                <Form.Item label={node.params.chartType === 'map' ? 'Aggregation' : 'Y Axis Aggregation'}>
                  <Select
                    value={(node.params.chartType === 'map' && node.params.chartAggFn === 'none')
                      ? 'count'
                      : (node.params.chartAggFn ?? 'none')}
                    onChange={(value) => handleChange('chartAggFn', value)}
                    disabled={node.params.chartType === 'scatter'}
                    options={(node.params.chartType === 'map'
                      ? CHART_AGG_FUNCTIONS.filter(fn => fn.value !== 'none')
                      : CHART_AGG_FUNCTIONS
                    ).map((fn) => ({ label: fn.label, value: fn.value }))}
                    {...fullWidthSelect}
                  />
                  {node.params.chartType === 'scatter' && (
                    <Text type="secondary" className="text-xs">
                      Aggregation is not applied to scatter charts.
                    </Text>
                  )}
                  {node.params.chartType === 'map' && (
                    <Text type="secondary" className="text-xs">
                      Map requires a per-country aggregation.
                    </Text>
                  )}
                </Form.Item>
              </div>
            )}

            {node.params.subtype === 'CHART' && (
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <Title level={5} style={{ margin: 0 }}>Chart Options</Title>
                {node.params.chartType === 'map' ? (
                  <>
                    <Form.Item label="Show tooltip">
                      <Switch
                        checked={node.params.chartShowTooltip !== false}
                        onChange={(checked) => handleChange('chartShowTooltip', checked)}
                      />
                    </Form.Item>
                    <Form.Item label="Map Color">
                      <Space size="small" style={{ width: '100%' }}>
                        <ColorPicker
                          value={node.params.chartColor || '#2563eb'}
                          onChange={(color) => handleChange('chartColor', color.toHexString())}
                        />
                        <Input
                          value={node.params.chartColor || '#2563eb'}
                          onChange={(e) => handleChange('chartColor', e.target.value)}
                          style={{ flex: 1, minWidth: 0 }}
                        />
                      </Space>
                    </Form.Item>
                  </>
                ) : (
                  <>
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <Checkbox
                        checked={node.params.chartShowGrid !== false}
                        onChange={(e) => handleChange('chartShowGrid', e.target.checked)}
                      >
                        Show grid
                      </Checkbox>
                      <Checkbox
                        checked={node.params.chartShowTooltip !== false}
                        onChange={(e) => handleChange('chartShowTooltip', e.target.checked)}
                      >
                        Show tooltip
                      </Checkbox>
                      <Checkbox
                        checked={!!node.params.chartShowPoints}
                        onChange={(e) => handleChange('chartShowPoints', e.target.checked)}
                      >
                        Show points
                      </Checkbox>
                      <Checkbox
                        checked={!!node.params.chartStacked}
                        onChange={(e) => handleChange('chartStacked', e.target.checked)}
                      >
                        Stacked
                      </Checkbox>
                    </Space>
                    <Form.Item label="Curve">
                      <Select
                        value={node.params.chartCurve || 'linear'}
                        onChange={(value) => handleChange('chartCurve', value)}
                        options={[
                          { label: 'Linear', value: 'linear' },
                          { label: 'Monotone', value: 'monotone' },
                          { label: 'Step', value: 'step' }
                        ]}
                        {...fullWidthSelect}
                      />
                    </Form.Item>
                    <Form.Item label="Orientation">
                      <Select
                        value={node.params.chartOrientation || 'vertical'}
                        onChange={(value) => handleChange('chartOrientation', value)}
                        disabled={node.params.chartType !== 'bar'}
                        options={[
                          { label: 'Vertical (columns)', value: 'vertical' },
                          { label: 'Horizontal (bars)', value: 'horizontal' }
                        ]}
                        {...fullWidthSelect}
                      />
                      {node.params.chartType !== 'bar' && (
                        <Text type="secondary" className="text-xs">
                          Orientation applies to bar charts.
                        </Text>
                      )}
                    </Form.Item>
                    <Form.Item label="Bar Gap">
                      <Space size="small" style={{ width: '100%' }}>
                        <Slider
                          min={0}
                          max={0.8}
                          step={0.05}
                          value={node.params.chartBarGap ?? 0.2}
                          onChange={(value) => handleChange('chartBarGap', value)}
                          disabled={node.params.chartType !== 'bar'}
                          style={{ flex: 1 }}
                        />
                        <Text type="secondary" className="text-xs w-10 text-right">
                          {(node.params.chartBarGap ?? 0.2).toFixed(2)}
                        </Text>
                      </Space>
                      {node.params.chartType !== 'bar' && (
                        <Text type="secondary" className="text-xs">
                          Bar gap applies to bar charts.
                        </Text>
                      )}
                    </Form.Item>
                    <Form.Item label="Series Color">
                      <Space size="small" style={{ width: '100%' }}>
                        <ColorPicker
                          value={node.params.chartColor || '#2563eb'}
                          onChange={(color) => handleChange('chartColor', color.toHexString())}
                        />
                        <Input
                          value={node.params.chartColor || '#2563eb'}
                          onChange={(e) => handleChange('chartColor', e.target.value)}
                          style={{ flex: 1, minWidth: 0 }}
                        />
                      </Space>
                    </Form.Item>
                  </>
                )}
              </div>
            )}

            {/* KPI metric config */}
            {node.params.subtype === 'KPI' && (
              <div className="space-y-4">
                <Space align="center" className="w-full justify-between">
                  <Text strong>Metrics</Text>
                  <Button size="small" type="link" icon={<Plus size={14} />} onClick={addKpiMetric}>
                    Add Metric
                  </Button>
                </Space>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  {kpiMetrics.map((metric, idx) => (
                    <Card key={metric.id || idx} size="small">
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        <Space align="center" style={{ width: '100%' }}>
                          <Input
                            placeholder="Label (optional)"
                            value={metric.label || ''}
                            onChange={(e) => updateKpiMetric(idx, { label: e.target.value })}
                            style={{ flex: 1, minWidth: 0 }}
                          />
                          {kpiMetrics.length > 1 && (
                            <Button
                              type="text"
                              danger
                              icon={<Trash2 size={14} />}
                              onClick={() => removeKpiMetric(idx)}
                            />
                          )}
                        </Space>
                        <Space size="small" style={{ width: '100%' }}>
                          <Select
                            value={metric.fn || 'count'}
                            onChange={(value) => updateKpiMetric(idx, { fn: value })}
                            options={KPI_FUNCTIONS.map((fn) => ({ label: fn.label, value: fn.value }))}
                            style={{ flex: 1, minWidth: 0, width: '100%' }}
                            {...selectDropdownProps}
                          />
                          {requiresMetricField(metric.fn || 'count') && (
                            <Select
                              value={metric.field || ''}
                              onChange={(value) => updateKpiMetric(idx, { field: value })}
                              options={[
                                { label: 'Select Field...', value: '' },
                                ...schema.map((f) => ({ label: f, value: f }))
                              ]}
                              style={{ flex: 1, minWidth: 0, width: '100%' }}
                              {...selectDropdownProps}
                            />
                          )}
                        </Space>
                      </Space>
                    </Card>
                  ))}
                </Space>
              </div>
            )}

            {/* GAUGE metric config */}
            {node.params.subtype === 'GAUGE' && (
              <div className="space-y-4">
                <Form.Item label="Aggregation">
                  <Select
                    value={node.params.fn || 'count'}
                    onChange={(value) => handleChange('fn', value)}
                    options={KPI_FUNCTIONS.map((fn) => ({ label: fn.label, value: fn.value }))}
                    {...fullWidthSelect}
                  />
                </Form.Item>
                {requiresMetricField(node.params.fn || 'count') && (
                  <Form.Item label="Metric Field">
                    <Select
                      value={node.params.metricField || ''}
                      onChange={(value) => handleChange('metricField', value)}
                      options={[
                        { label: 'Select Field...', value: '' },
                        ...schema.map((f) => ({ label: f, value: f }))
                      ]}
                      {...fullWidthSelect}
                    />
                  </Form.Item>
                )}
              </div>
            )}

            {/* Gauge target */}
            {node.params.subtype === 'GAUGE' && (
              <div className="space-y-1 pt-2 border-t border-gray-100">
                <Form.Item label="Target Value (Max)">
                  <InputNumber
                    min={0}
                    value={node.params.target || 100}
                    onChange={(value) => handleChange('target', Number(value))}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </div>
            )}
          </div>
        )}
        </Form>
      </div>
    </div>
  );
};

export { PropertiesPanel };
