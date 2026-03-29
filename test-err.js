import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { error: insertErr } = await supabase.from('profiles').insert({
    nickname: 'Test Tablet 2',
    role: 'tablet',
    is_resident: false
  });
  console.log("Insert Error:", insertErr);

  const { error } = await supabase.from('profiles').select('*, linked_space:spaces!profiles_linked_space_id_fkey(id, name)').limit(1);
  console.log("Fetch Error spaces!profiles_linked_space_id_fkey:", error);
  
  const { error: err2 } = await supabase.from('profiles').select('*, linked_space_id(id, name)').limit(1);
  console.log("Fetch Error linked_space_id(id, name):", err2);

  const { error: err3 } = await supabase.from('profiles').select('*, linked_space:spaces(id, name)').limit(1);
  console.log("Fetch Error linked_space:spaces(id, name):", err3);
}
run();
