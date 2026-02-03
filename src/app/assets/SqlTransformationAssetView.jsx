import React from 'react';
import { Alert, Button, Card, Collapse, Empty, Input, Radio, Select, Space, Tag, Typography } from 'antd';
import { Play } from '../../ui/icons';
import TablePreview from '../../components/TablePreview';
import { SQL_INCOMING_TABLE } from '../../utils/dataEngine';
import { getNodeResult } from '../../utils/nodeUtils';

const { Text } = Typography;

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
}) => {
  const sourceNode = nodes.find((node) => node.type === 'SOURCE');
  const sqlNode = nodes.find((node) => node.type === 'JOIN');
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
  const allInputs = (externalTableRegistry?.assetTables || []).filter((entry) => {
    const ownerId = entry.assetId || entry.explorationId;
    return ownerId ? ownerId !== activeExplorationId : true;
  });
  const datasetOptions = allInputs
    .filter((entry) => entry.assetType !== assetTypes.RAW_DATASET && entry.assetType !== assetTypes.SQL)
    .map((entry) => ({ label: entry.label, value: entry.name }));
  const rawOptions = allInputs
    .filter((entry) => entry.assetType === assetTypes.RAW_DATASET)
    .map((entry) => ({ label: entry.label, value: entry.name }));
  const sqlOptions = allInputs
    .filter((entry) => entry.assetType === assetTypes.SQL)
    .map((entry) => ({ label: entry.label, value: entry.name }));
  const sqlInputGroups = [
    datasetOptions.length > 0 ? { label: 'Datasets', options: datasetOptions } : null,
    rawOptions.length > 0 ? { label: 'Raw datasets', options: rawOptions } : null,
    sqlOptions.length > 0 ? { label: 'SQL transformations', options: sqlOptions } : null
  ].filter(Boolean);
  const hasInput = allInputs.some((entry) => (
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
  const incomingEntry = allInputs.find((entry) => (
    entry.name === sqlInputValue || entry.legacyName === sqlInputValue
  ));
  const incomingSchema = Array.isArray(incomingEntry?.schema) ? incomingEntry.schema : [];
  const joinEntriesRaw = externalTableRegistry?.list || [];
  const assetsWithTableEntries = new Set(
    joinEntriesRaw.filter((entry) => entry.isAssetTable).map((entry) => entry.assetId)
  );
  const joinEntries = joinEntriesRaw.filter((entry) => {
    if (entry.isAssetTable) return true;
    if (entry.assetType === assetTypes.RAW_DATASET && assetsWithTableEntries.has(entry.assetId)) {
      return false;
    }
    return true;
  });
  const joinTableGroups = Array.from(joinEntries.reduce((acc, entry) => {
    const groupId = entry.assetId || entry.explorationId || entry.name;
    const groupLabel = entry.assetName || entry.explorationName || entry.label || 'Dataset';
    const optionLabel = entry.isAssetTable
      ? (entry.nodeTitle || entry.datasetName || entry.label)
      : (entry.label || entry.name);
    if (!acc.has(groupId)) {
      acc.set(groupId, { label: groupLabel, options: [] });
    }
    acc.get(groupId).options.push({ label: optionLabel, value: entry.name });
    return acc;
  }, new Map()).values());
  const rightTableEntry = joinEntries.find((entry) => (
    entry.name === sqlDraftRightTable || entry.legacyName === sqlDraftRightTable
  ));
  const rightTableSchema = Array.isArray(rightTableEntry?.schema) ? rightTableEntry.schema : [];
  const visualSqlPreview = `SELECT * FROM ${SQL_INCOMING_TABLE}\n${sqlDraftJoinType || 'LEFT'} JOIN ${sqlDraftRightTable || '?'}\nON ${SQL_INCOMING_TABLE}.${sqlDraftLeftKey || '?'} = ${sqlDraftRightTable || '?'}.${sqlDraftRightKey || '?'}`;
  const sqlTextDisplay = sqlDraftMode === 'visual' ? visualSqlPreview : sqlTextValue;
  const selectedAsset = React.useMemo(() => {
    if (!incomingEntry) return null;
    const assetId = incomingEntry.assetId || incomingEntry.explorationId;
    if (!assetId) return null;
    return (explorations || []).find((asset) => asset?.id === assetId) || null;
  }, [incomingEntry, explorations]);
  const tableSections = React.useMemo(() => {
    const model = selectedAsset?.dataModel;
    const order = Array.isArray(model?.order) ? model.order : [];
    if (order.length > 0) {
      return order.map((tableName) => {
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

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
          <Card size="small" className="border border-slate-200/70 dark:border-slate-800">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Text type="secondary" className="text-xs">
                  Input dataset
                </Text>
                <Select
                  value={sqlInputValue || undefined}
                  placeholder="Select an input dataset..."
                  onChange={(value) => {
                    setSqlDraftInput(value);
                    setSqlDraftError('');
                  }}
                  options={sqlInputGroups}
                  style={{ width: '100%', marginTop: 8 }}
                />
                {allInputs.length === 0 && (
                  <Text type="secondary" className="text-xs">
                    Save a dataset, raw dataset, or SQL transformation to use it here.
                  </Text>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Text type="secondary" className="text-xs">
                  SQL mode
                </Text>
                <Radio.Group
                  value={sqlDraftMode}
                  onChange={(event) => setSqlDraftMode(event.target.value)}
                  size="small"
                >
                  <Radio.Button value="visual">Visual</Radio.Button>
                  <Radio.Button value="custom">Custom</Radio.Button>
                </Radio.Group>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={sqlDraftMode === 'custom' ? 'opacity-60' : ''}>
                  <Text type="secondary" className="text-xs">
                    Visual join options
                  </Text>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Select
                      value={sqlDraftJoinType || 'LEFT'}
                      onChange={(value) => setSqlDraftJoinType(value)}
                      options={['LEFT', 'INNER', 'RIGHT', 'FULL'].map((joinType) => ({
                        label: `${joinType} JOIN`,
                        value: joinType
                      }))}
                      disabled={sqlDraftMode !== 'visual'}
                    />
                    <Select
                      value={sqlDraftRightTable || undefined}
                      placeholder="Join with table..."
                      onChange={(value) => setSqlDraftRightTable(value)}
                      options={joinTableGroups}
                      disabled={sqlDraftMode !== 'visual'}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={sqlDraftLeftKey || undefined}
                        placeholder="Left key"
                        onChange={(value) => setSqlDraftLeftKey(value)}
                        options={incomingSchema.map((field) => ({ label: field, value: field }))}
                        disabled={sqlDraftMode !== 'visual'}
                      />
                      <Select
                        value={sqlDraftRightKey || undefined}
                        placeholder="Right key"
                        onChange={(value) => setSqlDraftRightKey(value)}
                        options={rightTableSchema.map((field) => ({ label: field, value: field }))}
                        disabled={sqlDraftMode !== 'visual'}
                      />
                    </div>
                    <Text type="secondary" className="text-xs">
                      Use the visual controls for quick joins, or switch to Custom SQL.
                    </Text>
                  </Space>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Text type="secondary" className="text-xs">
                      SQL transformation
                    </Text>
                    {isDirty && (
                      <Tag color="orange" className="rounded-full px-2">
                        Draft not run
                      </Tag>
                    )}
                  </div>
                  <Input.TextArea
                    autoSize={{ minRows: 6, maxRows: 12 }}
                    placeholder={`SELECT * FROM ${SQL_INCOMING_TABLE} WHERE ...`}
                    value={sqlTextDisplay}
                    readOnly={sqlDraftMode === 'visual'}
                    onChange={(event) => {
                      if (sqlDraftMode === 'visual') return;
                      setSqlDraftText(event.target.value);
                      setSqlDraftError('');
                    }}
                    style={{ marginTop: 8, fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace' }}
                  />
                  {sqlDraftMode === 'visual' && (
                    <Text type="secondary" className="text-xs">
                      SQL preview is read-only in visual mode.
                    </Text>
                  )}
                </div>
              </div>

              {sqlDraftError && (
                <Alert type="warning" showIcon message={sqlDraftError} />
              )}
              {result?.error && (
                <Alert type="error" showIcon message={result.error} />
              )}
              <div className="flex items-center justify-between">
                <Text type="secondary" className="text-xs">
                  Results update only when you run the query.
                </Text>
                <Button
                  type="primary"
                  icon={<Play size={14} />}
                  onClick={runSqlDraft}
                  disabled={!canRun}
                >
                  Run SQL
                </Button>
              </div>
            </Space>
          </Card>

          <Card size="small" className="border border-slate-200/70 dark:border-slate-800 h-full">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text type="secondary" className="text-xs">
                Selected dataset tables
              </Text>
              {tableSections.length === 0 ? (
                <Text type="secondary" className="text-xs">
                  Select an input dataset to view tables and columns.
                </Text>
              ) : (
                <Collapse
                  accordion
                  size="small"
                  items={tableSections.map((table) => ({
                    key: table.name,
                    label: `${table.name} (${table.schema.length})`,
                    children: table.schema.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {table.schema.map((col) => (
                          <Tag key={`${table.name}-${col}`} className="rounded-full px-2">
                            {col}
                          </Tag>
                        ))}
                      </div>
                    ) : (
                      <Text type="secondary" className="text-xs">
                        No columns available.
                      </Text>
                    )
                  }))}
                />
              )}
            </Space>
          </Card>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900/60">
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
