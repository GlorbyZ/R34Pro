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
}

export interface ListData {
  type: 'list';
  items: ListItem[];
  searchTags: string;
  title: string;
  pagination: PaginationLink[];
}

export interface PaginationLink {
  label: string;
  url: string;
  isCurrent: boolean;
}

export type PageData = PostData | ListData;

/** Build a post view URL from a numeric id and tag context (no DOM link parsing). */
export function buildPostViewUrl(id: number | string, searchTags: string): string {
  return `${RULE34_ORIGIN}/index.php?page=post&s=view&id=${id}&tags=${encodeURIComponent(searchTags || 'all')}`;
}

export function parseRule34Page(doc: Document, searchParams?: URLSearchParams): PageData | null {
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

    // Sequential ID Fallbacks (if sidebar links are missing)
    if (id && !isNaN(parseInt(id))) {
       const numericId = parseInt(id);
       if (!nextUrl) nextUrl = buildPostViewUrl(numericId - 1, searchTags); // Next in list = Older = ID - 1
       if (!prevUrl) prevUrl = buildPostViewUrl(numericId + 1, searchTags); // Prev in list = Newer = ID + 1
    }

    return {
      type: 'post',
      id,
      imageUrl: imageEl?.src ?? (videoEl as HTMLVideoElement)?.poster ?? '',
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

  const thumbContainer = doc.querySelector('.image-list');
  if (thumbContainer) {
    const items: ListItem[] = [];
    thumbContainer.querySelectorAll('span.thumb').forEach((thumb) => {
      const rawId = thumb.id ?? '';
      const id = rawId.replace(/^s/, '');
      if (!id) return;
      const img = thumb.querySelector('img');
      if (!img) return;
      const thumbUrl = img.src;
      const rawTags = img.title || img.alt || '';
      const tags = rawTags.split(/\s+/).filter(Boolean);
      const mediaType = tags.includes('video') ? 'video' : 'image';
      items.push({ id, thumbUrl, tags, mediaType });
    });

    const sp = searchParams ?? new URL(window.location.href).searchParams;
    const searchTags = sp.has('tags') ? sp.get('tags') ?? 'all' : 'all';

    const pagination: PaginationLink[] = [];
    doc.querySelectorAll('.pagination *').forEach(el => {
       const label = el.textContent?.trim() || '';
       if (!label) return;
       
       pagination.push({
          label,
          url: el.tagName === 'A' ? (el as HTMLAnchorElement).getAttribute('href') || '' : '',
          isCurrent: el.tagName === 'B' || el.tagName === 'SPAN' && (el.classList.contains('current') || el.classList.contains('active'))
       });
    });

    return {
      type: 'list',
      items,
      searchTags,
      title: doc.title,
      pagination
    };
  }

  return null;
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
