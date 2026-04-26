#!/usr/bin/env node
// Generate schema from Supabase export data

import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./supabase-export.json', 'utf8'));

function generateCreateTable(tableName, sampleRow) {
  if (!sampleRow || Object.keys(sampleRow).length === 0) {
    return `-- No data for ${tableName}, skipping schema generation\n`;
  }

  const columns = Object.keys(sampleRow);
  let sql = `-- ${tableName}\n`;
  sql += `DROP TABLE IF EXISTS ${tableName} CASCADE;\n`;
  sql += `CREATE TABLE ${tableName} (\n`;
  
  const columnDefs = columns.map(col => {
    const value = sampleRow[col];
    let type = 'TEXT';
    
    if (value === null || value === undefined) {
      type = 'TEXT';
    } else if (typeof value === 'boolean') {
      type = 'BOOLEAN';
    } else if (typeof value === 'number') {
      type = Number.isInteger(value) ? 'INTEGER' : 'DECIMAL(10, 2)';
    } else if (typeof value === 'object') {
      if (Array.isArray(value)) {
        type = 'TEXT[]';
      } else {
        type = 'JSONB';
      }
    } else if (typeof value === 'string') {
      // Try to detect UUID
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        type = 'UUID';
      }
      // Try to detect timestamp
      else if (value.match(/^\d{4}-\d{2}-\d{2}T/)) {
        type = 'TIMESTAMP WITH TIME ZONE';
      }
      // Try to detect date
      else if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        type = 'DATE';
      }
      // Try to detect integer (as string)
      else if (value.match(/^\d+$/) && value.length <= 15) {
        type = 'BIGINT';
      }
    }
    
    return `  ${col} ${type}`;
  });
  
  // Add primary key if there's an 'id' column
  if (columns.includes('id')) {
    columnDefs[0] = `  id UUID PRIMARY KEY`;
  }
  
  sql += columnDefs.join(',\n');
  sql += '\n);\n\n';
  
  return sql;
}

let schema = '-- T-POS Database Schema\n';
schema += '-- Generated from Supabase export\n\n';

for (const [tableName, rows] of Object.entries(data)) {
  if (rows && rows.length > 0) {
    schema += generateCreateTable(tableName, rows[0]);
  }
}

fs.writeFileSync('./server/db/schema.sql', schema);
console.log('Schema generated from data and saved to server/db/schema.sql');
