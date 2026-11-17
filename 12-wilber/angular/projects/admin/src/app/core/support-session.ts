import { environment } from '../../environments/environment';

const KEY = 'glint.session';

/**
 * The platform console's "Open admin" lands on `<adminUrl>#support=<token>`: a short-lived support login for this
 * tenant. Runs before bootstrap so guards see the session. The token is removed from the URL straight away and is
 * never refreshed (the API rejects refresh for support sessions); it simply expires.
 */
export async function consumeSupportFragment(): Promise<void> {
  const token = new URLSearchParams(location.hash.slice(1)).get('support');
  if (!token) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const res = await fetch(`${environment.apiUrl}/v1/admin/me`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Tenant': environment.tenant }
    });
    if (!res.ok) throw new Error(`support session rejected (${res.status})`);
    const user = await res.json();
    localStorage.setItem(KEY, JSON.stringify({ token, expiresAt: payload.exp, user }));
  } catch (err) {
    console.error('Could not open the support session', err);
  }
}
