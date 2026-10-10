#!/usr/bin/env python3
"""Build the derived insights layer (site/data/insights/) from published data.

Reads site/data/*.json (+ git history of site/data/cards.json on the first
run) and writes ONLY into site/data/insights/ plus the human-review file
scripts/review/changelog_text.json. Never touches the existing site/data/*.json.

Deterministic and idempotent: "now" is --as-of, which defaults to
metadata.json's last_updated; files are rewritten only when their bytes change.
All files are computed before any is written, so a failure leaves the previous
insights in place. Exit codes: 0 ok, 2 refused to start an empty card changelog
(state + history missing; see --allow-fresh-baseline), 1 any other error. In
GitHub Actions failures are also printed as ::error:: annotations (the CI step
is continue-on-error so the daily data commit never waits on this script).

Usage:
    python scripts/build_insights.py                  # normal run (CI)
    python scripts/build_insights.py --report         # + print a sanity report
    python scripts/build_insights.py --rebuild-changelog   # re-walk git history
    python scripts/build_insights.py --data-dir /tmp/x --out-dir /tmp/x/insights

See docs/DATA_MODEL.md ("Insights layer") for every file's contract.
"""

import argparse
import os
import sys
import traceback
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from insights.build import build_all, format_report  # noqa: E402
from insights.card_changelog import FreshBaselineError  # noqa: E402
from insights.common import (  # noqa: E402
    DEFAULT_DATA_DIR, DEFAULT_REVIEW_DIR, PROJECT_DIR,
)


def _annotate(msg):
    """Surface a failure in the GitHub Actions run summary."""
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print("::error title=Build insights::" + msg.replace("\n", " "))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR),
                    help="published data directory (default: site/data)")
    ap.add_argument("--out-dir", default=None,
                    help="output directory (default: <data-dir>/insights)")
    ap.add_argument("--review-dir", default=str(DEFAULT_REVIEW_DIR),
                    help="where unpublished changelog rows go (default: scripts/review)")
    ap.add_argument("--repo-dir", default=str(PROJECT_DIR),
                    help="git repository holding site/data/cards.json history")
    ap.add_argument("--as-of", default=None,
                    help="ISO timestamp treated as 'now' (default: metadata.json last_updated)")
    ap.add_argument("--rebuild-changelog", action="store_true",
                    help="ignore the stored changelog state and backfill from git history "
                         "(needs a full clone)")
    ap.add_argument("--no-git", action="store_true",
                    help="never call git (needs the stored changelog state, or --allow-fresh-baseline)")
    ap.add_argument("--allow-fresh-baseline", action="store_true",
                    help="if the changelog state and git history are both unavailable, start an "
                         "empty changelog instead of exiting with code 2")
    ap.add_argument("--report", action="store_true", help="print a sanity report")
    args = ap.parse_args(argv)

    data_dir = Path(args.data_dir).resolve()
    out_dir = Path(args.out_dir).resolve() if args.out_dir else data_dir / "insights"
    try:
        res = build_all(data_dir, out_dir, Path(args.review_dir).resolve(),
                        Path(args.repo_dir).resolve(), as_of=args.as_of,
                        rebuild_changelog=args.rebuild_changelog, use_git=not args.no_git,
                        allow_fresh_baseline=args.allow_fresh_baseline)
    except FreshBaselineError as e:
        _annotate(f"build_insights: {e}")
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
    except Exception as e:  # noqa: BLE001 — report, keep the old insights, fail the step
        _annotate(f"build_insights failed ({type(e).__name__}: {e}); previous insights kept")
        traceback.print_exc()
        return 1
    if args.report:
        print(format_report(res))
    else:
        total = sum(res["written"].values())
        print(f"Insights as of {res['as_of']}: {len(res['written'])} files, {total / 1024:.0f} KB "
              f"-> {out_dir} (changelog: {res['changelog_mode']}, "
              f"{len(res['changelog']['entries'])} entries; {len(res['pulse']['items'])} pulse items)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
