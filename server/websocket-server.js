/**
 * WebSocket сервер для realtime подписок
 * Заменяет Supabase realtime
 */
import { WebSocketServer } from 'ws';
import { query, transaction } from './db/index.js';
import pool from './db/client.js';

let wss = null;
const clients = new Map(); // clientId -> Set of subscriptions

function initWebSocketServer(server) {
  if (wss) return wss;

  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const clientId = generateClientId();
    clients.set(clientId, new Set());
    ws.clientId = clientId;

    console.log(`[WS] Client connected: ${clientId}`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        handleClientMessage(ws, message);
      } catch (e) {
        console.error('[WS] Error parsing message:', e);
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected: ${clientId}`);
      clients.delete(clientId);
    });

    ws.on('error', (e) => {
      console.error(`[WS] Error for client ${clientId}:`, e);
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({ type: 'connected', clientId }));
  });

  return wss;
}

function generateClientId() {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function handleClientMessage(ws, message) {
  const { type, table, filter, clientId } = message;

  switch (type) {
    case 'subscribe':
      handleSubscribe(ws, table, filter);
      break;
    case 'unsubscribe':
      handleUnsubscribe(ws, table);
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    default:
      console.warn('[WS] Unknown message type:', type);
  }
}

function handleSubscribe(ws, table, filter) {
  const subscription = { table, filter, ws };
  ws.subscriptions = ws.subscriptions || new Set();
  ws.subscriptions.add(JSON.stringify(subscription));
  console.log(`[WS] Client ${ws.clientId} subscribed to ${table}`);
}

function handleUnsubscribe(ws, table) {
  if (!ws.subscriptions) return;
  
  ws.subscriptions.forEach((subStr) => {
    const sub = JSON.parse(subStr);
    if (sub.table === table) {
      ws.subscriptions.delete(subStr);
    }
  });
  
  console.log(`[WS] Client ${ws.clientId} unsubscribed from ${table}`);
}

/**
 * Broadcast changes to subscribed clients
 */
async function broadcastChange(table, event, payload) {
  if (!wss) return;

  wss.clients.forEach((client) => {
    if (!client.subscriptions) return;

    client.subscriptions.forEach((subStr) => {
      const sub = JSON.parse(subStr);
      
      if (sub.table === table) {
        // Check filter if present
        if (sub.filter) {
          const matches = checkFilter(payload, sub.filter);
          if (!matches) return;
        }

        client.send(JSON.stringify({
          type: 'change',
          table,
          event,
          payload,
        }));
      }
    });
  });
}

/**
 * Check if payload matches filter
 */
function checkFilter(payload, filter) {
  for (const key in filter) {
    if (payload[key] !== filter[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Setup PostgreSQL LISTEN/NOTIFY for realtime updates
 */
async function setupPostgresNotify() {
  const client = await pool.connect();
  
  client.on('notification', (msg) => {
    try {
      const payload = JSON.parse(msg.payload);
      broadcastChange(payload.table, payload.event, payload.data);
    } catch (e) {
      console.error('[WS] Error processing notification:', e);
    }
  });

  // Listen to all tables
  const tables = [
    'checks', 'check_items', 'check_payments', 'check_discounts',
    'profiles', 'inventory', 'transactions', 'bonuses_history',
    'discounts', 'shifts', 'events', 'bookings',
    'tablet_orders', 'tablet_order_items', 'notifications'
  ];

  for (const table of tables) {
    await client.query(`LISTEN ${table}_changes`);
  }

  console.log('[WS] PostgreSQL LISTEN/NOTIFY setup complete');
}

/**
 * Trigger notification after database change
 * Call this after INSERT/UPDATE/DELETE operations
 */
async function triggerNotify(table, event, data) {
  const client = await pool.connect();
  const payload = JSON.stringify({ table, event, data });
  await client.query(`NOTIFY ${table}_changes, '${payload.replace(/'/g, "''")}'`);
  client.release();
}

export {
  initWebSocketServer,
  broadcastChange,
  triggerNotify,
  setupPostgresNotify,
};
