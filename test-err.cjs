const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { error: insertErr } = await supabase.from('profiles').insert({
    nickname: 'Test Tablet 3',
    role: 'tablet',
    is_resident: false
  });
  console.log("Insert Error:", insertErr);

  const { error } = await supabase.from('profiles').select('*, linked_space:spaces(id, name)').limit(1);
  console.log("Fetch Error linked_space:spaces:", error);
}
run();
