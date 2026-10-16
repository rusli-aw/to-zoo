/**
 * To-Zoo — who you are, in a group zoo.
 *
 * Your own zoo never needs a name. A shared one does, or every animal is
 * "You's". So the first time a name matters (starting or joining a group
 * zoo, or adding a pet to one) this asks for it.
 *
 * Two ways in:
 *   - Continue with Google, through Supabase Auth, when the Google provider
 *     is switched on in the Supabase project. Your Google name is used.
 *   - As a guest: just type the name your zoo-mates should see.
 *
 * The Google button only appears if the project actually has Google
 * enabled (checked against Supabase's public auth settings), so nobody is
 * offered a sign-in that would fail.
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js';
import { getState, setUser } from '../store.js';
import { openDialog } from './dialog.js';

const PLACEHOLDER_NAMES = new Set(['', 'you']);

export const hasName = () => !PLACEHOLDER_NAMES.has(String(getState().user.name ?? '').trim().toLowerCase());

let googleCheck = null;
/** Is Google sign-in enabled on the Supabase project? Cached. */
function googleEnabled() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return Promise.resolve(false);
  googleCheck ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } })
    .then((r) => r.json())
    .then((s) => Boolean(s?.external?.google))
    .catch(() => false);
  return googleCheck;
}

async function supabaseClient() {
  if (!window.supabase?.createClient) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/supabase.umd.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Back from Google: Supabase puts the session in the URL. Read the name off
 * it, keep it, and tidy the URL. Call once at boot.
 */
export async function finishGoogleSignIn() {
  if (!/access_token=|code=/.test(location.hash + location.search)) return false;
  if (!SUPABASE_URL) return false;
  try {
    const sb = await supabaseClient();
    const { data } = await sb.auth.getSession();
    const user = data?.session?.user;
    if (!user) return false;
    const meta = user.user_metadata ?? {};
    const name = (meta.full_name || meta.name || user.email || '').split(' ')[0];
    if (name) setUser({ name, googleId: user.id });
    history.replaceState(null, '', location.pathname + location.search.replace(/[?&]code=[^&]*/, ''));
    return true;
  } catch (err) {
    console.warn('[to-zoo] Google sign-in did not complete', err);
    return false;
  }
}

/**
 * Make sure we have a name. Resolves true once there is one, false if the
 * person closed the dialog. Google sign-in leaves the page and comes back,
 * so it resolves false here and the name is picked up on return.
 */
export async function ensureName({ reason = 'so your zoo-mates know whose pets are whose' } = {}) {
  if (hasName()) return true;
  const google = await googleEnabled();

  const dialog = openDialog({
    title: 'What should your zoo-mates call you?',
    subtitle: `Just a first name is fine, ${reason}.`,
    body: `
      <form class="name-form" data-name-form>
        ${google ? `
          <button class="btn btn--block google-btn" type="button" data-google>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"/>
              <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/>
              <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z"/>
              <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/>
            </svg>
            Continue with Google
          </button>
          <p class="name-form__or"><span>or as a guest</span></p>` : ''}
        <label class="field">
          <span class="field__label">Your name</span>
          <input class="field__input" type="text" maxlength="24" required
                 placeholder="e.g. Audrey" autocomplete="given-name" data-autofocus data-name-input>
        </label>
        <div class="dialog-actions">
          <button class="btn btn--primary" type="submit">Continue</button>
        </div>
      </form>`,
    setup(panel, close) {
      const form = panel.querySelector('[data-name-form]');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = panel.querySelector('[data-name-input]').value.trim();
        if (!name || PLACEHOLDER_NAMES.has(name.toLowerCase())) return;
        setUser({ name });
        window.dispatchEvent(new CustomEvent('to-zoo:renamed'));
        close(true);
      });
      panel.querySelector('[data-google]')?.addEventListener('click', async () => {
        const sb = await supabaseClient();
        await sb.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: location.origin + location.pathname + location.search },
        });
        close(false);
      });
    },
  });
  return (await dialog.result) === true;
}
