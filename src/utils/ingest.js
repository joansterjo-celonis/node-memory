// src/utils/ingest.js
// CSV/XLSX ingestion utilities. Pure helpers so future testing is easy.

const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsText(file);
  });

const readFileAsArrayBuffer = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });

const parseCSV = (csvText) => {
  // Minimal CSV parser (handles quoted values + commas). Good enough for most exports.
  const text = String(csvText || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (char === ',' || char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') continue;
      row.push(current);
      current = '';
      if (char === '\n') {
        rows.push(row);
        row = [];
      }
      continue;
    }
    current += char;
  }

  row.push(current);
  rows.push(row);

  const trimmed = rows.filter(r => r.some(cell => String(cell).trim() !== ''));
  if (trimmed.length === 0) return [];

  const headers = trimmed[0].map(h => String(h || '').trim()).filter(Boolean);
  const out = [];
  for (let i = 1; i < trimmed.length; i++) {
    const r = trimmed[i];
    const obj = {};
    headers.forEach((key, idx) => {
      obj[key] = r[idx] ?? '';
    });
    out.push(obj);
  }
  return out;
};

const parseXLSX = (arrayBuffer) => {
  // XLSX must be loaded globally via the CDN in index.html
  if (!window?.XLSX) {
    throw new Error('Excel parsing library failed to load. Please refresh and try again.');
  }
  const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
  const tables = {};
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    tables[sheetName] = rows;
  });
  return tables;
};

const buildDataModelFromCSV = (fileName, rows) => {
  const name = fileName.replace(/\.(csv)$/i, '') || 'data';
  return { tables: { [name]: rows }, order: [name] };
};

const buildDataModelFromXLSX = (tables) => {
  const order = Object.keys(tables);
  return { tables, order };
};

export {
  readFileAsText,
  readFileAsArrayBuffer,
  parseCSV,
  parseXLSX,
  buildDataModelFromCSV,
  buildDataModelFromXLSX
};
