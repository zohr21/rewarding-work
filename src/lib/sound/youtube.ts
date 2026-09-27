/**
 * YouTube links → privacy-enhanced embed URLs (youtube-nocookie.com).
 *
 * YouTube's terms don't allow hiding the player to play audio only, so the video
 * always shows in a small player (at least 200 × 200 px, their minimum).
 */

export interface YouTubeRef {
  /** Video id, if the link points at one. */
  video?: string;
  /** Playlist id, if any. */
  list?: string;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{10,64}$/;

export function parseYouTube(input: string): YouTubeRef | null {
  const text = input.trim();
  if (!text) return null;
  if (VIDEO_ID.test(text)) return { video: text };

  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const list = u.searchParams.get('list') ?? undefined;
  const ref: YouTubeRef = {};
  if (list && LIST_ID.test(list)) ref.list = list;

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0] ?? '';
    if (VIDEO_ID.test(id)) ref.video = id;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    const [, kind, id] = u.pathname.split('/');
    if (v && VIDEO_ID.test(v)) ref.video = v;
    else if (kind && ['embed', 'shorts', 'live', 'v'].includes(kind) && id && VIDEO_ID.test(id)) ref.video = id;
  } else return null;

  return ref.video || ref.list ? ref : null;
}

export function embedUrl(ref: YouTubeRef, origin: string): string {
  const params = new URLSearchParams({
    autoplay: '1',
    playsinline: '1',
    rel: '0',
    enablejsapi: '1',
    origin,
  });
  if (ref.list) params.set('list', ref.list);
  if (ref.video && !ref.list) {
    // Loop a single video (YouTube needs the id repeated as a one-item playlist).
    params.set('loop', '1');
    params.set('playlist', ref.video);
  }
  const path = ref.video ?? 'videoseries';
  return `https://www.youtube-nocookie.com/embed/${path}?${params}`;
}
