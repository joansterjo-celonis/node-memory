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

const CSV_STREAMING_THRESHOLD = 5 * 1024 * 1024;
const MAX_UPLOAD_MB = 30;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const rowsToObjects = (rows) => {
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
  return rowsToObjects(rows);
};

const parseCSVStream = async (file, { onProgress } = {}) => {
  const decoder = new TextDecoder();
  const reader = file.stream().getReader();
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;
  let pendingCR = false;
  let totalRead = 0;

  const processChunk = (text) => {
    let startIndex = 0;
    if (pendingCR) {
      if (text[0] === '\n') startIndex = 1;
      pendingCR = false;
    }

    for (let i = startIndex; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && (char === ',' || char === '\n' || char === '\r')) {
        if (char === '\r' && next === undefined) {
          pendingCR = true;
        }
        if (char === '\r' && next === '\n') {
          // Skip LF in CRLF
          i += 1;
        }
        row.push(current);
        current = '';
        if (char === '\n' || char === '\r') {
          rows.push(row);
          row = [];
        }
        continue;
      }
      current += char;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    totalRead += value.byteLength;
    const chunkText = decoder.decode(value, { stream: true });
    processChunk(chunkText);
    if (onProgress && file.size) {
      onProgress(Math.round((totalRead / file.size) * 100));
    }
  }

  const finalChunk = decoder.decode();
  if (finalChunk) processChunk(finalChunk);

  row.push(current);
  rows.push(row);
  return rowsToObjects(rows);
};

const parseCSVFile = async (file, options) => {
  if (file?.stream && file.size >= CSV_STREAMING_THRESHOLD) {
    return parseCSVStream(file, options);
  }
  const text = await readFileAsText(file);
  return parseCSV(text);
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
  MAX_UPLOAD_MB,
  MAX_UPLOAD_BYTES,
  readFileAsText,
  readFileAsArrayBuffer,
  parseCSV,
  parseCSVFile,
  parseXLSX,
  buildDataModelFromCSV,
  buildDataModelFromXLSX
};
