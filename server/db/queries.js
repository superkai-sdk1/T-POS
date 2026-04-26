const db = require('./index');

// Profiles
const profiles = {
  getByNickname: (nickname) => db.selectOne('profiles', { nickname }),
  getByTgId: (tgId) => db.selectOne('profiles', { tg_id: tgId }),
  getById: (id) => db.selectOne('profiles', { id }),
  updateBalance: (id, balance, bonusPoints) => 
    db.update('profiles', { id }, { balance, bonus_points: bonusPoints }),
  updatePin: (id, pin) => db.update('profiles', { id }, { pin }),
  linkTelegram: (id, tgId, tgUsername) => 
    db.update('profiles', { id }, { tg_id: tgId, tg_username: tgUsername }),
  create: (data) => db.insert('profiles', data),
  getAll: () => db.select('profiles'),
  search: (query) => db.query(
    `SELECT * FROM profiles WHERE 
     nickname ILIKE $1 OR 
     phone ILIKE $1 OR 
     search_tags @> $2::text[]
     LIMIT 20`,
    [`%${query}%`, `[${query}]`]
  ),
};

// Inventory
const inventory = {
  getAll: () => db.select('inventory', {}, '*'),
  getById: (id) => db.selectOne('inventory', { id }),
  updateStock: (id, quantity) => db.update('inventory', { id }, { stock_quantity: quantity }),
  create: (data) => db.insert('inventory', data),
  update: (id, data) => db.update('inventory', { id }, data),
  delete: (id) => db.delete('inventory', { id }),
  getByCategory: (category) => db.select('inventory', { category }),
  getActive: () => db.select('inventory', { is_active: true }),
};

// Checks
const checks = {
  getById: (id) => db.selectOne('checks', { id }),
  getOpenByPlayer: (playerId) => db.select('checks', { player_id: playerId, status: 'open' }),
  getOpenByStaff: (staffId) => db.select('checks', { staff_id: staffId, status: 'open' }),
  create: (data) => db.insert('checks', data),
  update: (id, data) => db.update('checks', { id }, data),
  close: async (checkId, payments, bonusUsed, spaceRental, certificateUsed, certificateId) => {
    const result = await db.rpc('close_check', {
      p_check_id: checkId,
      p_payments: JSON.stringify(payments),
      p_bonus_used: bonusUsed,
      p_space_rental: spaceRental,
      p_certificate_used: certificateUsed,
      p_certificate_id: certificateId,
    });
    return result;
  },
  getRecent: (limit = 50) => db.query(
    'SELECT * FROM checks ORDER BY created_at DESC LIMIT $1',
    [limit]
  ),
  getByShift: (shiftId) => db.select('checks', { shift_id: shiftId }),
};

// Check Items
const checkItems = {
  getByCheckId: (checkId) => db.select('check_items', { check_id: checkId }),
  add: (data) => db.insert('check_items', data),
  update: (id, data) => db.update('check_items', { id }, data),
  delete: (id) => db.delete('check_items', { id }),
  deleteByCheckId: (checkId) => db.delete('check_items', { check_id: checkId }),
};

// Check Payments
const checkPayments = {
  getByCheckId: (checkId) => db.select('check_payments', { check_id: checkId }),
  add: (data) => db.insert('check_payments', data),
};

// Transactions
const transactions = {
  create: (data) => db.insert('transactions', data),
  getByPlayerId: (playerId) => db.select('transactions', { player_id: playerId }),
  getRecent: (limit = 100) => db.query(
    'SELECT * FROM transactions ORDER BY created_at DESC LIMIT $1',
    [limit]
  ),
  getByType: (type) => db.select('transactions', { type }),
};

// Shifts
const shifts = {
  getById: (id) => db.selectOne('shifts', { id }),
  getOpen: () => db.selectOne('shifts', { status: 'open' }),
  create: (data) => db.insert('shifts', data),
  close: (id, data) => db.update('shifts', { id }, { ...data, status: 'closed', closed_at: new Date() }),
  getRecent: (limit = 30) => db.query(
    'SELECT * FROM shifts ORDER BY opened_at DESC LIMIT $1',
    [limit]
  ),
};

// Discounts
const discounts = {
  getAll: () => db.select('discounts', {}, '*'),
  getActive: () => db.select('discounts', { is_active: true }),
  getById: (id) => db.selectOne('discounts', { id }),
  create: (data) => db.insert('discounts', data),
  update: (id, data) => db.update('discounts', { id }, data),
};

// Events
const events = {
  getAll: () => db.select('events', {}, '*'),
  getById: (id) => db.selectOne('events', { id }),
  create: (data) => db.insert('events', data),
  update: (id, data) => db.update('events', { id }, data),
  getUpcoming: () => db.query(
    "SELECT * FROM events WHERE date >= CURRENT_DATE ORDER BY date ASC"
  ),
};

// Spaces
const spaces = {
  getAll: () => db.select('spaces', {}, '*'),
  getById: (id) => db.selectOne('spaces', { id }),
  create: (data) => db.insert('spaces', data),
  update: (id, data) => db.update('spaces', { id }, data ),
};

// Bookings
const bookings = {
  getBySpaceId: (spaceId) => db.select('bookings', { space_id: spaceId }),
  create: (data) => db.insert('bookings', data),
  update: (id, data) => db.update('bookings', { id }, data),
  getActive: () => db.select('bookings', { status: 'active' }),
};

// Supplies
const supplies = {
  getAll: () => db.select('supplies', {}, '*'),
  getById: (id) => db.selectOne('supplies', { id }),
  create: (data) => db.insert('supplies', data),
  getRecent: (limit = 20) => db.query(
    'SELECT * FROM supplies ORDER BY created_at DESC LIMIT $1',
    [limit]
  ),
};

// Bonus History
const bonusHistory = {
  getByProfileId: (profileId) => db.select('bonus_history', { profile_id: profileId }),
  create: (data) => db.insert('bonus_history', data),
  getRecent: (limit = 50) => db.query(
    'SELECT * FROM bonus_history ORDER BY created_at DESC LIMIT $1',
    [limit]
  ),
};

// Notifications
const notifications = {
  getAll: () => db.select('notifications', {}, '*'),
  create: (data) => db.insert('notifications', data),
  getRecent: (limit = 20) => db.query(
    'SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1',
    [limit]
  ),
};

// App Settings
const appSettings = {
  get: (key) => db.selectOne('app_settings', { key }),
  set: (key, value) => db.query(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
    [key, value]
  ),
  getAll: () => db.select('app_settings', {}, '*'),
};

// TG Link Requests
const tgLinkRequests = {
  create: (data) => db.insert('tg_link_requests', data),
  getById: (id) => db.selectOne('tg_link_requests', { id }),
  updateStatus: (id, status) => db.update('tg_link_requests', { id }, { status }),
  getByTgId: (tgId) => db.select('tg_link_requests', { tg_id: tgId }),
  getPending: () => db.select('tg_link_requests', { status: 'pending' }),
};

module.exports = {
  profiles,
  inventory,
  checks,
  checkItems,
  checkPayments,
  transactions,
  shifts,
  discounts,
  events,
  spaces,
  bookings,
  supplies,
  bonusHistory,
  notifications,
  appSettings,
  tgLinkRequests,
};
