#!/usr/bin/env node
/**
 * Конвертирует COPY ... FROM stdin в INSERT для Supabase SQL Editor
 * Использование: node copy-to-insert.mjs < data.sql > data-insert.sql
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = join(__dirname, 'data.sql');
const outputPath = join(__dirname, 'data-insert.sql');

function escapeSql(val) {
  if (val === '\\N' || val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''").replace(/\\/g, '\\\\') + "'";
}

function parseCopyLine(line) {
  const match = line.match(/^COPY\s+"?([^"]+)"?\s*\.\s*"?([^"]+)"?\s*\(([^)]+)\)\s+FROM\s+stdin;?$/);
  if (match) {
    return { schema: match[1], table: match[2], cols: match[3].trim() };
  }
  const simple = line.match(/^COPY\s+"?([^"\s]+)"?\s*\(([^)]+)\)\s+FROM\s+stdin;?$/);
  if (simple) return { schema: 'public', table: simple[1].replace(/^public\./, ''), cols: simple[2].trim() };
  return null;
}

const content = readFileSync(inputPath, 'utf8');
const lines = content.split('\n');
const out = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  const copyInfo = parseCopyLine(line);
  if (copyInfo) {
    const fullTable = copyInfo.schema ? `"${copyInfo.schema}"."${copyInfo.table}"` : `"${copyInfo.table}"`;
    const cols = copyInfo.cols;
    const rows = [];
    i++;
    while (i < lines.length && lines[i] !== '\\.' && !lines[i].trim().startsWith('\\.')) {
      const rowLine = lines[i];
      if (rowLine.trim() === '') { i++; continue; }
      const parts = [];
      let pos = 0;
      const s = rowLine;
      while (pos < s.length) {
        if (s[pos] === '\\' && (s[pos + 1] === 'N' || s[pos + 1] === 't' || s[pos + 1] === 'n' || s[pos + 1] === 'r' || s[pos + 1] === '\\')) {
          if (s[pos + 1] === 'N') parts.push(null);
          else if (s[pos + 1] === 't') parts.push('\t');
          else if (s[pos + 1] === 'n') parts.push('\n');
          else if (s[pos + 1] === 'r') parts.push('\r');
          else parts.push('\\');
          pos += 2;
          continue;
        }
        let end = pos;
        const isTab = s[pos] === '\t';
        if (isTab) {
          parts.push('');
          pos++;
          continue;
        }
        while (end < s.length && s[end] !== '\t') end++;
        parts.push(s.slice(pos, end));
        pos = end + (s[end] === '\t' ? 1 : 0);
      }
      rows.push(parts);
      i++;
    }
    if (i < lines.length && (lines[i] === '\\.' || lines[i].trim().startsWith('\\.'))) i++;

    const BATCH = 100;
    for (let b = 0; b < rows.length; b += BATCH) {
      const chunk = rows.slice(b, b + BATCH);
      const values = chunk.map(row =>
        '(' + row.map(v => escapeSql(v)).join(', ') + ')'
      ).join(',\n');
      out.push(`INSERT INTO ${fullTable} (${cols}) VALUES\n${values};`);
    }
    continue;
  }
  out.push(line);
  i++;
}

const result = out.join('\n');
writeFileSync(outputPath, result);
console.log(`Written ${outputPath} (${(result.length / 1024).toFixed(1)} KB)`);
