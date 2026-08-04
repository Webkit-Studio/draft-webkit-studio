/* Webkit.Studio – konfigurace Supabase pro klientské prostředí.
 *
 * Hodnoty z projektu draft-webkit-studio (Dashboard → Project Settings → API):
 *   SUPABASE_URL      – Project URL (https://<ref>.supabase.co)
 *   SUPABASE_ANON_KEY – anon public klíč (je veřejný, do repa patří;
 *                       service_role klíč sem NIKDY)
 *
 * Načítá se synchronně v <head> před gate.js a čtou ji gate.js i comments.js.
 */
window.DRAFT_CONFIG = {
  SUPABASE_URL: 'https://tvfwmbixmubklywwzzwq.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2ZndtYml4bXVia2x5d3d6endxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NjI0MDYsImV4cCI6MjEwMTQzODQwNn0.NGoIo17GB9ZS_qvMdWWaiHhac0PHH8JV0kzp1q0wTEU'
};
