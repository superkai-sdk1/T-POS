#!/usr/bin/env node
// Export all data from Supabase to JSON files

const SUPABASE_URL = 'https://nazkpapbbedkkglxyows.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hemtwYXBiYmVka2tnbHh5b3dzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg0OTY0NSwiZXhwIjoyMDg5NDI1NjQ1fQ.3N992wTmwdEXc2u-U2T2pP0DpKnqPEcnApJEmgw4Yr0';

const TABLES = [
  'profiles',
  'inventory',
  'checks',
  'check_items',
  'check_payments',
  'transactions',
  'shifts',
  'discounts',
  'events',
  'spaces',
  'bookings',
  'supplies',
  'bonus_history',
  'notifications',
  'app_settings',
  'tg_link_requests'
];

async function fetchTable(tableName) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    console.error(`Error fetching ${tableName}:`, response.status, response.statusText);
    return [];
  }
  
  const data = await response.json();
  console.log(`Exported ${tableName}: ${data.length} rows`);
  return data;
}

async function exportAll() {
  console.log('Starting Supabase export...');
  
  const allData = {};
  
  for (const table of TABLES) {
    allData[table] = await fetchTable(table);
  }
  
  // Write to JSON file
  const fs = await import('fs');
  fs.writeFileSync('./supabase-export.json', JSON.stringify(allData, null, 2));
  console.log('Export complete! Data saved to supabase-export.json');
}

exportAll().catch(console.error);
