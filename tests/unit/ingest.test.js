import { describe, expect, it } from 'vitest';
import { parseCSV, buildDataModelFromCSV, buildDataModelFromXLSX } from '../../src/utils/ingest.js';

describe('ingest utils', () => {
  it('parses CSV rows with quotes and commas', () => {
    const rows = parseCSV('name,age\n"Jane, D",30\nBob,25\n');
    expect(rows).toEqual([
      { name: 'Jane, D', age: '30' },
      { name: 'Bob', age: '25' }
    ]);
  });

  it('builds data model from CSV rows', () => {
    const rows = [{ a: '1' }];
    const model = buildDataModelFromCSV('sales.csv', rows);
    expect(model.order).toEqual(['sales']);
    expect(model.tables.sales).toEqual(rows);
  });

  it('builds data model from XLSX tables', () => {
    const model = buildDataModelFromXLSX({ Sheet1: [{ a: '1' }], Sheet2: [] });
    expect(model.order).toEqual(['Sheet1', 'Sheet2']);
    expect(model.tables.Sheet1).toEqual([{ a: '1' }]);
  });
});
