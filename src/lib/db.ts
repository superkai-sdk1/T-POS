/**
 * Database client for local PostgreSQL backend
 * Заменяет Supabase client на API calls к локальному серверу
 */

async function dbFetch<T = any>(
  operation: 'select' | 'selectOne' | 'insert' | 'update' | 'delete' | 'query',
  table: string,
  options?: {
    filters?: Record<string, any>;
    data?: Record<string, any>;
    columns?: string;
    orderBy?: { column: string; direction: 'asc' | 'desc' };
    limit?: number;
    params?: any[];
  }
): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, table, ...options }),
    });
    const json = await res.json();
    if (!res.ok || json.error) return { error: json.error || 'Ошибка сервера' };
    return { data: json.data as T };
  } catch (e) {
    return { error: 'Ошибка подключения к серверу' };
  }
}

/**
 * Select multiple rows
 */
export const select = <T = any>(table: string, filters?: Record<string, any>, columns = '*') =>
  dbFetch<T>('select', table, { filters, columns });

/**
 * Select single row
 */
export const selectOne = <T = any>(table: string, filters?: Record<string, any>, columns = '*') =>
  dbFetch<T>('selectOne', table, { filters, columns });

/**
 * Insert row
 */
export const insert = <T = any>(table: string, data: Record<string, any>) =>
  dbFetch<T>('insert', table, { data });

/**
 * Update rows
 */
export const update = <T = any>(table: string, filters: Record<string, any>, data: Record<string, any>) =>
  dbFetch<T>('update', table, { filters, data });

/**
 * Delete rows
 */
export const deleteRows = <T = any>(table: string, filters: Record<string, any>) =>
  dbFetch<T>('delete', table, { filters });

/**
 * Execute raw SQL query
 */
export const query = <T = any>(sql: string, params?: any[]) =>
  dbFetch<T>('query', '', { data: { sql, params } });

/**
 * Supabase-compatible API wrapper
 * Предоставляет совместимый интерфейс для полной миграции
 */
export const supabase = {
  rpc: (functionName: string, params?: { body: any }) => ({
    then: (resolve: (value: any) => any) => {
      resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    }
  }),
  channel: (name: string) => ({
    on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
    subscribe: () => ({ unsubscribe: () => {} })
  }),
  removeChannel: (channel: any) => {},
  from: (table: string) => ({
    select: (columns = '*') => {
      let filters: Record<string, any> = {};
      let orderBy: { column: string; direction: 'asc' | 'desc' } | undefined = undefined;
      let limitNum: number | undefined = undefined;

      const chain = {
        eq: (column: string, value: any) => {
          filters[column] = value;
          return chain;
        },
        neq: (column: string, value: any) => {
          filters[column] = { $ne: value };
          return chain;
        },
        gte: (column: string, value: any) => {
          filters[column] = { $gte: value };
          return chain;
        },
        gt: (column: string, value: any) => {
          filters[column] = { $gt: value };
          return chain;
        },
        lt: (column: string, value: any) => {
          filters[column] = { $lt: value };
          return chain;
        },
        is: (column: string, value: any) => {
          filters[column] = { $eq: value };
          return chain;
        },
        not: (column: string, operator: string, value: any) => {
          filters[column] = { [`$not${operator}`]: value };
          return chain;
        },
        in: (column: string, values: any[]) => {
          filters[column] = { $in: values };
          return chain;
        },
        ilike: (column: string, value: string) => {
          filters[column] = { $ilike: value };
          return chain;
        },
        order: (column: string, options?: { ascending?: boolean }) => {
          orderBy = { column, direction: options?.ascending === false ? 'desc' : 'asc' };
          return chain;
        },
        limit: (n: number) => {
          limitNum = n;
          return chain;
        },
        single: async () => {
          const result = await dbFetch('selectOne', table, { filters, columns });
          if (result.error) return { data: null, error: result.error };
          return { data: result.data, error: null };
        },
        maybeSingle: async () => {
          const result = await dbFetch('selectOne', table, { filters, columns });
          if (result.error || !result.data) return { data: null, error: null };
          return { data: result.data, error: null };
        },
        then: async (resolve: (value: any) => any) => {
          const result = await dbFetch('select', table, { filters, columns, orderBy, limit: limitNum });
          if (result.error) return resolve({ data: null, error: result.error });
          return resolve({ data: result.data, error: null });
        },
        // Add data/error properties for compatibility
        get data() {
          return null;
        },
        get error() {
          return null;
        },
      };

      return chain;
    },
    insert: (data: Record<string, any>) => {
      return {
        select: (columns = '*') => ({
          single: async () => {
            const result = await dbFetch('insert', table, { data });
            if (result.error) return { data: null, error: result.error };
            return { data: result.data, error: null };
          },
        }),
        upsert: (data: Record<string, any>) => {
          return {
            select: (columns = '*') => ({
              single: async () => {
                // Upsert: try insert first, if conflict then update
                const result = await dbFetch('insert', table, { data });
                if (result.error) {
                  // If insert fails, try update
                  const updateResult = await dbFetch('update', table, { filters: { id: data.id }, data });
                  if (updateResult.error) return { data: null, error: updateResult.error };
                  return { data: updateResult.data, error: null };
                }
                return { data: result.data, error: null };
              },
            }),
          };
        },
      };
    },
    update: (data: Record<string, any>) => {
      return {
        eq: (column: string, value: any) => {
          return {
            select: (columns = '*') => ({
              single: async () => {
                const result = await dbFetch('update', table, { filters: { [column]: value }, data });
                if (result.error) return { data: null, error: result.error };
                return { data: result.data, error: null };
              },
            }),
          };
        },
      };
    },
    delete: () => ({
      eq: (column: string, value: any) => {
        return {
          then: async (resolve: (value: any) => any) => {
            const result = await dbFetch('delete', table, { filters: { [column]: value } });
            if (result.error) return resolve({ data: null, error: result.error });
            return resolve({ data: result.data, error: null });
          },
        };
      },
      in: (column: string, values: any[]) => {
        return {
          then: async (resolve: (value: any) => any) => {
            const result = await dbFetch('delete', table, { filters: { [column]: { $in: values } } });
            if (result.error) return resolve({ data: null, error: result.error });
            return resolve({ data: result.data, error: null });
          },
        };
      },
    }),
    rpc: (functionName: string, params?: { body: any }) => {
      return {
        then: async (resolve: (value: any) => any) => {
          if (functionName === 'close_check') {
            // Use our dedicated close_check endpoint
            try {
              const res = await fetch('/api/checks/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params?.body),
              });
              const json = await res.json();
              if (!res.ok || json.error) return resolve({ data: null, error: json.error || 'RPC error' });
              return resolve({ data: json.data, error: null });
            } catch (e) {
              return resolve({ data: null, error: String(e) });
            }
          }
          // Other RPC calls not implemented
          console.warn('[DB] RPC call not implemented:', functionName);
          resolve({ data: null, error: 'RPC not implemented' });
        },
      };
    },
  }),
};

export default supabase;
