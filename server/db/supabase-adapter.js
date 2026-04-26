import { select, update, query } from './index.js';

/**
 * Адаптер для совместимости с Supabase REST API
 * Позволяет постепенно мигрировать с Supabase на локальный PostgreSQL
 */

// Парсинг Supabase query string в фильтры
function parseSupabaseQuery(query) {
  const filters = {};
  const columns = ['*'];
  const orderBy = [];
  const limit = null;
  
  if (!query) return { filters, columns, orderBy, limit };
  
  const params = query.split('&');
  
  for (const param of params) {
    const [key, value] = param.split('=');
    const decodedKey = decodeURIComponent(key);
    const decodedValue = decodeURIComponent(value);
    
    if (decodedKey === 'select') {
      columns = decodedValue.split(',');
    } else if (decodedKey === 'order') {
      const parts = decodedValue.split('.');
      const column = parts[0];
      const direction = parts[1] || 'asc';
      orderBy.push({ column, direction });
    } else if (decodedKey === 'limit') {
      return { filters, columns, orderBy, limit: parseInt(decodedValue) };
    } else {
      // Parse filters like: id=eq.value, nickname=ilike.%value%, role=in.(value1,value2)
      const match = decodedKey.match(/^(.+?)\.(eq|ilike|gt|lt|gte|lte|in|is)$/);
      if (match) {
        const [, field, operator] = match;
        
        if (operator === 'eq') {
          filters[field] = decodedValue;
        } else if (operator === 'ilike') {
          filters[field] = decodedValue.replace('%', '.*').replace('%', '.*');
        } else if (operator === 'gt') {
          filters[field] = { $gt: decodedValue };
        } else if (operator === 'lt') {
          filters[field] = { $lt: decodedValue };
        } else if (operator === 'gte') {
          filters[field] = { $gte: decodedValue };
        } else if (operator === 'lte') {
          filters[field] = { $lte: decodedValue };
        } else if (operator === 'in') {
          const values = decodedValue.replace(/[()]/g, '').split(',');
          filters[field] = { $in: values };
        } else if (operator === 'is') {
          if (decodedValue === 'null') {
            filters[field] = null;
          }
        }
      }
    }
  }
  
  return { filters, columns, orderBy, limit };
}

// Применение фильтров к запросу
function applyFilters(query, filters) {
  const conditions = [];
  const values = [];
  let paramIndex = 1;
  
  for (const [key, value] of Object.entries(filters)) {
    if (value === null) {
      conditions.push(`${key} IS NULL`);
    } else if (typeof value === 'object') {
      if (value.$gt) {
        conditions.push(`${key} > $${paramIndex++}`);
        values.push(value.$gt);
      } else if (value.$lt) {
        conditions.push(`${key} < $${paramIndex++}`);
        values.push(value.$lt);
      } else if (value.$gte) {
        conditions.push(`${key} >= $${paramIndex++}`);
        values.push(value.$gte);
      } else if (value.$lte) {
        conditions.push(`${key} <= $${paramIndex++}`);
        values.push(value.$lte);
      } else if (value.$in) {
        const placeholders = value.$in.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`${key} IN (${placeholders})`);
        values.push(...value.$in);
      }
    } else if (typeof value === 'string' && value.includes('.*')) {
      // ILIKE
      conditions.push(`${key} ILIKE $${paramIndex++}`);
      values.push(value.replace('.*', '%'));
    } else {
      conditions.push(`${key} = $${paramIndex++}`);
      values.push(value);
    }
  }
  
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }
  
  return { query, values };
}

// Применение сортировки
function applyOrderBy(query, orderBy) {
  if (orderBy.length > 0) {
    const orderClauses = orderBy.map(o => `${o.column} ${o.direction.toUpperCase()}`);
    query += ` ORDER BY ${orderClauses.join(', ')}`;
  }
  return query;
}

// Основная функция SELECT (замена Supabase REST)
async function sbSelect(table, queryString = '') {
  try {
    const { filters, columns, orderBy, limit } = parseSupabaseQuery(queryString);
    
    let sql = `SELECT ${columns.join(', ')} FROM ${table}`;
    const { query: queryWithFilters, values } = applyFilters(sql, filters);
    sql = applyOrderBy(queryWithFilters, orderBy);
    
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }
    
    const result = await query(sql, values);
    return result;
  } catch (error) {
    console.error(`[DB] Error in sbSelect(${table}):`, error.message);
    return [];
  }
}

// Функция UPDATE (замена Supabase REST)
async function sbUpdate(table, filter, data) {
  try {
    // Parse filter like: id=eq.value
    const match = filter.match(/^(.+?)=eq\.(.+)$/);
    if (!match) return false;
    
    const [, field, value] = match;
    const filters = { [field]: decodeURIComponent(value) };
    
    const result = await update(table, filters, data);
    return result.length > 0;
  } catch (error) {
    console.error(`[DB] Error in sbUpdate(${table}):`, error.message);
    return false;
  }
}

// Специфичные функции для AI контекста (оптимизированные)
async function getAIContext() {
  try {
    const [
      profileRows, checkRows, checkItemRows, inventoryRows,
      expenseRows, supplyRows, cashOpRows, shiftRows, eventRows,
      refundRows, salaryRows, supplyItemRows,
      certRows, spaceRows,
    ] = await Promise.all([
      query(`SELECT id,nickname,role,balance,bonus_points,client_tier,is_resident,created_at,deleted_at FROM profiles ORDER BY created_at DESC LIMIT 500`),
      query(`SELECT id,player_id,total_amount,payment_method,bonus_used,closed_at,staff_id FROM checks WHERE status='closed' ORDER BY closed_at DESC LIMIT 500`),
      query(`SELECT check_id,item_id,quantity,price_at_time FROM check_items LIMIT 3000`),
      query(`SELECT id,name,category,price,stock_quantity,is_active FROM inventory ORDER BY name`),
      query(`SELECT category,amount,expense_date FROM expenses ORDER BY expense_date DESC LIMIT 100`),
      query(`SELECT id,total_cost,created_at FROM supplies ORDER BY created_at DESC LIMIT 50`),
      query(`SELECT type,amount,created_at FROM cash_operations ORDER BY created_at DESC LIMIT 50`),
      query(`SELECT id,opened_at,closed_at,evening_type,cash_start,cash_end FROM shifts ORDER BY opened_at DESC LIMIT 30`),
      query(`SELECT id,type,location,date,start_time,end_time,status FROM events ORDER BY date DESC LIMIT 30`),
      query(`SELECT id,check_id,total_amount,refund_type FROM refunds ORDER BY created_at DESC LIMIT 30`),
      query(`SELECT id,profile_id,amount,created_at FROM salary_payments ORDER BY created_at DESC LIMIT 30`),
      query(`SELECT id,supply_id,item_id,quantity,cost_per_unit FROM supply_items LIMIT 100`),
      query(`SELECT id,code,nominal,balance FROM certificates`),
      query(`SELECT id,name,type,hourly_rate FROM spaces`),
    ]);

    // Формируем компактный текстовый контекст
    const context = {
      profiles: profileRows.map(p => `${p.nickname}:${p.role}:${p.balance}:${p.client_tier}`).join('|'),
      checks: checkRows.map(c => `${c.id}:${c.total_amount}:${c.payment_method}`).join('|'),
      inventory: inventoryRows.map(i => `${i.name}:${i.category}:${i.price}:${i.stock_quantity}`).join('|'),
      expenses: expenseRows.map(e => `${e.category}:${e.amount}:${e.expense_date}`).join('|'),
      supplies: supplyRows.map(s => `${s.id}:${s.total_cost}`).join('|'),
      shifts: shiftRows.map(s => `${s.id}:${s.evening_type}:${s.cash_end}`).join('|'),
      events: eventRows.map(e => `${e.type}:${e.date}:${e.status}`).join('|'),
    };

    return JSON.stringify(context);
  } catch (error) {
    console.error('[DB] Error getting AI context:', error.message);
    return '{}';
  }
}

export {
  sbSelect,
  sbUpdate,
  getAIContext,
};
