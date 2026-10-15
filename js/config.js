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
export const SUPABASE_URL = 'https://tmzvmsycvihorrogxegy.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtenZtc3ljdmlob3Jyb2d4ZWd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwOTkxNjksImV4cCI6MjEwNzY3NTE2OX0.6SiWChGhOtnTd5r3FxUirwhoQMr_WHfPRzToZEpDsBA';
