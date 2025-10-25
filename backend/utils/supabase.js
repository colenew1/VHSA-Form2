import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const error = new Error('Missing Supabase credentials: SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables');
  console.error(error.message);
  throw error;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
