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
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: ''
};
