"""Google Sheets read/write access via desktop OAuth.

Authorizes as you, in a browser, once. The resulting token is cached outside
the repo and refreshed silently on every later run, so scripts can edit a
sheet in place without a service account or any sharing setup.

    pip install -r scripts/requirements-dev.txt
    python scripts/sheets_auth.py --login              # one-time browser consent
    python scripts/sheets_auth.py --check <url>        # read-only probe
    python scripts/sheets_auth.py --verify-write <url> # scratch-tab round trip

From other scripts:

    from sheets_auth import open_sheet

    ws = open_sheet(SHEET_URL).sheet1
    rows = ws.get_all_records()
    ws.update_acell("C1", "Result")

Credentials never live in the repo — see SETUP_HELP below for where they go
and how to mint them.
"""

import argparse
import os
import sys
from pathlib import Path

# ─── Configuration ──────────────────────────────────────────────

# Read+write on spreadsheets addressed by key. Deliberately no Drive scope:
# we always open sheets by URL or key, never by title search, so this grant
# cannot enumerate or touch the rest of the user's Drive.
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# Credentials live outside the working tree so they cannot be committed by
# accident. Override the directory with ATLAS_GOOGLE_DIR if you keep secrets
# somewhere else.
CRED_DIR = Path(os.environ.get("ATLAS_GOOGLE_DIR", Path.home() / ".atlas-conquest"))
CLIENT_SECRET = CRED_DIR / "google_oauth_client.json"
TOKEN = CRED_DIR / "google_token.json"

# Worksheet name used by --verify-write. Created and deleted within the check,
# so it never collides with real data.
SCRATCH_TAB = "_atlas_write_check"

SETUP_HELP = """\
Missing OAuth client secret: {path}

One-time setup in the Google Cloud console (any project will do). The console
now calls this area "Google Auth Platform"; older docs say "APIs & Services >
OAuth consent screen" for the same screens.

  1. https://console.cloud.google.com/projectcreate - create or pick a project.

  2. Enable the API:
     APIs & Services > Library > "Google Sheets API" > Enable.

  3. Configure the consent screen, if the project has no branding yet:
     Google Auth Platform > Branding. Fill in the app name and your own email.
     Under Audience, choose "External".

  4. Set Audience > publishing status to "In production", NOT "Testing".
     In Testing, Google expires the refresh token after 7 days and you have to
     re-run --login every week. In production the token persists. The app stays
     unverified either way, which only means the consent screen shows a warning
     the first time - click "Advanced" then "Go to <app> (unsafe)". That warning
     is expected: the app is yours, it is just not registered for public use.
     (In production you do not need the Test users list at all.)

  5. Create the client:
     Google Auth Platform > Clients > Create client >
     Application type: "Desktop app".

  6. Download its JSON and save it to exactly this path:

       {path}

Then run:  python scripts/sheets_auth.py --login
"""


# ─── Client ─────────────────────────────────────────────────────


def client(force_login=False):
    """Return an authorized gspread client, running the consent flow if needed.

    The first call (or any call after --login --force) opens a browser. Later
    calls reuse the cached token and refresh it in the background.
    """
    import gspread

    if not CLIENT_SECRET.exists():
        sys.exit(SETUP_HELP.format(path=CLIENT_SECRET))

    CRED_DIR.mkdir(parents=True, exist_ok=True)
    if force_login:
        TOKEN.unlink(missing_ok=True)

    return gspread.oauth(
        scopes=SCOPES,
        credentials_filename=str(CLIENT_SECRET),
        authorized_user_filename=str(TOKEN),
    )


def sheet_key(url_or_key):
    """Accept either a full spreadsheet URL or a bare key, return the key."""
    if "/" not in url_or_key:
        return url_or_key
    from gspread.utils import extract_id_from_url

    return extract_id_from_url(url_or_key)


def open_sheet(url_or_key, gc=None):
    """Open a spreadsheet by URL or key. Reuses `gc` if you already have one."""
    gc = gc or client()
    return gc.open_by_key(sheet_key(url_or_key))


# ─── CLI ────────────────────────────────────────────────────────


def _check(url):
    """Read-only probe: prove the token opens the sheet and show what's in it."""
    ss = open_sheet(url)
    print(f"Opened: {ss.title}")
    print(f"URL:    {ss.url}\n")

    for ws in ss.worksheets():
        rows = ws.get_all_values()
        width = max((len(r) for r in rows), default=0)
        print(f"  [{ws.title}] {len(rows)} rows x {width} cols")
        for row in rows[:3]:
            cells = [c if len(c) <= 40 else c[:37] + "..." for c in row]
            print(f"      {cells}")
        if len(rows) > 3:
            print(f"      ... {len(rows) - 3} more rows")
    return 0


def _verify_write(url):
    """Prove write access without touching real data.

    Creates a scratch worksheet, writes a cell, reads it back, and deletes the
    worksheet again. The sheet's existing tabs are never modified.
    """
    ss = open_sheet(url)
    print(f"Opened: {ss.title}")

    ws = None
    try:
        ws = ss.add_worksheet(title=SCRATCH_TAB, rows=1, cols=1)
        print(f"Created scratch worksheet '{SCRATCH_TAB}'")

        ws.update_acell("A1", "ok")
        got = ws.acell("A1").value
        print(f"Wrote 'ok' to A1, read back {got!r}")

        if got != "ok":
            print("\nFAILED: value did not round-trip.", file=sys.stderr)
            return 1
    finally:
        if ws is not None:
            ss.del_worksheet(ws)
            print(f"Deleted scratch worksheet '{SCRATCH_TAB}'")

    print("\nWrite access confirmed.")
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Google Sheets access via desktop OAuth.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--login",
        action="store_true",
        help="run the browser consent flow and cache the token",
    )
    group.add_argument("--check", metavar="URL", help="read-only probe of a sheet")
    group.add_argument(
        "--verify-write",
        metavar="URL",
        help="prove write access using a temporary scratch worksheet",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="with --login, discard the cached token and re-consent",
    )
    args = parser.parse_args()

    if args.login:
        client(force_login=args.force)
        print(f"Authorized. Token cached at {TOKEN}")
        return 0
    if args.check:
        return _check(args.check)
    return _verify_write(args.verify_write)


if __name__ == "__main__":
    sys.exit(main())
