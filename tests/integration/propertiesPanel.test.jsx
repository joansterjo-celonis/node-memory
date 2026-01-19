import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

beforeAll(async () => {
  await import('../../src/components/PropertiesPanel.js');
});

afterEach(() => {
  cleanup();
});

const baseNode = {
  id: 'node-start',
  parentId: null,
  type: 'SOURCE',
  title: 'Load Raw Data',
  branchName: 'Main',
  isExpanded: true,
  params: { table: null, __files: [] }
};

describe('PropertiesPanel ingestion controls', () => {
  it('renders Clear data and calls handler when dataset is connected', async () => {
    const onClearData = vi.fn();
    const user = userEvent.setup();

    render(
      <window.PropertiesPanel
        node={baseNode}
        updateNode={vi.fn()}
        schema={[]}
        dataModel={{ tables: { data: [{ id: 1 }] }, order: ['data'] }}
        sourceStatus={{ title: 'Connected', detail: 'Loaded', loading: false }}
        onIngest={vi.fn()}
        onClearData={onClearData}
        onShowDataModel={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: /clear data/i });
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(onClearData).toHaveBeenCalledTimes(1);
  });

  it('hides Clear data when no dataset is loaded', () => {
    render(
      <window.PropertiesPanel
        node={baseNode}
        updateNode={vi.fn()}
        schema={[]}
        dataModel={{ tables: {}, order: [] }}
        sourceStatus={{ title: 'No data', detail: 'Upload', loading: false }}
        onIngest={vi.fn()}
        onClearData={vi.fn()}
        onShowDataModel={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /clear data/i })).toBeNull();
  });
});
