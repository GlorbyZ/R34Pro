import { RULE34_ORIGIN, toAbsoluteRule34Url } from './parseRule34Page';

export interface AccountSession {
  isLoggedIn: boolean;
  userId?: string;
  username?: string;
  favoritesUrl?: string;
  profileUrl?: string;
  mailUrl?: string;
  logoutUrl?: string;
}

export interface AccountNavLink {
  label: string;
  href: string;
  description?: string;
}

const ACCOUNT_HOME_URL = `${RULE34_ORIGIN}/index.php?page=account&s=home`;
const LOGIN_URL = `${RULE34_ORIGIN}/index.php?page=account&s=login&code=00`;

/** Parse session info from an account home (or similar) HTML document. */
export function parseAccountSessionFromDoc(doc: Document): AccountSession {
  const userIndex = doc.querySelector('#user-index');
  if (!userIndex) {
    return { isLoggedIn: false };
  }

  const heading = userIndex.querySelector('h2')?.textContent?.trim() ?? '';
  if (/not logged in/i.test(heading)) {
    return { isLoggedIn: false };
  }

  const links = extractAccountLinks(userIndex);
  const favoritesLink = links.find((l) => /favorites.*view/i.test(l.href));
  const profileLink = links.find((l) => /account.*profile/i.test(l.href));
  const mailLink = links.find((l) => /gmail/i.test(l.href));
  const logoutLink = links.find((l) => /login.*code=01/i.test(l.href) || /logout/i.test(l.label));

  let userId: string | undefined;
  if (favoritesLink) {
    try {
      userId = new URL(favoritesLink.href, RULE34_ORIGIN).searchParams.get('id') ?? undefined;
    } catch {
      userId = undefined;
    }
  }

  return {
    isLoggedIn: true,
    userId,
    favoritesUrl: favoritesLink?.href,
    profileUrl: profileLink?.href,
    mailUrl: mailLink?.href,
    logoutUrl: logoutLink?.href ?? `${RULE34_ORIGIN}/index.php?page=account&s=login&code=01`,
  };
}

export function extractAccountLinks(root: ParentNode): AccountNavLink[] {
  const links: AccountNavLink[] = [];
  root.querySelectorAll('h4 a, h1 a').forEach((anchor) => {
    const el = anchor as HTMLAnchorElement;
    const label = el.textContent?.replace(/^[»\s]+/, '').trim() ?? '';
    const href = toAbsoluteRule34Url(el.getAttribute('href') ?? '') ?? '';
    if (!label || !href) return;
    const paragraph = el.closest('h4, h1')?.nextElementSibling;
    const description = paragraph?.tagName === 'P' ? paragraph.textContent?.trim() : undefined;
    links.push({ label, href, description });
  });
  return links;
}

/** Fetch account home with session cookies and parse login state. */
export async function fetchAccountSession(): Promise<AccountSession> {
  try {
    const res = await fetch(ACCOUNT_HOME_URL, { credentials: 'include' });
    if (!res.ok) return { isLoggedIn: false };
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return parseAccountSessionFromDoc(doc);
  } catch {
    return { isLoggedIn: false };
  }
}

export async function loginRule34(
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string; needsCaptcha?: boolean }> {
  const body = new URLSearchParams({
    user: username.trim(),
    pass: password,
    submit: 'Log in',
  });

  try {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    if (doc.querySelector('#user-login')) {
      const captcha = doc.querySelector('.h-captcha, .cf-turnstile, [data-sitekey]');
      if (captcha) {
        return { ok: false, needsCaptcha: true, error: 'Captcha required — use the site login page.' };
      }
      const notice = doc.querySelector('#notice, .notice')?.textContent?.trim();
      return { ok: false, error: notice || 'Invalid username or password.' };
    }

    const session = parseAccountSessionFromDoc(doc);
    if (session.isLoggedIn) return { ok: true };
    return { ok: false, error: 'Login failed. Check your credentials.' };
  } catch {
    return { ok: false, error: 'Network error while logging in.' };
  }
}

export async function addFavorite(postId: string): Promise<boolean> {
  try {
    const url = `${RULE34_ORIGIN}/index.php?page=favorites&s=add&id=${encodeURIComponent(postId)}`;
    const res = await fetch(url, { credentials: 'include', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function removeFavorite(postId: string): Promise<boolean> {
  try {
    const url = `${RULE34_ORIGIN}/index.php?page=favorites&s=delete&id=${encodeURIComponent(postId)}&return_pid=0`;
    const res = await fetch(url, { credentials: 'include', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

export function favoritesViewUrl(userId: string): string {
  return `${RULE34_ORIGIN}/index.php?page=favorites&s=view&id=${encodeURIComponent(userId)}`;
}

export function accountHomeUrl(): string {
  return ACCOUNT_HOME_URL;
}

export function accountLoginUrl(): string {
  return LOGIN_URL;
}

export function accountRegisterUrl(): string {
  return `${RULE34_ORIGIN}/index.php?page=account&s=reg`;
}
