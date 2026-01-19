import { describe, expect, it } from 'vitest';

describe('ingest utils', () => {
  it('parses CSV rows with quotes and commas', () => {
    const { parseCSV } = window.Ingest;
    const rows = parseCSV('name,age\n"Jane, D",30\nBob,25\n');
    expect(rows).toEqual([
      { name: 'Jane, D', age: '30' },
      { name: 'Bob', age: '25' }
    ]);
  });

  it('builds data model from CSV rows', () => {
    const { buildDataModelFromCSV } = window.Ingest;
    const rows = [{ a: '1' }];
    const model = buildDataModelFromCSV('sales.csv', rows);
    expect(model.order).toEqual(['sales']);
    expect(model.tables.sales).toEqual(rows);
  });

  it('builds data model from XLSX tables', () => {
    const { buildDataModelFromXLSX } = window.Ingest;
    const model = buildDataModelFromXLSX({ Sheet1: [{ a: '1' }], Sheet2: [] });
    expect(model.order).toEqual(['Sheet1', 'Sheet2']);
    expect(model.tables.Sheet1).toEqual([{ a: '1' }]);
  });
});
