import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Empty } from '@/components/ui/empty';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import { Play } from '../../ui/icons';
import TablePreview from '../../components/TablePreview';
import { SQL_INCOMING_TABLE } from '../../utils/dataEngine';
import { getNodeResult } from '../../utils/nodeUtils';

interface SqlTransformationAssetViewProps {
  nodes?: any[];
  chainData: any;
  tableDensity: string;
  sqlDraftInput: string;
  sqlDraftText: string;
  sqlDraftError: string;
  sqlDraftMode: string;
  sqlDraftJoinType: string;
  sqlDraftRightTable: string;
  sqlDraftLeftKey: string;
  sqlDraftRightKey: string;
  setSqlDraftInput: (value: string) => void;
  setSqlDraftText: (value: string) => void;
  setSqlDraftError: (value: string) => void;
  setSqlDraftMode: (value: string) => void;
  setSqlDraftJoinType: (value: string) => void;
  setSqlDraftRightTable: (value: string) => void;
  setSqlDraftLeftKey: (value: string) => void;
  setSqlDraftRightKey: (value: string) => void;
  runSqlDraft: () => void;
  externalTableRegistry: any;
  activeExplorationId: string;
  explorations: any[];
  assetTypes: Record<string, string>;
  onTableSortChange: (sortBy: string, sortDirection: string) => void;
}

const SqlTransformationAssetView = ({
  nodes = [],
  chainData,
  tableDensity,
  sqlDraftInput,
  sqlDraftText,
  sqlDraftError,
  sqlDraftMode,
  sqlDraftJoinType,
  sqlDraftRightTable,
  sqlDraftLeftKey,
  sqlDraftRightKey,
  setSqlDraftInput,
  setSqlDraftText,
  setSqlDraftError,
  setSqlDraftMode,
  setSqlDraftJoinType,
  setSqlDraftRightTable,
  setSqlDraftLeftKey,
  setSqlDraftRightKey,
  runSqlDraft,
  externalTableRegistry,
  activeExplorationId,
  explorations,
  assetTypes,
  onTableSortChange
}: SqlTransformationAssetViewProps) => {
  const sourceNode = nodes.find((node: any) => node.type === 'SOURCE');
  const sqlNode = nodes.find((node: any) => node.type === 'JOIN');
  const result = sqlNode ? getNodeResult(chainData, sqlNode.id) : null;
  const executedInput = sourceNode?.params?.inheritedTable || '';
  const executedSql = String(sqlNode?.params?.sqlText || '').trim();
  const sqlInputValue = sqlDraftInput || '';
  const sqlTextValue = sqlDraftText;
  const executedMode = sqlNode?.params?.sqlMode || 'custom';
  const executedJoinType = sqlNode?.params?.joinType || 'LEFT';
  const executedRightTable = sqlNode?.params?.rightTable || '';
  const executedLeftKey = sqlNode?.params?.leftKey || '';
  const executedRightKey = sqlNode?.params?.rightKey || '';
  const isDirty = sqlDraftMode === 'visual'
    ? (sqlInputValue !== executedInput
      || sqlDraftMode !== executedMode
      || sqlDraftJoinType !== executedJoinType
      || sqlDraftRightTable !== executedRightTable
      || sqlDraftLeftKey !== executedLeftKey
      || sqlDraftRightKey !== executedRightKey)
    : (sqlInputValue !== executedInput || String(sqlTextValue || '').trim() !== executedSql);

  const allInputs = (externalTableRegistry?.assetTables || []).filter((entry: any) => {
    const ownerId = entry.assetId || entry.explorationId;
    return ownerId ? ownerId !== activeExplorationId : true;
  });
  const datasetOptions = allInputs
    .filter((entry: any) => entry.assetType !== assetTypes.RAW_DATASET && entry.assetType !== assetTypes.SQL)
    .map((entry: any) => ({ label: entry.label, value: entry.name }));
  const rawOptions = allInputs
    .filter((entry: any) => entry.assetType === assetTypes.RAW_DATASET)
    .map((entry: any) => ({ label: entry.label, value: entry.name }));
  const sqlOptions = allInputs
    .filter((entry: any) => entry.assetType === assetTypes.SQL)
    .map((entry: any) => ({ label: entry.label, value: entry.name }));

  type OptionGroup = { label: string; options: { label: string; value: string }[] };
  const sqlInputGroups: OptionGroup[] = [
    datasetOptions.length > 0 ? { label: 'Datasets', options: datasetOptions } : null,
    rawOptions.length > 0 ? { label: 'Raw datasets', options: rawOptions } : null,
    sqlOptions.length > 0 ? { label: 'SQL transformations', options: sqlOptions } : null
  ].filter(Boolean) as OptionGroup[];

  const hasInput = allInputs.some((entry: any) => (
    entry.name === sqlInputValue || entry.legacyName === sqlInputValue
  ));
  if (sqlInputValue && !hasInput) {
    sqlInputGroups.push({
      label: 'Current selection',
      options: [{ label: sqlInputValue, value: sqlInputValue }]
    });
  }

  const canRun = sqlDraftMode === 'visual'
    ? Boolean(sqlInputValue && sqlDraftRightTable && sqlDraftLeftKey && sqlDraftRightKey)
    : Boolean(sqlInputValue && String(sqlTextValue || '').trim());
  const sortBy = sqlNode?.params?.tableSortBy || '';
  const sortDirection = sqlNode?.params?.tableSortDirection || '';
  const incomingEntry = allInputs.find((entry: any) => (
    entry.name === sqlInputValue || entry.legacyName === sqlInputValue
  ));
  const incomingSchema: string[] = Array.isArray(incomingEntry?.schema) ? incomingEntry.schema : [];
  const joinEntriesRaw = externalTableRegistry?.list || [];
  const assetsWithTableEntries = new Set(
    joinEntriesRaw.filter((entry: any) => entry.isAssetTable).map((entry: any) => entry.assetId)
  );
  const joinEntries = joinEntriesRaw.filter((entry: any) => {
    if (entry.isAssetTable) return true;
    if (entry.assetType === assetTypes.RAW_DATASET && assetsWithTableEntries.has(entry.assetId)) {
      return false;
    }
    return true;
  });
  const joinTableGroups: OptionGroup[] = Array.from(joinEntries.reduce((acc: Map<string, OptionGroup>, entry: any) => {
    const groupId = entry.assetId || entry.explorationId || entry.name;
    const groupLabel = entry.assetName || entry.explorationName || entry.label || 'Dataset';
    const optionLabel = entry.isAssetTable
      ? (entry.nodeTitle || entry.datasetName || entry.label)
      : (entry.label || entry.name);
    if (!acc.has(groupId)) {
      acc.set(groupId, { label: groupLabel, options: [] });
    }
    acc.get(groupId)!.options.push({ label: optionLabel, value: entry.name });
    return acc;
  }, new Map()).values());
  const rightTableEntry = joinEntries.find((entry: any) => (
    entry.name === sqlDraftRightTable || entry.legacyName === sqlDraftRightTable
  ));
  const rightTableSchema: string[] = Array.isArray(rightTableEntry?.schema) ? rightTableEntry.schema : [];
  const visualSqlPreview = `SELECT * FROM ${SQL_INCOMING_TABLE}\n${sqlDraftJoinType || 'LEFT'} JOIN ${sqlDraftRightTable || '?'}\nON ${SQL_INCOMING_TABLE}.${sqlDraftLeftKey || '?'} = ${sqlDraftRightTable || '?'}.${sqlDraftRightKey || '?'}`;
  const sqlTextDisplay = sqlDraftMode === 'visual' ? visualSqlPreview : sqlTextValue;
  const selectedAsset = React.useMemo(() => {
    if (!incomingEntry) return null;
    const assetId = incomingEntry.assetId || incomingEntry.explorationId;
    if (!assetId) return null;
    return (explorations || []).find((asset: any) => asset?.id === assetId) || null;
  }, [incomingEntry, explorations]);
  const tableSections = React.useMemo(() => {
    const model = selectedAsset?.dataModel;
    const order = Array.isArray(model?.order) ? model.order : [];
    if (order.length > 0) {
      return order.map((tableName: string) => {
        const rows = model?.tables?.[tableName];
        const schema = Array.isArray(rows) && rows.length > 0 ? Object.keys(rows[0] || {}) : [];
        return { name: tableName, schema };
      });
    }
    if (incomingSchema.length > 0) {
      return [{ name: SQL_INCOMING_TABLE, schema: incomingSchema }];
    }
    return [];
  }, [incomingSchema, selectedAsset]);

  const renderGroupedSelect = (
    value: string | undefined,
    onChange: (val: string) => void,
    groups: OptionGroup[],
    placeholder: string,
    disabled?: boolean
  ) => (
    <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-muted/30 flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
          <Card className="border border-border/70">
            <CardContent className="p-4 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Input dataset</p>
                <div className="mt-2">
                  {renderGroupedSelect(
                    sqlInputValue || undefined,
                    (value) => { setSqlDraftInput(value); setSqlDraftError(''); },
                    sqlInputGroups,
                    'Select an input dataset...'
                  )}
                </div>
                {allInputs.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Save a dataset, raw dataset, or SQL transformation to use it here.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">SQL mode</p>
                <div className="flex rounded-md border border-input overflow-hidden">
                  <button
                    type="button"
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      sqlDraftMode === 'visual'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground hover:bg-accent'
                    }`}
                    onClick={() => setSqlDraftMode('visual')}
                  >
                    Visual
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      sqlDraftMode === 'custom'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground hover:bg-accent'
                    }`}
                    onClick={() => setSqlDraftMode('custom')}
                  >
                    Custom
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={sqlDraftMode === 'custom' ? 'opacity-60' : ''}>
                  <p className="text-xs text-muted-foreground">Visual join options</p>
                  <div className="space-y-2 mt-2">
                    <Select
                      value={sqlDraftJoinType || 'LEFT'}
                      onValueChange={setSqlDraftJoinType}
                      disabled={sqlDraftMode !== 'visual'}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['LEFT', 'INNER', 'RIGHT', 'FULL'].map((jt) => (
                          <SelectItem key={jt} value={jt}>{jt} JOIN</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {renderGroupedSelect(
                      sqlDraftRightTable || undefined,
                      setSqlDraftRightTable,
                      joinTableGroups,
                      'Join with table...',
                      sqlDraftMode !== 'visual'
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={sqlDraftLeftKey || ''}
                        onValueChange={setSqlDraftLeftKey}
                        disabled={sqlDraftMode !== 'visual'}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Left key" />
                        </SelectTrigger>
                        <SelectContent>
                          {incomingSchema.map((field) => (
                            <SelectItem key={field} value={field}>{field}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={sqlDraftRightKey || ''}
                        onValueChange={setSqlDraftRightKey}
                        disabled={sqlDraftMode !== 'visual'}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Right key" />
                        </SelectTrigger>
                        <SelectContent>
                          {rightTableSchema.map((field) => (
                            <SelectItem key={field} value={field}>{field}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use the visual controls for quick joins, or switch to Custom SQL.
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">SQL transformation</p>
                    {isDirty && (
                      <Badge className="rounded-full bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30">
                        Draft not run
                      </Badge>
                    )}
                  </div>
                  <Textarea
                    className="mt-2 font-mono text-sm min-h-[150px] resize-y"
                    placeholder={`SELECT * FROM ${SQL_INCOMING_TABLE} WHERE ...`}
                    value={sqlTextDisplay}
                    readOnly={sqlDraftMode === 'visual'}
                    onChange={(event) => {
                      if (sqlDraftMode === 'visual') return;
                      setSqlDraftText(event.target.value);
                      setSqlDraftError('');
                    }}
                  />
                  {sqlDraftMode === 'visual' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      SQL preview is read-only in visual mode.
                    </p>
                  )}
                </div>
              </div>

              {sqlDraftError && (
                <Alert variant="default" className="border-orange-200 bg-orange-50 dark:border-orange-500/30 dark:bg-orange-500/10">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <AlertDescription>{sqlDraftError}</AlertDescription>
                </Alert>
              )}
              {result?.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{result.error}</AlertDescription>
                </Alert>
              )}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Results update only when you run the query.
                </p>
                <Button onClick={runSqlDraft} disabled={!canRun}>
                  <Play size={14} />
                  Run SQL
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/70 h-full">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground">Selected dataset tables</p>
              {tableSections.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Select an input dataset to view tables and columns.
                </p>
              ) : (
                <Accordion type="single" collapsible>
                  {tableSections.map((table) => (
                    <AccordionItem key={table.name} value={table.name}>
                      <AccordionTrigger className="text-sm py-2">
                        {table.name} ({table.schema.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        {table.schema.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {table.schema.map((col) => (
                              <Badge key={`${table.name}-${col}`} variant="secondary" className="rounded-full">
                                {col}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No columns available.</p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-border/70 bg-card">
          {result && !result.error && Array.isArray(result.schema) && result.schema.length > 0 ? (
            <TablePreview
              rowCount={result.rowCount || 0}
              columns={result.schema || []}
              getRowAt={result.getRowAt}
              sampleRows={result.sampleRows || result.data || []}
              nodeId={sqlNode?.id || 'node-sql'}
              sortBy={sortBy}
              sortDirection={sortDirection}
              tableDensity={tableDensity}
              showTableStats={false}
              onSortChange={onTableSortChange}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <Empty description="Run the SQL query to preview results." />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SqlTransformationAssetView;
