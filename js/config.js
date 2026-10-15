/**
 * To-Zoo — deployment settings.
 *
 * Group zoos sync through Supabase. Paste your project's URL and anon
 * (public) key here — both are on Supabase → Project Settings → API. The anon
 * key is designed to be public; access is controlled by the row-level
 * security policies in docs/group-zoo.sql.
 *
 * Left empty, group zoos still work in "local test mode": they sync between
 * tabs of the same browser only, which is enough to try the whole flow.
 */
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
