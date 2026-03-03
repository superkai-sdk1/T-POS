const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'dscadajjthbcrullhwtx';

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: node scripts/run-migration.cjs <db-password>');
    console.error('');
    console.error('Find your DB password in Supabase Dashboard:');
    console.error('  Project Settings → Database → Connection string → Password');
    process.exit(1);
  }

  const dns = require('dns');
  dns.setDefaultResultOrder('ipv4first');

  const connectionString = `postgresql://postgres:${password}@db.${PROJECT_REF}.supabase.co:5432/postgres`;

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    console.log('Connecting to Supabase database...');
    await client.connect();
    console.log('Connected!\n');

    // Drop existing objects
    console.log('Dropping existing tables and types...');
    const dropSQL = `
      DROP TABLE IF EXISTS transactions CASCADE;
      DROP TABLE IF EXISTS check_items CASCADE;
      DROP TABLE IF EXISTS checks CASCADE;
      DROP TABLE IF EXISTS inventory CASCADE;
      DROP TABLE IF EXISTS profiles CASCADE;
      DROP TYPE IF EXISTS user_role CASCADE;
      DROP TYPE IF EXISTS item_category CASCADE;
      DROP TYPE IF EXISTS check_status CASCADE;
      DROP TYPE IF EXISTS payment_method CASCADE;
      DROP TYPE IF EXISTS transaction_type CASCADE;
      DROP FUNCTION IF EXISTS update_updated_at CASCADE;
    `;
    await client.query(dropSQL);
    console.log('Done.\n');

    // Run migration
    console.log('Running migration...');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migration.sql'),
      'utf8'
    );
    await client.query(migrationSQL);
    console.log('Migration completed!\n');

    // Verify
    const { rows: profiles } = await client.query('SELECT count(*) as cnt FROM profiles');
    const { rows: inventory } = await client.query('SELECT count(*) as cnt FROM inventory');
    console.log(`Profiles: ${profiles[0].cnt}`);
    console.log(`Inventory items: ${inventory[0].cnt}`);
    console.log('\nAll done!');

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
