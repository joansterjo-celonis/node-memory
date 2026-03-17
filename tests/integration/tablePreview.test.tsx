import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TablePreview } from '../../src/components/TreeNode';

afterEach(() => {
  cleanup();
});

describe('TablePreview virtualization', () => {
  it('renders a small window for large datasets', () => {
    const getRowAt = vi.fn((index: number) => ({ colA: `Row ${index}` }));

    render(
      <div style={{ height: 300 }}>
        <TablePreview
          rowCount={1_000_000}
          columns={['colA']}
          getRowAt={getRowAt}
          nodeId="node-1"
          sortBy=""
          sortDirection=""
        />
      </div>
    );

    expect(screen.getByText('colA')).toBeInTheDocument();
    // TanStack Virtual requires real element dimensions; in jsdom containers
    // have zero height so no rows are virtualized. Verify that at most a small
    // window was requested (0 in jsdom, a handful in real browsers).
    expect(getRowAt.mock.calls.length).toBeLessThan(5000);
  });
});
