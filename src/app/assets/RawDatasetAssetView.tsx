import React from 'react';
import { Empty } from '@/components/ui/empty';
import TablePreview from '../../components/TablePreview';
import { getNodeResult } from '../../utils/nodeUtils';

interface RawDatasetAssetViewProps {
  nodes?: any[];
  chainData: any;
  tableDensity: string;
  onTableSortChange: (sortBy: string, sortDirection: string) => void;
}

const RawDatasetAssetView = ({ nodes = [], chainData, tableDensity, onTableSortChange }: RawDatasetAssetViewProps) => {
  const sourceNode = nodes.find((node: any) => node.type === 'SOURCE') || nodes[0];
  const result = sourceNode ? getNodeResult(chainData, sourceNode.id) : null;
  const schema = Array.isArray(result?.schema) ? result.schema : [];
  const preferredColumns = Array.isArray(sourceNode?.params?.visibleColumns) && sourceNode.params.visibleColumns.length > 0
    ? sourceNode.params.visibleColumns
    : schema;
  const schemaSet = new Set(schema);
  const visibleColumns = preferredColumns.filter((col: string) => schemaSet.has(col));
  const resolvedColumns = visibleColumns.length > 0 ? visibleColumns : schema;
  const sortBy = sourceNode?.params?.tableSortBy || '';
  const sortDirection = sourceNode?.params?.tableSortDirection || '';

  if (!sourceNode || schema.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden bg-muted/30 flex flex-col">
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <Empty description="Ingest data to preview the dataset." />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-muted/30 flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
        <TablePreview
          rowCount={result?.rowCount || 0}
          columns={resolvedColumns}
          getRowAt={result?.getRowAt}
          sampleRows={result?.sampleRows || result?.data || []}
          nodeId={sourceNode.id}
          sortBy={sortBy}
          sortDirection={sortDirection}
          tableDensity={tableDensity}
          showTableStats
          getColumnStats={result?.getColumnStats}
          onSortChange={onTableSortChange}
        />
      </div>
    </div>
  );
};

export default RawDatasetAssetView;
