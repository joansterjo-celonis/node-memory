import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TablePreview } from '../../src/components/TreeNode.jsx';

afterEach(() => {
  cleanup();
});

describe('TablePreview virtualization', () => {
  it('renders a small window for large datasets', () => {
    const getRowAt = vi.fn((index) => ({ colA: `Row ${index}` }));

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
    expect(getRowAt.mock.calls.length).toBeGreaterThan(0);
    expect(getRowAt.mock.calls.length).toBeLessThan(5000);
  });
});
