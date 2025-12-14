// Supabase client bootstrap for browser
// Note: anon key is safe for client use; enforce access via RLS.
const SUPABASE_URL = "https://hnkzpkcmevnfrnsgwawx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhua3pwa2NtZXZuZnJuc2d3YXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MDMzODQsImV4cCI6MjA4MTI3OTM4NH0.6MDul4wDMjBrBj_HyTwwQhQDOHs-FIXNmlZrgoJGedc";
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


