#!/usr/bin/env node
// Convert Supabase export to SQL INSERT statements

import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./supabase-export.json', 'utf8'));

function escapeValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return value;
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function generateInsert(tableName, rows) {
  if (!rows || rows.length === 0) return `-- No data for ${tableName}\n`;
  
  const columns = Object.keys(rows[0]);
  let sql = `-- ${tableName}\n`;
  
  for (const row of rows) {
    const values = columns.map(col => escapeValue(row[col])).join(', ');
    sql += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values});\n`;
  }
  
  return sql + '\n';
}

let sql = '-- T-POS Database Data Export from Supabase\n';
sql += '-- Generated on ' + new Date().toISOString() + '\n\n';

for (const [tableName, rows] of Object.entries(data)) {
  sql += generateInsert(tableName, rows);
}

fs.writeFileSync('./server/db/data.sql', sql);
console.log('SQL INSERT statements generated and saved to server/db/data.sql');
