
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --- PRODUCTION CONFIGURATION ---
// Paste your Supabase URL and Anon Key here for production.
const SUPABASE_URL = 'https://yucbvinxtsbpfmjwncdg.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1Y2J2aW54dHNicGZtanduY2RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNDY0MzQsImV4cCI6MjA3OTcyMjQzNH0.8Tde4LXzkiXyVUSX4ghgMpuGYP3-OJLQaTItbvLqWTY'; 

// Local Storage Keys (Fallback for dev/demo mode)
const LS_URL_KEY = 'os_supabase_url';
const LS_KEY_KEY = 'os_supabase_key';

export const saveSupabaseConfig = (url: string, key: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LS_URL_KEY, url.trim());
    localStorage.setItem(LS_KEY_KEY, key.trim());
  }
};

export const getSupabaseConfig = () => {
  if (typeof window === 'undefined') return { url: '', key: '' };
  
  // Priority 1: File-based Constants (Production)
  if ((SUPABASE_URL as string) && (SUPABASE_KEY as string)) {
    return { url: (SUPABASE_URL as string).trim(), key: (SUPABASE_KEY as string).trim() };
  }

  // Priority 2: Process Env (CI/CD)
  const env = process.env as any;
  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    return { url: (env.SUPABASE_URL as string).trim(), key: (env.SUPABASE_KEY as string).trim() };
  }

  // Priority 3: Local Storage (Dev/Demo)
  const url = localStorage.getItem(LS_URL_KEY) || '';
  const key = localStorage.getItem(LS_KEY_KEY) || '';
  return { url: url.trim(), key: key.trim() };
};

export const isSupabaseConfigured = () => {
  const { url, key } = getSupabaseConfig();
  return !!url && !!key && url !== "https://your-project-id.supabase.co" && !url.includes('placeholder');
};

// Dynamic Client Creator
let clientInstance: SupabaseClient | null = null;
let lastUrl = '';
let lastKey = '';

export const getSupabaseClient = () => {
  const { url, key } = getSupabaseConfig();
  
  if (!url || !key) {
     throw new Error("Supabase Client Error: Missing Credentials");
  }

  if (!clientInstance || url !== lastUrl || key !== lastKey) {
     try {
       clientInstance = createClient(url, key, {
          auth: { persistSession: false }
       });
       lastUrl = url;
       lastKey = key;
     } catch (e: any) {
       console.error("Failed to create Supabase client:", e);
       throw new Error(`Invalid Supabase Configuration: ${e.message}`);
     }
  }

  return clientInstance;
};

export const checkSupabaseConnection = async () => {
  const { url, key } = getSupabaseConfig();
  
  if (!url || !key) {
     return { 
       success: false, 
       message: 'Configuration Missing. Please set SUPABASE_URL/KEY in services/supabase.ts' 
     };
  }

  try {
    const client = getSupabaseClient();
    
    const { data, error, status } = await client
        .from('organizations')
        .select('id')
        .limit(1);
    
    if (error) {
        if (error.code === '42P01') {
           return { success: false, message: 'Connected, but tables are missing. Please run the SQL Schema.' };
        }
        if (error.code === 'PGRST301' || status === 401) {
           return { success: false, message: 'Authentication Failed. Invalid API Key.' };
        }
        if (error.code === '42501') {
           return { success: false, message: 'Permissions Error. Please run the SQL Schema to grant access.' };
        }

        let errorMsg = error.message || error.details || error.hint || JSON.stringify(error);
        return { success: false, message: `Query Error: ${errorMsg} (Code: ${error.code || status})` };
    }
    
    return { success: true, message: 'Connection Successful!' };

  } catch (err: any) {
    return { success: false, message: `Client Exception: ${err.message || String(err)}` };
  }
};
