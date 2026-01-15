// src/components/TreeNode.js
// Recursive node renderer for the branching analysis canvas.
const React = window.React;
const {
  Plus,
  Filter,
  BarChart3,
  Database,
  Trash2,
  ChevronRight,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Sigma,
  TableIcon,
  GitBranch,
  Hash,
  Gauge,
  LinkIcon,
  Minimize2
} = window.Icons;

const { getChildren, countDescendants, getNodeResult, calculateMetric } = window.NodeUtils;
const SimpleChart = window.SimpleChart;

const TABLE_ROW_HEIGHT = 24;
const TABLE_OVERSCAN = 6;

const TablePreview = React.memo(({ data, columns, onCellClick, nodeId }) => {
  const scrollRef = React.useRef(null);
  const rafRef = React.useRef(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(0);

  const totalRows = data.length;
  const maxScrollTop = Math.max(0, totalRows * TABLE_ROW_HEIGHT - viewportHeight);
  const effectiveScrollTop = Math.min(scrollTop, maxScrollTop);
  const startIndex = Math.max(0, Math.floor(effectiveScrollTop / TABLE_ROW_HEIGHT) - TABLE_OVERSCAN);
  const endIndex = Math.min(
    totalRows,
    Math.ceil((effectiveScrollTop + viewportHeight) / TABLE_ROW_HEIGHT) + TABLE_OVERSCAN
  );
  const visibleRows = data.slice(startIndex, endIndex);
  const paddingTop = startIndex * TABLE_ROW_HEIGHT;
  const paddingBottom = Math.max(0, (totalRows - endIndex) * TABLE_ROW_HEIGHT);
  const columnCount = Math.max(1, columns.length);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateHeight = () => {
      const height = el.getBoundingClientRect().height;
      setViewportHeight(height);
    };
    updateHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }

    let frame = null;
    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateHeight);
    });

    // Observe the scroll container and the resizable node wrapper.
    observer.observe(el);
    const resizable = el.closest('[data-node-resize]');
    if (resizable) observer.observe(resizable);
    const parent = el.parentElement;
    if (parent) observer.observe(parent);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [data.length, columns.length]);

  React.useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const handleScroll = (e) => {
    const nextTop = e.currentTarget.scrollTop;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(nextTop);
    });
  };

  if (columns.length === 0) {
    return (
      <div className="flex-1 min-h-0 px-2 pb-2 text-[10px] text-gray-400 flex items-center justify-center">
        No columns available for preview
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="overflow-auto flex-1 min-h-0 px-2 pb-2"
    >
      <table className="min-w-max w-full text-left border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b sticky top-0 shadow-sm">
            {columns.map(col => (
              <th key={col} className="p-1 bg-gray-50 text-gray-600 font-medium whitespace-nowrap">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td className="p-0 border-0" style={{ height: `${paddingTop}px` }} colSpan={columnCount}></td>
            </tr>
          )}
          {visibleRows.map((row, idx) => (
            <tr
              key={startIndex + idx}
              className="border-b hover:bg-blue-50 transition-colors"
              style={{ height: `${TABLE_ROW_HEIGHT}px` }}
            >
              {columns.map(col => (
                <td
                  key={col}
                  className="p-1 truncate cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors max-w-[100px]"
                  onClick={(e) => { e.stopPropagation(); onCellClick(row[col], col, nodeId); }}
                  title={`Filter by ${col} = ${row[col]}`}
                >
                  {row[col]}
                </td>
              ))}
            </tr>
          ))}
          {paddingBottom > 0 && (
            <tr aria-hidden="true">
              <td className="p-0 border-0" style={{ height: `${paddingBottom}px` }} colSpan={columnCount}></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});

const TreeNode = ({
  nodeId,
  nodes,
  selectedNodeId,
  chainData,
  onSelect,
  onAdd,
  onInsert,
  onRemove,
  onToggleExpand,
  onToggleChildren,
  onToggleBranch,
  onDrillDown,
  onTableCellClick,
  showAddMenuForId,
  setShowAddMenuForId,
  showInsertMenuForId,
  setShowInsertMenuForId
}) => {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return null;

  const result = getNodeResult(chainData, nodeId);
  const children = getChildren(nodes, nodeId);
  const isActive = selectedNodeId === nodeId;
  const isExpanded = node.isExpanded !== false;
  const areChildrenCollapsed = node.areChildrenCollapsed === true;
  const isBranchCollapsed = node.isBranchCollapsed === true;

  // Resolve icon by node type (and component subtype).
  let Icon = Database;
  if (node.type === 'FILTER') Icon = Filter;
  if (node.type === 'AGGREGATE') Icon = Sigma;
  if (node.type === 'JOIN') Icon = LinkIcon;
  if (node.type === 'COMPONENT') {
    if (node.params.subtype === 'TABLE') Icon = TableIcon;
    if (node.params.subtype === 'CHART') Icon = BarChart3;
    if (node.params.subtype === 'KPI') Icon = Hash;
    if (node.params.subtype === 'GAUGE') Icon = Gauge;
  }

  // KPI/Gauge metric calculation (derived from node output).
  const metricValue = (node.type === 'COMPONENT' && (node.params.subtype === 'KPI' || node.params.subtype === 'GAUGE') && result)
    ? calculateMetric(result.data, node.params.metricField, node.params.fn || 'count')
    : 0;

  // Columns for table preview (user-selected or default schema).
  const visibleColumns = (node.type === 'COMPONENT' && node.params.subtype === 'TABLE' && node.params.columns && node.params.columns.length > 0)
    ? node.params.columns
    : result ? result.schema : [];

  const hiddenCount = areChildrenCollapsed ? countDescendants(nodes, nodeId) : 0;

  // Compact collapsed branch representation.
  if (isBranchCollapsed) {
    return (
      <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
        <div className="relative z-10">
          <div
            onClick={(e) => { e.stopPropagation(); onToggleBranch(nodeId); }}
            className="bg-white border border-gray-200 shadow-sm rounded-full px-4 py-2 flex items-center gap-2 cursor-pointer hover:border-blue-400 hover:text-blue-600 transition-all"
            title="Expand Branch"
          >
            <GitBranch size={14} className="text-indigo-500" />
            <span className="text-xs font-medium text-gray-600 truncate max-w-[150px]">{node.title}</span>
            <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 rounded-full border border-gray-100 flex items-center gap-0.5">
              <Plus size={8} />
              {countDescendants(nodes, nodeId) + 1}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
      {/* NODE CARD */}
      <div className="relative group z-10">
        <div
          onClick={(e) => { e.stopPropagation(); onSelect(nodeId); }}
          className={`
            bg-white rounded-xl border-2 transition-all cursor-pointer overflow-hidden relative flex flex-col
            ${isActive ? 'border-blue-500 shadow-xl shadow-blue-500/10 ring-1 ring-blue-500 z-20' : 'border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md'}
          `}
          style={{
            width: 320,
            height: 320,
            minWidth: 260,
            minHeight: 180,
            resize: 'both'
          }}
          data-node-resize="true"
        >
          {/* Header */}
          <div className="p-4 flex items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(nodeId); }}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5 transition-colors"
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
              <Icon size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-gray-900 text-sm truncate">{node.title}</h4>
                {node.branchName && (
                  <span className="bg-indigo-50 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-indigo-100 uppercase tracking-tight">
                    {node.branchName}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 truncate mt-0.5">
                {node.type === 'FILTER' && node.params.field ? `${node.params.field} ${node.params.operator} ${node.params.value}` :
                  node.type === 'AGGREGATE' ? `Group by ${node.params.groupBy}` :
                  node.type === 'JOIN' ? `with ${node.params.rightTable || '...'}` :
                  node.type === 'COMPONENT' ? `${node.params.subtype} View` :
                  node.description || node.type}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onAdd('FILTER', nodeId); }}
                className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-indigo-600 transition-colors"
                title="Fork Branch"
              >
                <GitBranch size={16} />
              </button>

              {children.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleChildren(nodeId); }}
                  className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-indigo-600 transition-colors"
                  title={areChildrenCollapsed ? "Expand Children" : "Collapse Children"}
                >
                  {areChildrenCollapsed ? <ChevronsDown size={16} /> : <ChevronsUp size={16} />}
                </button>
              )}

              {node.parentId && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleBranch(nodeId); }}
                  className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-indigo-600 transition-colors"
                  title="Minimize Node"
                >
                  <Minimize2 size={16} />
                </button>
              )}

              {node.type !== 'SOURCE' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(nodeId); }}
                  className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Content Preview */}
          {isExpanded && result && (() => {
            const isTablePreview = node.params.subtype === 'TABLE' || (node.type !== 'COMPONENT' && node.type !== 'JOIN');
            return (
            <div className={`border-t border-gray-100 bg-gray-50 ${isTablePreview ? 'p-0' : 'p-4'} flex-1 min-h-0 animate-in slide-in-from-top-2 duration-200 flex flex-col overflow-hidden`}>
              {/* TABLE VIEW */}
              {isTablePreview && (
                <div className="h-full overflow-hidden text-[10px] bg-white border border-gray-200 rounded flex flex-col">
                  <div className="flex justify-between text-xs font-bold text-gray-500 mb-2 px-2 pt-2">
                    <span>Preview</span>
                    <span>{result.data.length} rows</span>
                  </div>
                  <TablePreview
                    data={result.data}
                    columns={visibleColumns}
                    onCellClick={onTableCellClick}
                    nodeId={nodeId}
                  />
                </div>
              )}

              {/* JOIN VIEW */}
              {node.type === 'JOIN' && (
                <div className="h-full bg-slate-900 rounded p-3 text-[10px] font-mono text-slate-300 overflow-auto">
                  <div><span className="text-pink-400">SELECT</span> *</div>
                  <div><span className="text-pink-400">FROM</span> [PreviousNode]</div>
                  <div><span className="text-pink-400">{node.params.joinType || 'LEFT'} JOIN</span> {node.params.rightTable || '...'}</div>
                  <div><span className="text-pink-400">ON</span> {node.params.leftKey || '?'} = {node.params.rightKey || '?'}</div>
                  <div className="mt-2 pt-2 border-t border-slate-700 text-slate-500 italic">
                    Result: {result.data.length} rows merged
                  </div>
                </div>
              )}

              {/* CHART VIEW */}
              {node.params.subtype === 'CHART' && (
                <SimpleChart
                  data={result.data}
                  xAxis={node.params.xAxis}
                  yAxis={node.params.yAxis}
                  type={node.params.chartType || 'bar'}
                  onClick={(d) => onDrillDown(d, node.params.xAxis, nodeId)}
                />
              )}

              {/* KPI VIEW */}
              {node.params.subtype === 'KPI' && (
                <div className="h-full flex flex-col items-center justify-center bg-white border border-gray-200 rounded p-4 text-center">
                  <div className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">
                    {node.params.fn} of {node.params.metricField || 'records'}
                  </div>
                  <div className="text-4xl font-bold text-blue-600">
                    {metricValue}
                  </div>
                </div>
              )}

              {/* GAUGE VIEW */}
              {node.params.subtype === 'GAUGE' && (
                <div className="h-full flex flex-col items-center justify-center bg-white border border-gray-200 rounded p-4">
                  <div className="w-full flex justify-between text-xs text-gray-500 mb-1">
                    <span>{node.params.fn}</span>
                    <span>Target: {node.params.target || 100}</span>
                  </div>
                  <div className="text-3xl font-bold text-gray-900 mb-3">{metricValue}</div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min(100, (metricValue / (node.params.target || 100)) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-400">
                    {Math.round((metricValue / (node.params.target || 100)) * 100)}% of target
                  </div>
                </div>
              )}
            </div>
            );
          })()}
        </div>

        {/* ADD BUTTON - Only show if NO children */}
        {children.length === 0 && (
          <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 translate-y-full z-20 transition-all ${!isExpanded ? '-mt-4' : ''}`}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAddMenuForId(showAddMenuForId === nodeId ? null : nodeId);
              }}
              className="w-8 h-8 bg-gray-100 hover:bg-blue-600 hover:text-white rounded-full flex items-center justify-center border-2 border-white shadow-sm transition-colors text-gray-400"
            >
              <Plus size={16} strokeWidth={3} />
            </button>

            {showAddMenuForId === nodeId && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-xl border border-gray-100 p-2 w-56 z-50 animate-in fade-in slide-in-from-top-1">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Data Ops</div>
                <button onClick={() => onAdd('FILTER', nodeId)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 capitalize flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-400"></div> Filter
                </button>
                <button onClick={() => onAdd('AGGREGATE', nodeId)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 capitalize flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400"></div> Aggregate
                </button>
                <button onClick={() => onAdd('JOIN', nodeId)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 capitalize flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-pink-400"></div> SQL Join
                </button>

                <div className="h-px bg-gray-100 my-1"></div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Components</div>

                <button onClick={() => onAdd('COMPONENT', nodeId, 'TABLE')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 flex items-center gap-2 group/item">
                  <TableIcon size={14} className="text-gray-400 group-hover/item:text-blue-600" /> Table
                </button>
                <button onClick={() => onAdd('COMPONENT', nodeId, 'CHART')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 flex items-center gap-2 group/item">
                  <BarChart3 size={14} className="text-gray-400 group-hover/item:text-blue-600" /> Chart
                </button>
                <button onClick={() => onAdd('COMPONENT', nodeId, 'KPI')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 flex items-center gap-2 group/item">
                  <Hash size={14} className="text-gray-400 group-hover/item:text-blue-600" /> KPI
                </button>
                <button onClick={() => onAdd('COMPONENT', nodeId, 'GAUGE')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm text-gray-700 flex items-center gap-2 group/item">
                  <Gauge size={14} className="text-gray-400 group-hover/item:text-blue-600" /> Gauge
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONNECTORS & CHILDREN */}
      {children.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="w-0.5 h-8 bg-gray-300 relative group/line">
            {!areChildrenCollapsed && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/line:opacity-100 transition-opacity z-30">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowInsertMenuForId(showInsertMenuForId === nodeId ? null : nodeId);
                  }}
                  className="w-5 h-5 bg-slate-800 text-white rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                  title="Insert Step Here"
                >
                  <Plus size={12} strokeWidth={3} />
                </button>

                {showInsertMenuForId === nodeId && (
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-xl border border-gray-100 p-2 w-48 z-50 animate-in fade-in slide-in-from-top-1">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Insert Step</div>
                    <button onClick={() => onInsert('FILTER', nodeId)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-xs text-gray-700 capitalize flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div> Filter
                    </button>
                    <button onClick={() => onInsert('AGGREGATE', nodeId)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-xs text-gray-700 capitalize flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div> Aggregate
                    </button>
                    <button onClick={() => onInsert('JOIN', nodeId)} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-xs text-gray-700 capitalize flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-pink-400"></div> Join
                    </button>
                    <div className="h-px bg-gray-100 my-1"></div>
                    <button onClick={() => onInsert('COMPONENT', nodeId, 'TABLE')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-xs text-gray-700 flex items-center gap-2">
                      <TableIcon size={12} className="text-gray-400" /> Table
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {areChildrenCollapsed ? (
            <div className="flex flex-col items-center animate-in fade-in zoom-in-95">
              <div className="w-0.5 h-4 border-l-2 border-dashed border-gray-300"></div>
              {children.length > 1 ? (
                <div className="relative flex flex-col items-center">
                  <div className="absolute left-full top-0 ml-2 -mt-2 z-20">
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleChildren(nodeId); }}
                      className="flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors whitespace-nowrap shadow-sm"
                    >
                      <GitBranch size={10} />
                      +{children.length - 1} branches
                    </button>
                  </div>
                  <TreeNode
                    nodeId={children[0].id}
                    nodes={nodes}
                    selectedNodeId={selectedNodeId}
                    chainData={chainData}
                    onSelect={onSelect}
                    onAdd={onAdd}
                    onInsert={onInsert}
                    onRemove={onRemove}
                    onToggleExpand={onToggleExpand}
                    onToggleChildren={onToggleChildren}
                    onToggleBranch={onToggleBranch}
                    onDrillDown={onDrillDown}
                    onTableCellClick={onTableCellClick}
                    showAddMenuForId={showAddMenuForId}
                    setShowAddMenuForId={setShowAddMenuForId}
                    showInsertMenuForId={showInsertMenuForId}
                    setShowInsertMenuForId={setShowInsertMenuForId}
                  />
                </div>
              ) : (
                <div
                  onClick={() => onToggleChildren(nodeId)}
                  className="bg-gray-100 hover:bg-blue-50 text-gray-500 hover:text-blue-600 px-3 py-1 rounded-full text-xs font-medium border border-gray-200 cursor-pointer shadow-sm flex items-center gap-2"
                >
                  <span>+ {hiddenCount} steps</span>
                </div>
              )}
            </div>
          ) : (
            children.length === 1 ? (
              <TreeNode
                nodeId={children[0].id}
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                chainData={chainData}
                onSelect={onSelect}
                onAdd={onAdd}
                onInsert={onInsert}
                onRemove={onRemove}
                onToggleExpand={onToggleExpand}
                onToggleChildren={onToggleChildren}
                onToggleBranch={onToggleBranch}
                onDrillDown={onDrillDown}
                onTableCellClick={onTableCellClick}
                showAddMenuForId={showAddMenuForId}
                setShowAddMenuForId={setShowAddMenuForId}
                showInsertMenuForId={showInsertMenuForId}
                setShowInsertMenuForId={setShowInsertMenuForId}
              />
            ) : (
              <div className="flex flex-col items-center">
                <div className="relative flex gap-8">
                  {children.map((child, idx) => (
                    <div key={child.id} className="flex flex-col items-center relative">
                      <div className="flex w-full h-4">
                        <div className={`w-1/2 border-t-2 border-gray-300 ${idx === 0 ? 'border-transparent' : ''}`}></div>
                        <div className={`w-1/2 border-t-2 border-gray-300 ${idx === children.length - 1 ? 'border-transparent' : ''}`}></div>
                      </div>
                      <div className="absolute top-0 w-0.5 h-4 bg-gray-300"></div>
                      <div className="pt-0">
                        <TreeNode
                          nodeId={child.id}
                          nodes={nodes}
                          selectedNodeId={selectedNodeId}
                          chainData={chainData}
                          onSelect={onSelect}
                          onAdd={onAdd}
                          onInsert={onInsert}
                          onRemove={onRemove}
                          onToggleExpand={onToggleExpand}
                          onToggleChildren={onToggleChildren}
                          onToggleBranch={onToggleBranch}
                          onDrillDown={onDrillDown}
                          onTableCellClick={onTableCellClick}
                          showAddMenuForId={showAddMenuForId}
                          setShowAddMenuForId={setShowAddMenuForId}
                          showInsertMenuForId={showInsertMenuForId}
                          setShowInsertMenuForId={setShowInsertMenuForId}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

window.TreeNode = TreeNode;
