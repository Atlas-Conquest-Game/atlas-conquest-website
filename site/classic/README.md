# Classic site snapshot

Frozen copy of the homepage and analytics pages as they were on production before the
October 2026 refresh (git tag `pre-refresh-2026-10`, commit 629f80c).

- Pages: index.html, analytics.html, commanders.html, cards.html, meta.html, metagame.html, goals.html
- Their original CSS/JS live in `classic/css/` and `classic/js/` (never edit these).
- Each page sets `<base href="../">`, so `data/` and `assets/` resolve to the LIVE site:
  the classic pages always show current data with the original design. If a data file's
  shape or an asset they use is ever removed, the classic page for it may break; regenerate
  from the tag or retire it.
- `noindex`, skipped by scripts/sync_chrome.py (SKIP_DIRS) and by the sitemap.
- Full rollback of the site is `git checkout pre-refresh-2026-10 -- site/` (or revert the refresh commits).
