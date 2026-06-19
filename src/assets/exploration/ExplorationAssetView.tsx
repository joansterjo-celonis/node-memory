import React from 'react';
import { TreeNode as TreeNodeImpl, FreeLayoutCanvas as FreeLayoutCanvasImpl } from './components/TreeNode';

// TreeNode and FreeLayoutCanvas are ported from a JS codebase and have
// loose prop types with a handful of optional-by-convention fields
// (menuId, headerDragProps, shouldSuppressSelect). Cast to any to keep
// the view wrapper thin; full typing can be added incrementally.
const TreeNode = TreeNodeImpl as any;
const FreeLayoutCanvas = FreeLayoutCanvasImpl as any;

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
  onDrillDown: (...args: any[]) => void;
  onTableCellClick: (...args: any[]) => void;
  onTableSortChange: (...args: any[]) => void;
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
  canvasScrollRef: React.RefObject<HTMLDivElement | null>;
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
  const dotBg = '[background-image:radial-gradient(circle,_rgb(0_0_0_/_0.12)_1px,_transparent_1px)] [background-size:20px_20px] bg-muted/30 dark:[background-image:radial-gradient(circle,_rgb(255_255_255_/_0.1)_1px,_transparent_1px)]';
  const containerClass = renderMode === 'freeLayout'
    ? `flex-1 min-h-0 overflow-hidden ${dotBg}`
    : `flex-1 min-h-0 overflow-auto ${dotBg} cursor-grab active:cursor-grabbing`;

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
