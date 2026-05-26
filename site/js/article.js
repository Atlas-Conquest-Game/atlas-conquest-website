/**
 * Article page bootstrapper.
 *
 * Article HTML is fully server-rendered by scripts/build_articles.py — there's
 * no client-side Markdown parsing or deck decoding. All this script does is
 * wire up the shared nav-active state and card-hover preview.
 */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof initNavActiveState === 'function') initNavActiveState();
  if (typeof initCardPreview === 'function') initCardPreview();
});
