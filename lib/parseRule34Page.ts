/** Types + DOM parsing for rule34.xxx post and list pages. */

export const RULE34_ORIGIN = 'https://rule34.xxx';

export interface TagData {
  category: string;
  name: string;
}

export interface PostData {
  type: 'post';
  id: string;
  imageUrl: string;
  highresUrl: string;
  tags: TagData[];
  title: string;
  searchTags: string;
  sourceUrl: string;
  mediaType: 'image' | 'video';
  nextUrl?: string;
  prevUrl?: string;
}

export interface ListItem {
  id: string;
  thumbUrl: string;
  tags: string[];
  mediaType: 'image' | 'video';
  removeFavoriteUrl?: string;
}

export interface ListData {
  type: 'list';
  items: ListItem[];
  searchTags: string;
  title: string;
  pagination: PaginationLink[];
  listKind: 'search' | 'favorites';
  favoritesUserId?: string;
  listTitle?: string;
}

export interface PaginationLink {
  label: string;
  url: string;
  isCurrent: boolean;
}

export interface AccountNavLink {
  label: string;
  href: string;
  description?: string;
}

export interface AccountStat {
  label: string;
  value: string;
  href?: string;
}

export interface AccountProfile {
  username: string;
  stats: AccountStat[];
  recentFavorites: ListItem[];
  recentUploads: ListItem[];
  mailUrl?: string;
  favoritesUrl?: string;
  postsUrl?: string;
}

export interface AccountData {
  type: 'account';
  variant: 'home' | 'login' | 'profile' | 'register' | 'options' | 'other';
  isLoggedIn: boolean;
  userId?: string;
  links: AccountNavLink[];
  title: string;
  profile?: AccountProfile;
  bodyHtml?: string;
}

export type PageData = PostData | ListData | AccountData;

/** Build a post view URL from a numeric id and tag context (no DOM link parsing). */
export function buildPostViewUrl(id: number | string, searchTags: string): string {
  return `${RULE34_ORIGIN}/index.php?page=post&s=view&id=${id}&tags=${encodeURIComponent(searchTags || 'all')}`;
}

export function parseRule34Page(doc: Document, searchParams?: URLSearchParams): PageData | null {
  const sp = searchParams ?? new URL(window.location.href).searchParams;
  const pageParam = sp.get('page') ?? '';

  if (pageParam === 'account') {
    const account = parseAccountPage(doc, sp);
    if (account) return account;
  }

  const imageEl = doc.querySelector('#image') as HTMLImageElement | null;
  const videoEl =
    (doc.querySelector('#gelcomVideoPlayer video') as HTMLVideoElement | null) ||
    (doc.querySelector('#gelcomVideoPlayer') as HTMLElement | null);

  if (imageEl || videoEl) {
    const mediaType = videoEl ? 'video' : 'image';

    const statsText = doc.querySelector('#stats ul')?.textContent ?? '';
    const idMatch = statsText.match(/Id:\s*(\d+)/i);
    let id = idMatch ? idMatch[1] : '';

    if (!id) {
      id = doc.title.match(/Id:\s*(\d+)/i)?.[1] ?? doc.title.match(/\|\s*(\d+)/)?.[1] ?? '';
    }

    if (!id) {
       const canonical = doc.querySelector('link[rel="canonical"]') as HTMLLinkElement;
       if (canonical) {
          const m = canonical.href.match(/[?&]id=(\d+)/);
          if (m) id = m[1];
       }
    }

    if (!id && searchParams) {
       id = searchParams.get('id') || '';
    }

    const scripts = Array.from(doc.querySelectorAll('script'));
    if (!id) {
      for (const s of scripts) {
        const m = s.textContent?.match(/var\s+id\s*=\s*["'](\d+)["']/);
        if (m) {
          id = m[1];
          break;
        }
      }
    }

    let highresUrl = '';
    const originalLink = doc.querySelector('a[style*="font-weight: bold"]') as HTMLAnchorElement | null;
    if (originalLink?.textContent?.includes('Original image')) {
      highresUrl = originalLink.href;
    }

    if (!highresUrl && videoEl) {
      const source = videoEl.querySelector('source') as HTMLSourceElement | null;
      highresUrl =
        source?.getAttribute('src') ??
        (videoEl as HTMLVideoElement).currentSrc ??
        (videoEl as HTMLVideoElement).src ??
        '';
    }

    if (!highresUrl && imageEl) highresUrl = imageEl.src;

    if (highresUrl) {
      highresUrl = toAbsoluteRule34Url(highresUrl) ?? highresUrl;
    }

    const tags: TagData[] = [];
    doc.querySelectorAll('#tag-sidebar li').forEach((li) => {
      const typeClass = Array.from(li.classList).find((c) => c.startsWith('tag-type-'));
      const category = typeClass ? typeClass.replace('tag-type-', '') : 'general';
      const name = li.querySelector('a:not([href*="wiki"])')?.textContent?.trim() ?? '';
      if (name) tags.push({ category, name });
    });

    const sourceUrl = (doc.querySelector('#stats ul li:nth-child(4) a') as HTMLAnchorElement | null)?.href ?? '';

    let searchTags = 'all';
    if (searchParams?.has('tags')) {
      searchTags = searchParams.get('tags') ?? 'all';
    } else {
      for (const s of scripts) {
        const m = s.textContent?.match(/var\s+searchTags\s*=\s*["']([^"']*)["']/);
        if (m) {
          searchTags = m[1];
          break;
        }
      }
    }

    const sidebarLinks = Array.from(doc.querySelectorAll('.sidebar a'));
    const nextEl = doc.getElementById('next_search_link') || 
                   doc.querySelector('a#next_search_link') ||
                   sidebarLinks.find(a => a.textContent?.toLowerCase().includes('next'));
    const prevEl = doc.getElementById('prev_search_link') || 
                   doc.querySelector('a#prev_search_link') ||
                   sidebarLinks.find(a => a.textContent?.toLowerCase().includes('previous'));
                   
    const nextRaw = nextEl ? nextEl.getAttribute('href') : undefined;
    const prevRaw = prevEl ? prevEl.getAttribute('href') : undefined;
                   
    let nextUrl = (nextRaw && nextRaw !== '#') ? nextRaw : undefined;
    let prevUrl = (prevRaw && prevRaw !== '#') ? prevRaw : undefined;

    // No predictive fallbacks. We strictly use DOM links or ID cache neighbors via the content script.

    return {
      type: 'post',
      id,
      imageUrl: (() => {
        const raw = imageEl?.src ?? (videoEl as HTMLVideoElement)?.poster ?? '';
        return raw ? (toAbsoluteRule34Url(raw) ?? raw) : '';
      })(),
      highresUrl,
      tags,
      title: doc.title,
      searchTags,
      sourceUrl,
      mediaType,
      nextUrl,
      prevUrl
    };
  }

  const listRoot = findListRoot(doc);
  if (listRoot) {
    const items: ListItem[] = [];
    const thumbs =
      listRoot === doc.body
        ? doc.querySelectorAll('span.thumb')
        : listRoot.querySelectorAll('span.thumb');
    thumbs.forEach((thumb) => {
      const item = parseListThumb(thumb);
      if (item) items.push(item);
    });

    const isFavorites = pageParam === 'favorites' && sp.get('s') === 'view';
    const favoritesUserId = isFavorites ? sp.get('id') ?? undefined : undefined;
    const searchTags = sp.has('tags') ? sp.get('tags') ?? 'all' : 'all';
    const pagination = parsePagination(doc);

    return {
      type: 'list',
      items,
      searchTags,
      title: doc.title,
      pagination,
      listKind: isFavorites ? 'favorites' : 'search',
      favoritesUserId,
      listTitle: isFavorites ? 'My Favorites' : undefined,
    };
  }

  return null;
}

function findListRoot(doc: Document): Element | null {
  const direct =
    doc.querySelector('.image-list') ??
    doc.querySelector('#post-list') ??
    doc.querySelector('#content .image-list');
  if (direct) return direct;

  const isListPage = doc.querySelector('#post-list, .pagination, #paginator') != null;
  if (isListPage && doc.querySelectorAll('span.thumb').length > 0) {
    return doc.body;
  }

  return null;
}

function parseListThumb(thumb: Element): ListItem | null {
  const link =
    (thumb.querySelector('a[id^="p"], a[id^="s"]') as HTMLAnchorElement | null) ??
    (thumb.querySelector('a') as HTMLAnchorElement | null);
  if (!link) return null;

  let id = link.id?.replace(/^[sp]/, '') ?? '';
  if (!id) {
    const href = link.getAttribute('href') ?? '';
    id = href.match(/[?&]id=(\d+)/)?.[1] ?? '';
  }
  if (!id) return null;

  const img = thumb.querySelector('img');
  if (!img) return null;

  const thumbUrl = img.src;
  const rawTags = img.title || img.alt || '';
  const tags = rawTags.split(/\s+/).filter(Boolean);
  const mediaType = tags.includes('video') ? 'video' : 'image';

  const outer = thumb.parentElement;
  const removeAnchor = outer?.querySelector(
    'a[href*="s=delete"], a[onclick*="s=delete"]'
  ) as HTMLAnchorElement | null;
  let removeFavoriteUrl: string | undefined;
  if (removeAnchor) {
    const onclick = removeAnchor.getAttribute('onclick') ?? '';
    const hrefMatch =
      removeAnchor.getAttribute('href')?.match(/index\.php[^'"]+/) ??
      onclick.match(/index\.php[^'"]+/);
    if (hrefMatch) {
      removeFavoriteUrl = toAbsoluteRule34Url(hrefMatch[0]) ?? undefined;
    } else {
      removeFavoriteUrl = `${RULE34_ORIGIN}/index.php?page=favorites&s=delete&id=${id}&return_pid=0`;
    }
  }

  return { id, thumbUrl, tags, mediaType, removeFavoriteUrl };
}

function parsePagination(doc: Document): PaginationLink[] {
  const pagination: PaginationLink[] = [];
  const roots = doc.querySelectorAll('.pagination, #paginator');
  roots.forEach((root) => {
    root.querySelectorAll('a, b, span, strong').forEach((el) => {
      const label = el.textContent?.trim() || '';
      if (!label) return;
      pagination.push({
        label,
        url: el.tagName === 'A' ? (el as HTMLAnchorElement).getAttribute('href') || '' : '',
        isCurrent:
          el.tagName === 'B' ||
          (el.tagName === 'SPAN' &&
            (el.classList.contains('current') || el.classList.contains('active'))),
      });
    });
  });
  return pagination;
}

function parseAccountPage(doc: Document, sp: URLSearchParams): AccountData | null {
  const variantRaw = sp.get('s') ?? 'home';
  const variant = (
    ['home', 'login', 'profile', 'register', 'reg', 'options'].includes(variantRaw)
      ? variantRaw === 'reg'
        ? 'register'
        : variantRaw
      : 'other'
  ) as AccountData['variant'];

  const userLogin = doc.querySelector('#user-login');
  if (userLogin || variant === 'login') {
    return {
      type: 'account',
      variant: 'login',
      isLoggedIn: false,
      links: [
        {
          label: 'Sign Up',
          href: `${RULE34_ORIGIN}/index.php?page=account&s=reg`,
          description: 'Create a new account (no email required).',
        },
      ],
      title: doc.title,
    };
  }

  const userIndex = doc.querySelector('#user-index');
  const content = doc.querySelector('#content');
  const profileFromContent = content ? parseAccountProfileFromContent(content) : undefined;

  if (userIndex) {
    const heading = userIndex.querySelector('h2')?.textContent?.trim() ?? '';
    const isLoggedIn = !/not logged in/i.test(heading);
    const links = extractAccountLinksFromDom(userIndex);
    if (content) links.push(...extractAccountLinksFromDom(content).filter((l) => !links.some((x) => x.href === l.href)));

    let userId: string | undefined;
    const favoritesLink = links.find((l) => l.href.includes('page=favorites'));
    if (favoritesLink) {
      try {
        userId = new URL(favoritesLink.href, RULE34_ORIGIN).searchParams.get('id') ?? undefined;
      } catch {
        userId = undefined;
      }
    }
    if (!userId && profileFromContent?.favoritesUrl) {
      try {
        userId = new URL(profileFromContent.favoritesUrl, RULE34_ORIGIN).searchParams.get('id') ?? undefined;
      } catch {
        userId = undefined;
      }
    }

    return {
      type: 'account',
      variant: 'home',
      isLoggedIn: isLoggedIn || !!profileFromContent,
      userId: userId ?? profileFromContent?.userId,
      links,
      title: doc.title,
      profile: profileFromContent,
    };
  }

  if (content && pageParamIsAccount(sp)) {
    const links = extractAccountLinksFromDom(content);
    let userId: string | undefined;
    if (profileFromContent?.userId) userId = profileFromContent.userId;
    else if (profileFromContent?.favoritesUrl) {
      try {
        userId = new URL(profileFromContent.favoritesUrl, RULE34_ORIGIN).searchParams.get('id') ?? undefined;
      } catch {
        userId = undefined;
      }
    }

    return {
      type: 'account',
      variant: profileFromContent ? (variant === 'home' || variant === 'profile' ? variant : 'profile') : variant,
      isLoggedIn: !!profileFromContent || !doc.body.textContent?.includes('You are not logged in'),
      userId,
      links,
      title: doc.title,
      profile: profileFromContent,
      bodyHtml: profileFromContent ? undefined : content.innerHTML,
    };
  }

  return null;
}

function parseAccountProfileFromContent(content: Element): (AccountProfile & { userId?: string }) | undefined {
  const heading = content.querySelector(':scope > h2, h2')?.textContent?.trim() ?? '';
  if (!heading || /not logged in/i.test(heading)) return undefined;

  const stats: AccountStat[] = [];
  let mailUrl: string | undefined;
  let favoritesUrl: string | undefined;
  let postsUrl: string | undefined;
  let userId: string | undefined;

  content.querySelectorAll('table.highlightable tr').forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return;

    const label = (cells[0].querySelector('strong')?.textContent ?? cells[0].textContent ?? '')
      .trim()
      .replace(/:$/, '');
    if (!label) return;

    const valueCell = cells[cells.length - 1];
    const anchor = valueCell.querySelector('a') as HTMLAnchorElement | null;
    const value = (anchor?.textContent ?? valueCell.textContent ?? '').trim();
    const href = anchor ? toAbsoluteRule34Url(anchor.getAttribute('href') ?? '') ?? undefined : undefined;

    stats.push({ label, value, href });

    if (/contact|mail/i.test(label) && href) mailUrl = href;
    if (/^favorites$/i.test(label) && href) {
      favoritesUrl = href;
      try {
        userId = new URL(href, RULE34_ORIGIN).searchParams.get('id') ?? undefined;
      } catch {
        userId = undefined;
      }
    }
    if (/^posts$/i.test(label) && href) postsUrl = href;
  });

  if (stats.length === 0) return undefined;

  const recentFavorites = parseImageListSection(content, 'Recent Favorites');
  const recentUploads = parseImageListSection(content, 'Recent Uploads');

  return {
    username: heading,
    stats,
    recentFavorites,
    recentUploads,
    mailUrl,
    favoritesUrl,
    postsUrl,
    userId,
  };
}

function parseImageListSection(root: Element, sectionTitle: string): ListItem[] {
  const items: ListItem[] = [];
  const headings = Array.from(root.querySelectorAll('h4'));
  const heading = headings.find((h) => h.textContent?.trim().toLowerCase().includes(sectionTitle.toLowerCase()));
  if (!heading) return items;

  const listRoot =
    heading.parentElement?.querySelector('.image-list') ??
    heading.nextElementSibling?.querySelector('.image-list') ??
    heading.nextElementSibling;

  if (!listRoot) return items;
  listRoot.querySelectorAll('span.thumb').forEach((thumb) => {
    const item = parseListThumb(thumb);
    if (item) items.push(item);
  });
  return items;
}

function pageParamIsAccount(sp: URLSearchParams): boolean {
  return sp.get('page') === 'account';
}

function extractAccountLinksFromDom(root: ParentNode): AccountNavLink[] {
  const links: AccountNavLink[] = [];
  root.querySelectorAll('h4 a, h1 a').forEach((anchor) => {
    const el = anchor as HTMLAnchorElement;
    const hrefRaw = el.getAttribute('href') ?? '';
    if (!hrefRaw || hrefRaw === '#') return;
    const href = toAbsoluteRule34Url(hrefRaw) ?? '';
    if (!href) return;

    const label = el.textContent?.replace(/^[»\s]+/, '').trim() ?? '';
    if (!label) return;

    const inHeading = el.closest('h4, h1');
    const paragraph = inHeading?.nextElementSibling;
    const description =
      paragraph?.tagName === 'P' ? paragraph.textContent?.trim() : undefined;

    if (links.some((l) => l.href === href)) return;
    links.push({ label, href, description });
  });
  return links;
}

export function toAbsoluteRule34Url(href: string): string | null {
  const t = href.trim();
  if (!t || t === '#' || t.toLowerCase().startsWith('javascript:')) return null;
  try {
    return new URL(t, RULE34_ORIGIN).href;
  } catch {
    return null;
  }
}
