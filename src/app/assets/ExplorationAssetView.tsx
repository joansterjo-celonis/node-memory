import React from 'react';
import { TreeNode, FreeLayoutCanvas } from '../../components/TreeNode';

interface ExplorationAssetViewProps {
  renderMode: string;
  renderNodes: any[];
  selectedNodeId: string;
  chainData: any;
  tableDensity: string;
  isMobileMode: boolean;
  isSmartMode: boolean;
  leafCountById: Record<string, number>;
  branchSelectionByNodeId: Record<string, number>;
  onSelect: (nodeId: string) => void;
  onAdd: (nodeId: string, type: string) => void;
  onInsert: (nodeId: string, type: string) => void;
  onRemove: (nodeId: string) => void;
  onToggleExpand: (nodeId: string) => void;
  onToggleBranch: (nodeId: string) => void;
  onToggleDataset: (nodeId: string) => void;
  onDrillDown: (nodeId: string, value: any) => void;
  onTableCellClick: (...args: any[]) => void;
  onTableSortChange: (sortBy: string, sortDirection: string) => void;
  onAssistantRequest: (...args: any[]) => void;
  onAddFilter: (...args: any[]) => void;
  onUpdateFilter: (...args: any[]) => void;
  onRemoveFilter: (...args: any[]) => void;
  onFilterCellAction: (...args: any[]) => void;
  showAddMenuForId: string | null;
  setShowAddMenuForId: (id: string | null) => void;
  showInsertMenuForId: string | null;
  setShowInsertMenuForId: (id: string | null) => void;
  onUpdateNodePosition: (...args: any[]) => void;
  onAutoLayout: () => void;
  onEntangledColorChange: (...args: any[]) => void;
  onRenameBranch: (...args: any[]) => void;
  onToggleEntangle: (...args: any[]) => void;
  onSelectBranch: (...args: any[]) => void;
  canvasScrollRef: React.RefObject<HTMLDivElement>;
  onCanvasClick: (e: React.MouseEvent) => void;
}

const ExplorationAssetView = ({
  renderMode,
  renderNodes,
  selectedNodeId,
  chainData,
  tableDensity,
  isMobileMode,
  isSmartMode,
  leafCountById,
  branchSelectionByNodeId,
  onSelect,
  onAdd,
  onInsert,
  onRemove,
  onToggleExpand,
  onToggleBranch,
  onToggleDataset,
  onDrillDown,
  onTableCellClick,
  onTableSortChange,
  onAssistantRequest,
  onAddFilter,
  onUpdateFilter,
  onRemoveFilter,
  onFilterCellAction,
  showAddMenuForId,
  setShowAddMenuForId,
  showInsertMenuForId,
  setShowInsertMenuForId,
  onUpdateNodePosition,
  onAutoLayout,
  onEntangledColorChange,
  onRenameBranch,
  onToggleEntangle,
  onSelectBranch,
  canvasScrollRef,
  onCanvasClick
}: ExplorationAssetViewProps) => {
  const containerClass = renderMode === 'freeLayout'
    ? 'flex-1 min-h-0 overflow-hidden bg-[url(\'https://www.transparenttextures.com/patterns/cubes.png\')] bg-muted/30 dark:bg-none'
    : 'flex-1 min-h-0 overflow-auto bg-[url(\'https://www.transparenttextures.com/patterns/cubes.png\')] bg-muted/30 dark:bg-none cursor-grab active:cursor-grabbing';

  return (
    <div
      ref={canvasScrollRef}
      className={containerClass}
      onClick={onCanvasClick}
    >
      {renderMode === 'freeLayout' ? (
        <FreeLayoutCanvas
          nodes={renderNodes}
          selectedNodeId={selectedNodeId}
          chainData={chainData}
          tableDensity={tableDensity}
          onSelect={onSelect}
          onAdd={onAdd}
          onInsert={onInsert}
          onRemove={onRemove}
          onToggleExpand={onToggleExpand}
          onToggleBranch={onToggleBranch}
          onToggleDataset={onToggleDataset}
          onDrillDown={onDrillDown}
          onTableCellClick={onTableCellClick}
          onTableSortChange={onTableSortChange}
          onAssistantRequest={onAssistantRequest}
          onAddFilter={onAddFilter}
          onUpdateFilter={onUpdateFilter}
          onRemoveFilter={onRemoveFilter}
          onFilterCellAction={onFilterCellAction}
          showAddMenuForId={showAddMenuForId}
          setShowAddMenuForId={setShowAddMenuForId}
          showInsertMenuForId={showInsertMenuForId}
          setShowInsertMenuForId={setShowInsertMenuForId}
          onUpdateNodePosition={onUpdateNodePosition}
          onAutoLayout={onAutoLayout}
          onEntangledColorChange={onEntangledColorChange}
          onRenameBranch={onRenameBranch}
        />
      ) : (
        <div className={isMobileMode
          ? 'w-full flex justify-center px-4 py-6 items-start min-h-full'
          : (isSmartMode
            ? 'w-full flex justify-start px-20 pt-6 items-start min-h-full'
            : 'min-w-full inline-flex justify-center p-20 items-start min-h-full')}
        >
          <TreeNode
            nodeId="node-start"
            nodes={renderNodes}
            selectedNodeId={selectedNodeId}
            chainData={chainData}
            tableDensity={tableDensity}
            onSelect={onSelect}
            onAdd={onAdd}
            onInsert={onInsert}
            onRemove={onRemove}
            onToggleExpand={onToggleExpand}
            onToggleBranch={onToggleBranch}
            onToggleDataset={onToggleDataset}
            onDrillDown={onDrillDown}
            onTableCellClick={onTableCellClick}
            onTableSortChange={onTableSortChange}
            onAssistantRequest={onAssistantRequest}
            onAddFilter={onAddFilter}
            onUpdateFilter={onUpdateFilter}
            onRemoveFilter={onRemoveFilter}
            onFilterCellAction={onFilterCellAction}
            showAddMenuForId={showAddMenuForId}
            setShowAddMenuForId={setShowAddMenuForId}
            showInsertMenuForId={showInsertMenuForId}
            setShowInsertMenuForId={setShowInsertMenuForId}
            renderMode={renderMode}
            leafCountById={leafCountById}
            branchSelectionByNodeId={branchSelectionByNodeId}
            onSelectBranch={onSelectBranch}
            onRenameBranch={onRenameBranch}
            onToggleEntangle={onToggleEntangle}
            onEntangledColorChange={onEntangledColorChange}
          />
        </div>
      )}
    </div>
  );
};

export default ExplorationAssetView;
