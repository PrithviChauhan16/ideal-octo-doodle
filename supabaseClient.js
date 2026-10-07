
// supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://atviyxmofjzfverplxvj.supabase.co/';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0dml5eG1vZmp6ZnZlcnBseHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNjYyMTQsImV4cCI6MjEwNTg0MjIxNH0.DLqa7VioaHFftzGDjVN_Uy73FuBxoVUvGBmMb4_g3YM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);