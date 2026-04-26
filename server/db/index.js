import pool from './client.js';

// Основные CRUD операции
export const select = async (table, filters = {}, columns = '*') => {
  const whereClause = Object.keys(filters)
    .map((key, i) => `${key} = $${i + 1}`)
    .join(' AND ');
  const values = Object.values(filters);
  
  const query = whereClause
    ? `SELECT ${columns} FROM ${table} WHERE ${whereClause}`
    : `SELECT ${columns} FROM ${table}`;
  
  const result = await pool.query(query, values.length ? values : undefined);
  return result.rows;
};

// SELECT с join
export const selectJoin = async (table, joins = [], filters = {}, columns = '*') => {
  let queryText = `SELECT ${columns} FROM ${table}`;
  let paramIndex = 1;
  const values = [];

  joins.forEach(join => {
    queryText += ` ${join.type || 'LEFT'} JOIN ${join.table} ON ${join.on}`;
  });

  const whereClause = Object.keys(filters)
    .map((key) => {
      values.push(filters[key]);
      return `${key} = $${paramIndex++}`;
    })
    .join(' AND ');

  if (whereClause) {
    queryText += ` WHERE ${whereClause}`;
  }

  const result = await pool.query(queryText, values);
  return result.rows;
};

// SELECT одной записи
export const selectOne = async (table, filters = {}, columns = '*') => {
  const rows = await select(table, filters, columns);
  return rows[0] || null;
};

// INSERT
export const insert = async (table, data) => {
  const columns = Object.keys(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const values = Object.values(data);
  
  const queryText = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const result = await pool.query(queryText, values);
  return result.rows[0];
};

// INSERT множества записей
export const insertMany = async (table, dataArray) => {
  if (!dataArray.length) return [];
  
  const columns = Object.keys(dataArray[0]);
  const placeholders = dataArray.map((_, rowIndex) => 
    columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(', ')
  ).join('), (');
  
  const values = dataArray.flatMap(row => Object.values(row));
  const queryText = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  
  const result = await pool.query(queryText, values);
  return result.rows;
};

// UPDATE
export const update = async (table, filters, data) => {
  const setClause = Object.keys(data)
    .map((key, i) => `${key} = $${i + 1}`)
    .join(', ');
  const whereClause = Object.keys(filters)
    .map((key, i) => `${key} = $${i + Object.keys(data).length + 1}`)
    .join(' AND ');
  
  const values = [...Object.values(data), ...Object.values(filters)];
  const queryText = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`;
  
  const result = await pool.query(queryText, values);
  return result.rows;
};

// DELETE
export const deleteRows = async (table, filters) => {
  const whereClause = Object.keys(filters)
    .map((key, i) => `${key} = $${i + 1}`)
    .join(' AND ');
  const values = Object.values(filters);
  
  const queryText = `DELETE FROM ${table} WHERE ${whereClause} RETURNING *`;
  const result = await pool.query(queryText, values);
  return result.rows;
};

// RPC вызов функции
export const rpc = async (functionName, params = {}) => {
  const paramNames = Object.keys(params);
  const paramValues = Object.values(params);
  const placeholders = paramNames.map((name, i) => `$${i + 1}::${typeof paramValues[i]}`).join(', ');
  
  const queryText = `SELECT * FROM ${functionName}(${placeholders})`;
  const result = await pool.query(queryText, paramValues);
  return result.rows[0] || null;
};

// Сырой SQL запрос
export const query = async (text, params) => {
  const result = await pool.query(text, params);
  return result.rows;
};

// Транзакции
export const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
