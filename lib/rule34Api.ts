import { RULE34_ORIGIN } from './parseRule34Page';

export interface DapiPost {
  id: number | string;
  file_url: string;
  preview_url?: string;
  sample_url?: string;
  tags?: string;
}

function normalizeMediaUrl(url: string): string {
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

/** Fetch a single post via Rule34 DAPI (much faster than parsing HTML). */
export async function fetchPostById(postId: string): Promise<DapiPost | null> {
  if (!postId || postId === '#') return null;
  try {
    const apiUrl = `${RULE34_ORIGIN}/index.php?page=dapi&s=post&q=index&json=1&id=${encodeURIComponent(postId)}`;
    const res = await fetch(apiUrl, {
      credentials: 'include',
      headers: { Referer: `${RULE34_ORIGIN}/` },
    });
    if (!res.ok) return null;
    const text = await res.text();
    const parsed = JSON.parse(text);
    const post = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!post?.file_url) return null;
    return {
      ...post,
      file_url: normalizeMediaUrl(String(post.file_url)),
      preview_url: post.preview_url ? normalizeMediaUrl(String(post.preview_url)) : undefined,
      sample_url: post.sample_url ? normalizeMediaUrl(String(post.sample_url)) : undefined,
    };
  } catch {
    return null;
  }
}

export function postIdFromViewUrl(url?: string): string | null {
  if (!url || url === '#') return null;
  try {
    return new URL(url, RULE34_ORIGIN).searchParams.get('id');
  } catch {
    return url.match(/[?&]id=(\d+)/)?.[1] ?? null;
  }
}

export function isVideoFileUrl(url: string): boolean {
  return /\.(mp4|webm|mkv)(\?|$)/i.test(url);
}
