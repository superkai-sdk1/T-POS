const { Client } = require('pg');

const PROJECT_REF = 'dscadajjthbcrullhwtx';

const MIGRATIONS = `
-- ═══════════════════════════════════════
-- Incremental migration v1.1.0
-- All statements are idempotent (safe to re-run)
-- ═══════════════════════════════════════

-- Modifiers
CREATE TABLE IF NOT EXISTS modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  modifier_id uuid NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
  UNIQUE(product_id, modifier_id)
);

CREATE TABLE IF NOT EXISTS check_item_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_item_id uuid NOT NULL REFERENCES check_items(id) ON DELETE CASCADE,
  modifier_id uuid NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
  price_at_time numeric NOT NULL DEFAULT 0
);

-- Bonus history
CREATE TABLE IF NOT EXISTS bonus_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Certificates
CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  nominal numeric NOT NULL,
  balance numeric NOT NULL,
  is_used boolean NOT NULL DEFAULT false,
  used_by uuid REFERENCES profiles(id),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Operating Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('rent', 'utilities', 'salary', 'other')),
  amount numeric NOT NULL,
  description text,
  expense_date date NOT NULL DEFAULT current_date,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bonus_history_profile ON bonus_history(profile_id);
CREATE INDEX IF NOT EXISTS idx_certificates_code ON certificates(code);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_product_modifiers_product ON product_modifiers(product_id);
CREATE INDEX IF NOT EXISTS idx_check_item_modifiers_ci ON check_item_modifiers(check_item_id);

-- Soft delete column for profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT null;

-- RLS policies (use DO block to skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'modifiers' AND policyname = 'modifiers_all') THEN
    ALTER TABLE modifiers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "modifiers_all" ON modifiers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_modifiers' AND policyname = 'product_modifiers_all') THEN
    ALTER TABLE product_modifiers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "product_modifiers_all" ON product_modifiers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'check_item_modifiers' AND policyname = 'check_item_modifiers_all') THEN
    ALTER TABLE check_item_modifiers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "check_item_modifiers_all" ON check_item_modifiers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_history' AND policyname = 'bonus_history_all') THEN
    ALTER TABLE bonus_history ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "bonus_history_all" ON bonus_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'certificates' AND policyname = 'certificates_all') THEN
    ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "certificates_all" ON certificates FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'expenses_all') THEN
    ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "expenses_all" ON expenses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Realtime (safe: ADD TABLE is idempotent in recent PG)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE modifiers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE modifiers REPLICA IDENTITY FULL;
ALTER TABLE expenses REPLICA IDENTITY FULL;

-- Search tags for client profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS search_tags text[] NOT NULL DEFAULT '{}';

-- Certificate tracking on checks
ALTER TABLE checks ADD COLUMN IF NOT EXISTS certificate_used numeric NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE checks ADD COLUMN certificate_id uuid REFERENCES certificates(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
`;

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: node scripts/apply-update.cjs <db-password>');
    console.error('');
    console.error('Find your DB password in Supabase Dashboard:');
    console.error('  Project Settings → Database → Connection string → Password');
    process.exit(1);
  }

  const dns = require('dns');
  dns.setDefaultResultOrder('ipv4first');

  const connectionString = `postgresql://postgres.${PROJECT_REF}:${password}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    console.log('Connecting to Supabase...');
    await client.connect();
    console.log('Connected!\n');

    console.log('Applying incremental migrations...');
    await client.query(MIGRATIONS);
    console.log('Done!\n');

    const tables = ['modifiers', 'product_modifiers', 'check_item_modifiers', 'bonus_history', 'certificates', 'expenses'];
    for (const t of tables) {
      const { rows } = await client.query(`SELECT count(*) as cnt FROM ${t}`);
      console.log(`  ✓ ${t}: ${rows[0].cnt} rows`);
    }

    const { rows: delCol } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'profiles' AND column_name = 'deleted_at'
    `);
    console.log(`  ✓ profiles.deleted_at: ${delCol.length > 0 ? 'exists' : 'MISSING'}`);

    console.log('\nAll migrations applied successfully!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
