import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from './ui/select';
import { Separator } from './ui/separator';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Empty } from './ui/empty';
import { Database, Settings, Play, BarChart3, TrendingUp, Hash, Globe, Plus, Trash2, Minimize2 } from '../icons';
import { normalizeFilters } from '../lib/filterUtils';
import { AlertCircle } from 'lucide-react';

const MAX_UPLOAD_MB = 30;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

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

const requiresMetricField = (fn: string) => ['sum', 'avg', 'min', 'max', 'count_distinct'].includes(fn);
const DEFAULT_LLM_SETTINGS = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: ''
};

// LLM settings are kept in component state only; EMS hosts can supply a
// persistence callback in the future if the AI Assistant capability is
// enabled.
const readStoredLlmSettings = () => ({ ...DEFAULT_LLM_SETTINGS });

const Field = ({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={`space-y-1.5 ${className}`}>
    <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
    {children}
  </div>
);

interface ToggleGroupProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: React.ReactNode; disabled?: boolean; icon?: React.ReactNode }[];
  columns?: number;
}

const ToggleGroup = ({ value, onChange, options, columns = 2 }: ToggleGroupProps) => (
  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        disabled={opt.disabled}
        className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
          value === opt.value
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'
        } ${opt.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={() => !opt.disabled && onChange(opt.value)}
      >
        {opt.icon}
        {opt.label}
      </button>
    ))}
  </div>
);

interface PropertiesPanelProps {
  node: any;
  updateNode: (id: string, params: any, isMeta?: boolean) => void;
  schema: string[];
  data?: any[];
  dataModel: any;
  availableTables: any;
  sourceStatus: any;
  onIngest?: (files?: File[]) => void;
  onClearData?: () => void;
  onShowDataModel?: () => void;
  assetType?: string;
  isFlattenedDataset?: boolean;
  onCollapse?: () => void;
  activeFilterIndex?: number;
  nodeResult?: any;
  isMobile?: boolean;
}

const PropertiesPanel = ({
  node,
  updateNode,
  schema,
  data = [],
  dataModel,
  availableTables,
  sourceStatus,
  onIngest,
  onClearData,
  onShowDataModel,
  assetType,
  isFlattenedDataset = false,
  onCollapse,
  activeFilterIndex,
  nodeResult,
  isMobile = false
}: PropertiesPanelProps) => {
  const [localParams, setLocalParams] = useState<any>({});
  const [llmSettings, setLlmSettings] = useState(readStoredLlmSettings);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (node) setLocalParams(node.params || {});
  }, [node?.id, node?.params]);

  // LLM settings persistence is intentionally removed in the extracted
  // asset; the EMS host owns persistence via the YAML state channel.

  const numericFields = React.useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    const sample = data.slice(0, 50);
    return schema.filter((field) => sample.some((row) => {
      const raw = row?.[field];
      if (raw === null || raw === undefined || raw === '') return false;
      return !Number.isNaN(Number(raw));
    }));
  }, [data, schema]);

  const categoricalFields = React.useMemo(
    () => schema.filter((field) => !numericFields.includes(field)),
    [schema, numericFields]
  );

  const containerWidthClass = isMobile ? 'w-full' : 'w-80';
  const containerBorderClass = isMobile ? 'border-transparent' : 'border-l border-border';
  const headerPaddingClass = isMobile ? 'p-4' : 'p-5';
  const bodyPaddingClass = isMobile ? 'p-4' : 'p-5';
  const emptyCardMarginClass = isMobile ? 'm-3' : 'm-4';
  const isRawDatasetAsset = assetType === 'rawDataset';

  if (!node) {
    return (
      <div className={`h-full flex flex-col bg-background ${containerBorderClass}`}>
        <div className={`${headerPaddingClass} border-b border-border bg-background`}>
          <div className="flex items-center justify-between gap-3">
            <span className="uppercase tracking-wider text-[11px] text-muted-foreground">Properties</span>
            {onCollapse && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCollapse} title="Collapse panel" aria-label="Collapse panel">
                <Minimize2 size={16} />
              </Button>
            )}
          </div>
        </div>
        <Card className={emptyCardMarginClass}>
          <CardContent className="p-6">
            <Empty
              icon={<Settings size={48} className="opacity-20" />}
              description="Select a step in the chain to configure its logic."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleChange = (key: string, value: any) => {
    const newParams = { ...node.params, [key]: value };
    updateNode(node.id, newParams);
    setLocalParams(newParams);
  };

  const handleBulkChange = (updates: Record<string, any>) => {
    const newParams = { ...node.params, ...updates };
    updateNode(node.id, newParams);
    setLocalParams(newParams);
  };

  const handleChartTypeChange = (nextType: string) => {
    const updates: any = { chartType: nextType };
    if (nextType === 'map' && (!node.params.chartAggFn || node.params.chartAggFn === 'none')) {
      updates.chartAggFn = 'count';
    }
    handleBulkChange(updates);
  };

  const handleLocalChange = (key: string, value: any) => {
    setLocalParams((prev: any) => ({ ...prev, [key]: value }));
  };

  const commitJoin = () => updateNode(node.id, localParams);
  const handleMetaChange = (key: string, value: any) => {
    if (key === 'title') {
      updateNode(node.id, { title: value, titleIsCustom: true }, true);
      return;
    }
    updateNode(node.id, { [key]: value }, true);
  };

  const currentFiles: File[] = node.params?.__files || [];
  const ingestionMode = node.params?.ingestionMode || 'manual';
  const rawIngestionMode = (ingestionMode === 'manual' || ingestionMode === 'api') ? ingestionMode : 'manual';
  const inheritedTable = node.params?.inheritedTable || '';

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isRawDatasetAsset) return;
    if (!node || node.type !== 'SOURCE') return;
    if (ingestionMode !== 'manual' && ingestionMode !== 'api') {
      handleChange('ingestionMode', 'manual');
    }
  }, [isRawDatasetAsset, node, ingestionMode]);

  const sqlMode = localParams.sqlMode || 'visual';
  const sqlError = nodeResult?.error || '';
  const localTables = availableTables?.local || [];
  const externalTables = availableTables?.external || [];
  const datasetTables = externalTables.filter((table: any) => table.isDataset);
  const incomingTableName = availableTables?.incoming || 'incoming';
  const inheritedEntry = datasetTables.find((table: any) => (
    table.name === inheritedTable || table.legacyName === inheritedTable
  )) || externalTables.find((table: any) => (
    table.name === inheritedTable || table.legacyName === inheritedTable
  ));
  const inheritedLabel = inheritedEntry?.label || inheritedTable || '';
  const rightTableEntry = externalTables.find((table: any) => (
    table.name === localParams.rightTable || table.legacyName === localParams.rightTable
  ));
  const rightTableLabel = rightTableEntry?.label || localParams.rightTable || '';
  const rightTableSchema = React.useMemo(() => {
    const rightTable = localParams.rightTable;
    if (!rightTable) return [] as string[];
    const localRows = dataModel?.tables?.[rightTable];
    if (Array.isArray(localRows) && localRows.length > 0) {
      return Object.keys(localRows[0] || {});
    }
    const externalEntry = externalTables.find((table: any) => (
      table.name === rightTable || table.legacyName === rightTable
    ));
    if (Array.isArray(externalEntry?.schema) && externalEntry.schema.length > 0) {
      return externalEntry.schema;
    }
    if (Array.isArray(externalEntry?.rows) && externalEntry.rows.length > 0) {
      return Object.keys(externalEntry.rows[0] || {});
    }
    return [] as string[];
  }, [localParams.rightTable, dataModel, externalTables]);

  const getTotalBytes = (files: File[] = []) => files.reduce((sum, file) => sum + (file?.size || 0), 0);
  const totalPendingBytes = getTotalBytes(currentFiles);
  const totalPendingMb = (totalPendingBytes / (1024 * 1024)).toFixed(1);
  const hasLoadedData = (dataModel?.order || []).length > 0;

  const addPendingFiles = (incoming: File[]) => {
    setUploadError('');
    const merged = [...currentFiles];
    const seen = new Set(currentFiles.map(file => `${file.name}-${file.size}-${file.lastModified}`));
    let skippedOversize = false;
    incoming.forEach((file) => {
      if ((file?.size || 0) > MAX_UPLOAD_BYTES) {
        skippedOversize = true;
        return;
      }
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (!seen.has(key)) {
        merged.push(file);
        seen.add(key);
      }
    });
    if (skippedOversize) {
      setUploadError(`Some files exceed the ${MAX_UPLOAD_MB} MB per-file limit and were skipped.`);
    }
    const nextTotal = getTotalBytes(merged);
    if (nextTotal > MAX_UPLOAD_BYTES) {
      setUploadError(`Total upload size exceeds ${MAX_UPLOAD_MB} MB limit.`);
      return;
    }
    handleChange('__files', merged);
  };

  const removePendingFile = (index: number) => {
    const next = currentFiles.filter((_: any, idx: number) => idx !== index);
    setUploadError('');
    handleChange('__files', next);
  };

  const clearPendingFiles = () => {
    setUploadError('');
    handleChange('__files', []);
  };

  const kpiMetrics = (node.type === 'COMPONENT' && node.params.subtype === 'KPI')
    ? (node.params.metrics && node.params.metrics.length > 0
      ? node.params.metrics
      : [{ id: 'metric-default', label: '', fn: node.params.fn || 'count', field: node.params.metricField || '' }])
    : [];

  const selectedColumns: string[] = Array.isArray(node.params?.columns) ? node.params.columns : schema;
  const rawDatasetColumns: string[] = Array.isArray(node.params?.visibleColumns) ? node.params.visibleColumns : schema;
  const isSourceError = sourceStatus?.title === 'Error';
  const filters = node.type === 'FILTER' ? normalizeFilters(node.params) : [];

  const updateKpiMetric = (idx: number, updates: any) => {
    const next = kpiMetrics.map((metric: any, index: number) => index === idx ? { ...metric, ...updates } : metric);
    handleChange('metrics', next);
  };

  const addKpiMetric = () => {
    const next = [...kpiMetrics, { id: `metric-${Date.now()}`, label: '', fn: 'count', field: '' }];
    handleChange('metrics', next);
  };

  const removeKpiMetric = (idx: number) => {
    const next = kpiMetrics.filter((_: any, index: number) => index !== idx);
    handleChange('metrics', next);
  };

  const updateFilterAtIndex = (idx: number, updates: any) => {
    const next = filters.map((filter: any, index: number) => (
      index === idx ? { ...filter, ...updates, mode: 'operator' } : filter
    ));
    handleChange('filters', next);
  };

  const addFilter = () => {
    const next = [...filters, { id: `filter-${Date.now()}`, field: '', operator: 'equals', value: '', mode: 'operator' }];
    handleChange('filters', next);
  };

  const removeFilter = (idx: number) => {
    const next = filters.filter((_: any, index: number) => index !== idx);
    handleChange('filters', next);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) addPendingFiles(files);
    e.target.value = '';
  };

  const renderSimpleSelect = (
    value: string,
    onChange: (val: string) => void,
    options: { label: string; value: string; disabled?: boolean }[],
    placeholder?: string
  ) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder || 'Select...'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value || '__empty__'} disabled={opt.disabled}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderGroupedSelect = (
    value: string,
    onChange: (val: string) => void,
    groups: { label: string; options: { label: string; value: string }[] }[],
    placeholder?: string
  ) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder || 'Select...'} />
      </SelectTrigger>
      <SelectContent className="min-w-[320px]">
        {groups.map((group, gi) => (
          <SelectGroup key={gi}>
            {group.label && <SelectLabel>{group.label}</SelectLabel>}
            {group.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value || '__empty__'}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );

  const renderManualIngestionControls = () => (
    <>
      {dataModel.order.length > 1 && (
        <Field label="Table">
          {renderSimpleSelect(
            node.params.table || dataModel.order[0],
            (value) => handleChange('table', value === '__empty__' ? '' : value),
            dataModel.order.map((name: string) => ({ label: name, value: name }))
          )}
        </Field>
      )}

      <Field label="Upload data (CSV or Excel)">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Plus size={14} className="mr-1" />
              Select files
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: uploading files replaces the data model feeding the chain.
          </p>
          <p className="text-xs text-muted-foreground">
            Max {MAX_UPLOAD_MB} MB per file / {MAX_UPLOAD_MB} MB total. Selected: {totalPendingMb} MB.
          </p>
          {uploadError && (
            <p className="text-xs text-destructive">{uploadError}</p>
          )}
        </div>
      </Field>

      {currentFiles.length > 0 && (
        <Card>
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm">Pending Files</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {currentFiles.map((file, idx) => (
              <div key={`pending-${file.name}-${idx}`} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{Math.round(file.size / 1024)} KB</p>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => removePendingFile(idx)}>
                  Remove
                </Button>
              </div>
            ))}
            <Button variant="link" size="sm" onClick={clearPendingFiles}>Clear all</Button>
          </CardContent>
        </Card>
      )}

      <Button
        className="w-full"
        onClick={() => onIngest && onIngest()}
        disabled={currentFiles.length === 0 || sourceStatus?.loading}
      >
        {sourceStatus?.loading ? 'Ingesting...' : 'Ingest Data'}
      </Button>

      <Card>
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <Database size={18} className={isSourceError ? 'text-destructive' : 'text-primary'} />
            <div className="flex flex-col">
              <span className={`text-sm font-medium ${isSourceError ? 'text-destructive' : ''}`}>
                {sourceStatus?.title || 'No dataset loaded'}
              </span>
              <span className="text-xs text-muted-foreground">
                {sourceStatus?.detail || 'Upload a CSV or Excel file to get started.'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
      {sourceStatus?.loading && <Progress value={100} className="animate-pulse" />}

      {dataModel.order.length > 0 && (
        <Button variant="destructive" className="w-full" onClick={() => onClearData && onClearData()}>
          Clear data
        </Button>
      )}

      <Button variant="outline" className="w-full" onClick={() => onShowDataModel && onShowDataModel()} disabled={dataModel.order.length === 0}>
        <Database size={14} className="mr-2" />
        Preview Data Model
      </Button>
    </>
  );

  const renderCheckboxGroup = (values: string[], onChange: (vals: string[]) => void, options: string[]) => (
    <div className="grid gap-1 max-h-[200px] overflow-y-auto">
      {options.map((field) => (
        <label key={field} className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
          <Checkbox
            checked={values.includes(field)}
            onCheckedChange={(checked) => {
              if (checked) onChange([...values, field]);
              else onChange(values.filter((v) => v !== field));
            }}
          />
          {field}
        </label>
      ))}
    </div>
  );

  return (
    <div className={`h-full flex flex-col bg-background shadow-xl shadow-background/50 animate-in slide-in-from-right duration-300 z-50 ${containerWidthClass} ${containerBorderClass}`}>
      <div className={`${headerPaddingClass} border-b border-border bg-background`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            {isRawDatasetAsset ? (
              <>
                <span className="uppercase tracking-wider text-[11px] text-muted-foreground">Raw dataset</span>
                <span className="text-sm font-medium text-foreground">Ingestion</span>
              </>
            ) : (
              <>
                <span className="uppercase tracking-wider text-[11px] text-muted-foreground">
                  {(node.type === 'COMPONENT'
                    ? node.params.subtype
                    : (node.type === 'JOIN' ? 'SQL' : node.type))} Node
                </span>
                <Input
                  value={node.title}
                  onChange={(e) => handleMetaChange('title', e.target.value)}
                  placeholder="Node title"
                  className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0"
                />
                <span className="font-mono text-[11px] text-muted-foreground">
                  ID: {node.id.split('-').pop()}
                </span>
              </>
            )}
          </div>
          {onCollapse && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCollapse} title="Collapse panel" aria-label="Collapse panel">
              <Minimize2 size={16} />
            </Button>
          )}
        </div>
      </div>

      <div className={`${bodyPaddingClass} flex-1 overflow-y-auto space-y-6`}>
        <div className="space-y-5">
          {!isRawDatasetAsset && (
            <>
              <Field label="Branch Label">
                <Input
                  placeholder="e.g. Experiment A"
                  value={node.branchName || ''}
                  onChange={(e) => handleMetaChange('branchName', e.target.value)}
                />
              </Field>
              <Separator />
            </>
          )}

          {node.type === 'SOURCE' && (
            <div className="space-y-4">
              {isFlattenedDataset ? (
                <>
                  {dataModel.order.length > 1 && (
                    <Field label="Table">
                      {renderSimpleSelect(
                        node.params.table || dataModel.order[0],
                        (value) => handleChange('table', value === '__empty__' ? '' : value),
                        dataModel.order.map((name: string) => ({ label: name, value: name }))
                      )}
                    </Field>
                  )}
                  <Button variant="outline" className="w-full" onClick={() => onShowDataModel && onShowDataModel()} disabled={dataModel.order.length === 0}>
                    <Database size={14} className="mr-2" />
                    Preview Data Model
                  </Button>
                </>
              ) : (
                <>
                  {isRawDatasetAsset ? (
                    <>
                      <Field label="Ingestion Mode">
                        <ToggleGroup
                          value={rawIngestionMode}
                          onChange={(val) => handleChange('ingestionMode', val)}
                          options={[
                            { value: 'manual', label: 'Manual upload' },
                            { value: 'api', label: 'API connection', disabled: true }
                          ]}
                        />
                        <p className="text-xs text-muted-foreground mt-1">API connections are coming soon.</p>
                      </Field>
                      {rawIngestionMode === 'manual' ? renderManualIngestionControls() : (
                        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">API connections are not available yet.</p></CardContent></Card>
                      )}
                    </>
                  ) : (
                    <>
                      <Field label="Ingestion Mode">
                        <ToggleGroup
                          value={ingestionMode}
                          onChange={(val) => handleChange('ingestionMode', val)}
                          options={[
                            { value: 'manual', label: 'Manual upload' },
                            { value: 'inherited', label: 'Inherited table' }
                          ]}
                        />
                      </Field>
                      {ingestionMode === 'manual' && renderManualIngestionControls()}
                      {ingestionMode === 'inherited' && (
                        <>
                          <Field label="Inherited table">
                            {renderSimpleSelect(
                              inheritedTable || '__empty__',
                              (val) => handleChange('inheritedTable', val === '__empty__' ? '' : val),
                              [
                                { label: 'Select table...', value: '__empty__' },
                                ...datasetTables.map((table: any) => ({ label: table.label, value: table.name })),
                                ...(inheritedTable && !datasetTables.some((table: any) => table.name === inheritedTable)
                                  ? [{ label: inheritedLabel || inheritedTable, value: inheritedTable }]
                                  : [])
                              ]
                            )}
                          </Field>
                          {datasetTables.length === 0 && (
                            <p className="text-xs text-muted-foreground">No datasets available yet.</p>
                          )}
                          <Card>
                            <CardContent className="p-3">
                              <div className="flex items-start gap-3">
                                <Database size={18} className={inheritedTable ? 'text-primary' : 'text-muted-foreground'} />
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">{inheritedTable ? 'Inherited table connected' : 'Select an inherited table'}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {inheritedTable
                                      ? `Using ${inheritedLabel || inheritedTable} from another asset.`
                                      : 'Pick a saved dataset or asset output to start here.'}
                                  </span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </>
                      )}
                    </>
                  )}
                  {assetType === 'rawDataset' && schema.length > 0 && (
                    <>
                      <Separator />
                      <Field label="Visible Columns">
                        {renderCheckboxGroup(rawDatasetColumns, (vals) => handleChange('visibleColumns', vals), schema)}
                        <div className="flex items-center gap-2 mt-2">
                          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => handleChange('visibleColumns', schema)}>Select All</Button>
                          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => handleChange('visibleColumns', [])}>Clear All</Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Hidden columns will be removed from the saved dataset.</p>
                      </Field>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {node.type === 'JOIN' && (
            <div className="space-y-5">
              <Card>
                <CardContent className="p-0">
                  <div className="text-xs font-mono text-slate-300 bg-slate-900 rounded-md p-3 overflow-x-auto border border-slate-800">
                    {sqlMode === 'custom' ? (
                      <pre className="whitespace-pre-wrap m-0">{localParams.sqlText?.trim() || `SELECT * FROM ${incomingTableName}`}</pre>
                    ) : (
                      <>
                        <span className="text-pink-400">SELECT</span> * <br />
                        <span className="text-pink-400">FROM</span> {incomingTableName} <br />
                        <span className="text-pink-400">{localParams.joinType || 'LEFT'} JOIN</span> {rightTableLabel || '...'} <br />
                        <span className="text-pink-400">ON</span> {localParams.leftKey || '?'} = {localParams.rightKey || '?'}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Field label="SQL Mode">
                <ToggleGroup
                  value={sqlMode}
                  onChange={(val) => handleLocalChange('sqlMode', val)}
                  options={[
                    { value: 'visual', label: 'Visual join' },
                    { value: 'custom', label: 'Custom SQL' }
                  ]}
                />
              </Field>

              {sqlMode === 'visual' ? (
                <>
                  <Field label="Join With Table">
                    {renderGroupedSelect(
                      localParams.rightTable || '__empty__',
                      (val) => handleLocalChange('rightTable', val === '__empty__' ? '' : val),
                      [
                        { label: '', options: [{ label: 'Select Table...', value: '__empty__' }] },
                        ...(localTables.length > 0 ? [{ label: 'Local tables', options: localTables.map((t: any) => ({ label: t.label, value: t.name })) }] : []),
                        ...(externalTables.length > 0 ? [{ label: 'Other assets', options: externalTables.map((t: any) => ({ label: t.isDataset ? `${t.label} (dataset)` : t.label, value: t.name })) }] : [])
                      ]
                    )}
                  </Field>

                  <Field label="Join Type">
                    <ToggleGroup
                      value={localParams.joinType || 'LEFT'}
                      onChange={(val) => handleLocalChange('joinType', val)}
                      options={['INNER', 'LEFT', 'RIGHT', 'FULL'].map((t) => ({ value: t, label: `${t} JOIN` }))}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Left Key">
                      {renderSimpleSelect(
                        localParams.leftKey || '__empty__',
                        (val) => handleLocalChange('leftKey', val === '__empty__' ? '' : val),
                        [{ label: 'Col...', value: '__empty__' }, ...schema.map((f) => ({ label: f, value: f }))]
                      )}
                    </Field>
                    <Field label="Right Key">
                      {renderSimpleSelect(
                        localParams.rightKey || '__empty__',
                        (val) => handleLocalChange('rightKey', val === '__empty__' ? '' : val),
                        [{ label: 'Col...', value: '__empty__' }, ...rightTableSchema.map((f: string) => ({ label: f, value: f }))]
                      )}
                    </Field>
                  </div>

                  <Button className="w-full" onClick={commitJoin}><Play size={16} className="mr-2" />Run Join</Button>
                </>
              ) : (
                <>
                  <Field label="SQL Query">
                    <Textarea
                      value={localParams.sqlText || ''}
                      onChange={(e) => handleLocalChange('sqlText', e.target.value)}
                      placeholder={`SELECT * FROM ${incomingTableName} WHERE ...`}
                      rows={8}
                    />
                  </Field>
                  <Card>
                    <CardContent className="p-3 space-y-2">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Available tables</span>
                      <div className="flex flex-wrap gap-1">
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30">{incomingTableName}</Badge>
                        {localTables.map((table: any) => (
                          <Badge key={`local-${table.name}`} variant="secondary" title={table.sqlName && table.sqlName !== table.name ? `Original: ${table.name}` : undefined}>
                            {table.sqlName || table.name}
                          </Badge>
                        ))}
                        {externalTables.map((table: any) => (
                          <Badge key={`ext-${table.name}`} className={table.isDataset ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300'} title={table.label}>
                            {table.name}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  {sqlError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>SQL error</AlertTitle>
                      <AlertDescription>{sqlError}</AlertDescription>
                    </Alert>
                  )}
                  <Button className="w-full" onClick={commitJoin}><Play size={16} className="mr-2" />Run SQL</Button>
                </>
              )}
            </div>
          )}

          {node.type === 'FILTER' && (
            <div className="space-y-4">
              {filters.length > 0 && (
                <div className="space-y-3">
                  {filters.map((filter: any, idx: number) => {
                    const isActive = activeFilterIndex === idx;
                    return (
                      <div
                        key={filter.id || `filter-${idx}`}
                        className={`rounded-lg border px-3 py-3 ${isActive ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}
                      >
                        <div className="flex items-start gap-2">
                          <Field label="Filter Field" className="flex-1 min-w-0">
                            {renderSimpleSelect(
                              filter.field || '__empty__',
                              (val) => updateFilterAtIndex(idx, { field: val === '__empty__' ? '' : val }),
                              [{ label: 'Select Field...', value: '__empty__' }, ...schema.map((f) => ({ label: f, value: f }))]
                            )}
                          </Field>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeFilter(idx)} aria-label="Remove filter">
                            <Trash2 size={14} />
                          </Button>
                        </div>
                        <div className="flex items-end gap-2 mt-2">
                          <Field label="Operator" className="flex-1 min-w-0">
                            {renderSimpleSelect(
                              filter.operator || 'equals',
                              (val) => updateFilterAtIndex(idx, { operator: val }),
                              [
                                { label: '=', value: 'equals' },
                                { label: '!=', value: 'not_equals' },
                                { label: '>', value: 'gt' },
                                { label: '<', value: 'lt' },
                                { label: 'In list', value: 'in' },
                                { label: 'Like', value: 'contains' }
                              ]
                            )}
                          </Field>
                          <Field label="Value" className="flex-[2] min-w-0">
                            <Input
                              placeholder={filter.operator === 'in' ? 'Comma-separated values...' : 'Value...'}
                              value={filter.value ?? ''}
                              onChange={(e) => updateFilterAtIndex(idx, { value: e.target.value })}
                            />
                          </Field>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button variant="outline" className="w-full border-dashed" onClick={addFilter}>
                <Plus size={16} className="mr-2" />Add Filter
              </Button>
            </div>
          )}

          {node.type === 'AGGREGATE' && (
            <div className="space-y-5">
              <Field label="Group By (Dimension)">
                {renderSimpleSelect(
                  node.params.groupBy || '__empty__',
                  (val) => handleChange('groupBy', val === '__empty__' ? '' : val),
                  [{ label: 'Select Dimension...', value: '__empty__' }, ...schema.map((f) => ({ label: f, value: f }))]
                )}
              </Field>
              <Separator />
              <Field label="Aggregation Function">
                <ToggleGroup
                  value={node.params.fn || 'count'}
                  onChange={(val) => handleChange('fn', val)}
                  options={KPI_FUNCTIONS.map((fn) => ({ value: fn.value, label: fn.label }))}
                />
              </Field>
              {requiresMetricField(node.params.fn || 'count') && (
                <Field label="Metric Field">
                  {renderSimpleSelect(
                    node.params.metricField || '__empty__',
                    (val) => handleChange('metricField', val === '__empty__' ? '' : val),
                    [{ label: 'Select Numeric Field...', value: '__empty__' }, ...schema.map((f) => ({ label: f, value: f }))]
                  )}
                </Field>
              )}
            </div>
          )}

          {node.type === 'COMPONENT' && (
            <div className="space-y-5">
              {node.params.subtype === 'TABLE' && (
                <>
                  <Field label="Visible Columns">
                    {renderCheckboxGroup(selectedColumns, (vals) => handleChange('columns', vals), schema)}
                    <div className="flex items-center gap-2 mt-2">
                      <Button variant="link" size="sm" className="h-auto p-0" onClick={() => handleChange('columns', schema)}>Select All</Button>
                      <Button variant="link" size="sm" className="h-auto p-0" onClick={() => handleChange('columns', [])}>Clear All</Button>
                    </div>
                  </Field>
                  <Field label="Table stats">
                    <Switch checked={!!node.params.tableShowStats} onCheckedChange={(checked) => handleChange('tableShowStats', checked)} />
                  </Field>
                  <Separator />
                  <Field label="Default Sort">
                    <div className="flex items-center gap-2">
                      {renderSimpleSelect(
                        node.params.tableSortBy || '__empty__',
                        (val) => {
                          const v = val === '__empty__' ? '' : val;
                          const nextDir = v ? (node.params.tableSortDirection || 'asc') : '';
                          handleBulkChange({ tableSortBy: v, tableSortDirection: nextDir });
                        },
                        [{ label: 'None', value: '__empty__' }, ...schema.map((f) => ({ label: f, value: f }))]
                      )}
                      {renderSimpleSelect(
                        node.params.tableSortDirection || '__empty__',
                        (val) => handleBulkChange({ tableSortDirection: val === '__empty__' ? '' : val }),
                        [
                          { label: 'Select...', value: '__empty__' },
                          { label: 'Ascending', value: 'asc' },
                          { label: 'Descending', value: 'desc' }
                        ]
                      )}
                    </div>
                  </Field>
                </>
              )}

              {node.params.subtype === 'AI' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h5 className="font-semibold text-base">AI Assistant</h5>
                    <p className="text-sm text-muted-foreground">Ask your question inside the node card to generate a plan of nodes.</p>
                  </div>
                  <Field label="Use LLM for smarter planning">
                    <Switch checked={!!node.params.assistantUseLLM} onCheckedChange={(checked) => handleChange('assistantUseLLM', checked)} />
                  </Field>
                  <Card>
                    <CardHeader className="p-3 pb-0">
                      <CardTitle className="text-sm">OpenAI-Compatible Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 space-y-3">
                      <Field label="API Base URL">
                        <Input
                          value={llmSettings.baseUrl}
                          onChange={(e) => setLlmSettings((prev: any) => ({ ...prev, baseUrl: e.target.value }))}
                          placeholder="https://api.openai.com/v1"
                        />
                      </Field>
                      <Field label="Model">
                        <Input
                          value={llmSettings.model}
                          onChange={(e) => setLlmSettings((prev: any) => ({ ...prev, model: e.target.value }))}
                          placeholder="gpt-4o-mini"
                        />
                      </Field>
                      <Field label="API Key">
                        <Input
                          type="password"
                          value={llmSettings.apiKey}
                          onChange={(e) => setLlmSettings((prev: any) => ({ ...prev, apiKey: e.target.value }))}
                          placeholder="sk-..."
                        />
                        <p className="text-xs text-muted-foreground mt-1">Stored locally in your browser.</p>
                      </Field>
                    </CardContent>
                  </Card>
                </div>
              )}

              {node.params.subtype === 'PIVOT' && (
                <div className="space-y-4">
                  <Field label="Row Field">
                    {renderSimpleSelect(
                      node.params.pivotRow || '__empty__',
                      (val) => handleChange('pivotRow', val === '__empty__' ? '' : val),
                      [{ label: 'Select Row Field...', value: '__empty__' }, ...schema.map((f) => ({ label: f, value: f }))]
                    )}
                  </Field>
                  <Field label="Column Field">
                    {renderSimpleSelect(
                      node.params.pivotColumn || '__empty__',
                      (val) => handleChange('pivotColumn', val === '__empty__' ? '' : val),
                      [{ label: 'Select Column Field...', value: '__empty__' }, ...schema.map((f) => ({ label: f, value: f }))]
                    )}
                  </Field>
                  <Field label="Aggregation">
                    {renderSimpleSelect(
                      node.params.pivotFn || 'count',
                      (val) => handleChange('pivotFn', val),
                      KPI_FUNCTIONS
                    )}
                  </Field>
                  {requiresMetricField(node.params.pivotFn || 'count') && (
                    <Field label="Value Field">
                      {renderSimpleSelect(
                        node.params.pivotValue || '__empty__',
                        (val) => handleChange('pivotValue', val === '__empty__' ? '' : val),
                        [{ label: 'Select Value Field...', value: '__empty__' }, ...schema.map((f) => ({ label: f, value: f }))]
                      )}
                    </Field>
                  )}
                </div>
              )}

              {node.params.subtype === 'CHART' && (
                <>
                  <Field label="Chart Type">
                    <ToggleGroup
                      value={node.params.chartType || 'bar'}
                      onChange={handleChartTypeChange}
                      options={[
                        { value: 'bar', label: 'Bar', icon: <BarChart3 size={16} /> },
                        { value: 'line', label: 'Line', icon: <TrendingUp size={16} /> },
                        { value: 'area', label: 'Area', icon: <TrendingUp size={16} /> },
                        { value: 'scatter', label: 'Scatter', icon: <Hash size={16} /> },
                        { value: 'map', label: 'Map', icon: <Globe size={16} /> }
                      ]}
                    />
                  </Field>
                  <div className="space-y-4 pt-2 border-t border-border">
                    <Field label={node.params.chartType === 'map' ? 'Map Field (ISO-3)' : 'X Axis (Category)'}>
                      {renderSimpleSelect(
                        node.params.xAxis || '__empty__',
                        (val) => handleChange('xAxis', val === '__empty__' ? '' : val),
                        [
                          { label: 'Auto Select', value: '__empty__' },
                          ...(categoricalFields.length > 0 ? categoricalFields : []).map((f) => ({ label: f, value: f })),
                          ...(numericFields.length > 0 ? numericFields : []).map((f) => ({ label: f, value: f }))
                        ]
                      )}
                    </Field>
                    <Field label={node.params.chartType === 'map' ? 'Value Field' : 'Y Axis (Value)'}>
                      {renderSimpleSelect(
                        node.params.yAxis || '__empty__',
                        (val) => handleChange('yAxis', val === '__empty__' ? '' : val),
                        [{ label: 'Auto Select', value: '__empty__' }, ...(numericFields.length > 0 ? numericFields : schema).map((f) => ({ label: f, value: f }))]
                      )}
                    </Field>
                    <Field label={node.params.chartType === 'map' ? 'Aggregation' : 'Y Axis Aggregation'}>
                      {renderSimpleSelect(
                        (node.params.chartType === 'map' && node.params.chartAggFn === 'none') ? 'count' : (node.params.chartAggFn ?? 'none'),
                        (val) => handleChange('chartAggFn', val),
                        (node.params.chartType === 'map' ? CHART_AGG_FUNCTIONS.filter(fn => fn.value !== 'none') : CHART_AGG_FUNCTIONS)
                      )}
                      {node.params.chartType === 'scatter' && <p className="text-xs text-muted-foreground mt-1">Aggregation is not applied to scatter charts.</p>}
                      {node.params.chartType === 'map' && <p className="text-xs text-muted-foreground mt-1">Map requires a per-country aggregation.</p>}
                    </Field>
                  </div>
                  <div className="space-y-4 pt-2 border-t border-border">
                    <h5 className="font-semibold text-base">Chart Options</h5>
                    {node.params.chartType === 'map' ? (
                      <>
                        <Field label="Show tooltip">
                          <Switch checked={node.params.chartShowTooltip !== false} onCheckedChange={(checked) => handleChange('chartShowTooltip', checked)} />
                        </Field>
                        <Field label="Map Color">
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={node.params.chartColor || '#2563eb'}
                              onChange={(e) => handleChange('chartColor', e.target.value)}
                              className="h-9 w-9 rounded border border-input cursor-pointer"
                            />
                            <Input
                              value={node.params.chartColor || '#2563eb'}
                              onChange={(e) => handleChange('chartColor', e.target.value)}
                              className="flex-1"
                            />
                          </div>
                        </Field>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col gap-2">
                          {[
                            { key: 'chartShowGrid', label: 'Show grid', defaultVal: true },
                            { key: 'chartShowTooltip', label: 'Show tooltip', defaultVal: true },
                            { key: 'chartShowPoints', label: 'Show points', defaultVal: false },
                            { key: 'chartStacked', label: 'Stacked', defaultVal: false }
                          ].map(({ key, label, defaultVal }) => (
                            <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                              <Checkbox
                                checked={defaultVal ? node.params[key] !== false : !!node.params[key]}
                                onCheckedChange={(checked) => handleChange(key, !!checked)}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                        <Field label="Curve">
                          {renderSimpleSelect(
                            node.params.chartCurve || 'linear',
                            (val) => handleChange('chartCurve', val),
                            [{ label: 'Linear', value: 'linear' }, { label: 'Monotone', value: 'monotone' }, { label: 'Step', value: 'step' }]
                          )}
                        </Field>
                        <Field label="Orientation">
                          {renderSimpleSelect(
                            node.params.chartOrientation || 'vertical',
                            (val) => handleChange('chartOrientation', val),
                            [{ label: 'Vertical (columns)', value: 'vertical' }, { label: 'Horizontal (bars)', value: 'horizontal' }]
                          )}
                          {node.params.chartType !== 'bar' && <p className="text-xs text-muted-foreground mt-1">Orientation applies to bar charts.</p>}
                        </Field>
                        <Field label="Bar Gap">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <Slider
                                min={0}
                                max={0.8}
                                step={0.05}
                                value={[node.params.chartBarGap ?? 0.2]}
                                onValueChange={([val]) => handleChange('chartBarGap', val)}
                                disabled={node.params.chartType !== 'bar'}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-10 text-right">
                              {(node.params.chartBarGap ?? 0.2).toFixed(2)}
                            </span>
                          </div>
                          {node.params.chartType !== 'bar' && <p className="text-xs text-muted-foreground mt-1">Bar gap applies to bar charts.</p>}
                        </Field>
                        <Field label="Series Color">
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={node.params.chartColor || '#2563eb'}
                              onChange={(e) => handleChange('chartColor', e.target.value)}
                              className="h-9 w-9 rounded border border-input cursor-pointer"
                            />
                            <Input
                              value={node.params.chartColor || '#2563eb'}
                              onChange={(e) => handleChange('chartColor', e.target.value)}
                              className="flex-1"
                            />
                          </div>
                        </Field>
                      </>
                    )}
                  </div>
                </>
              )}

              {node.params.subtype === 'KPI' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Metrics</span>
                    <Button variant="link" size="sm" onClick={addKpiMetric}><Plus size={14} className="mr-1" />Add Metric</Button>
                  </div>
                  <div className="space-y-2">
                    {kpiMetrics.map((metric: any, idx: number) => (
                      <Card key={metric.id || idx}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="Label (optional)"
                              value={metric.label || ''}
                              onChange={(e) => updateKpiMetric(idx, { label: e.target.value })}
                              className="flex-1"
                            />
                            {kpiMetrics.length > 1 && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeKpiMetric(idx)}>
                                <Trash2 size={14} />
                              </Button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {renderSimpleSelect(
                              metric.fn || 'count',
                              (val) => updateKpiMetric(idx, { fn: val }),
                              KPI_FUNCTIONS
                            )}
                            {requiresMetricField(metric.fn || 'count') && renderSimpleSelect(
                              metric.field || '__empty__',
                              (val) => updateKpiMetric(idx, { field: val === '__empty__' ? '' : val }),
                              [{ label: 'Select Field...', value: '__empty__' }, ...schema.map((f) => ({ label: f, value: f }))]
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {node.params.subtype === 'GAUGE' && (
                <>
                  <div className="space-y-4">
                    <Field label="Aggregation">
                      {renderSimpleSelect(
                        node.params.fn || 'count',
                        (val) => handleChange('fn', val),
                        KPI_FUNCTIONS
                      )}
                    </Field>
                    {requiresMetricField(node.params.fn || 'count') && (
                      <Field label="Metric Field">
                        {renderSimpleSelect(
                          node.params.metricField || '__empty__',
                          (val) => handleChange('metricField', val === '__empty__' ? '' : val),
                          [{ label: 'Select Field...', value: '__empty__' }, ...schema.map((f) => ({ label: f, value: f }))]
                        )}
                      </Field>
                    )}
                  </div>
                  <div className="space-y-1 pt-2 border-t border-border">
                    <Field label="Target Value (Max)">
                      <Input
                        type="number"
                        min={0}
                        value={node.params.target || 100}
                        onChange={(e) => handleChange('target', Number(e.target.value))}
                      />
                    </Field>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export { PropertiesPanel };
