"""Week-key parsing for the published weekly trend series.

Published keys look like ``YYYY-Www`` but two schemes exist:

* ``strftime``  — data_version < 3.1.0: ``strftime("%Y-W%W")``. Weeks start on
  Monday, week 00 holds the days before the year's first Monday, so the
  calendar week around New Year is split into ``YYYY-W52`` + ``YYYY+1-W00``,
  and most years are numbered one lower than ISO.
* ``iso``       — data_version >= 3.1.0: ISO-8601 ``isocalendar()`` keys.

Every key is mapped to the Monday that starts its calendar week and then to the
ISO key of that Monday, so split weeks merge back together and both schemes
land on the same ISO weeks.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta

_KEY_RE = re.compile(r"^\s*(\d{4})-W(\d{1,2})\s*$")

STRFTIME = "strftime"
ISO = "iso"


def _version_tuple(v):
    try:
        return tuple(int(x) for x in str(v).split(".")[:3])
    except (TypeError, ValueError):
        return None


def detect_scheme(keys, data_version=None):
    """Which scheme produced these keys.

    Any ``W00`` key can only come from strftime. Otherwise the published
    metadata ``data_version`` decides (>= 3.1.0 means ISO); unknown or older
    versions are treated as strftime.
    """
    for k in keys or ():
        m = _KEY_RE.match(str(k))
        if m and int(m.group(2)) == 0:
            return STRFTIME
    vt = _version_tuple(data_version) if data_version else None
    if vt and vt >= (3, 1, 0):
        return ISO
    return STRFTIME


def week_monday(key, scheme):
    """Monday (date) of the calendar week a published key refers to, or None
    for an unparseable key."""
    m = _KEY_RE.match(str(key))
    if not m:
        return None
    year, week = int(m.group(1)), int(m.group(2))
    try:
        if scheme == ISO:
            return date.fromisocalendar(year, week, 1)
        return datetime.strptime(f"{year}-W{week:02d}-1", "%Y-W%W-%w").date()
    except ValueError:
        return None


def iso_key(d: date) -> str:
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def to_iso_key(key, scheme):
    monday = week_monday(key, scheme)
    return iso_key(monday) if monday else None


def complete_weeks_before(as_of_date: date, count: int, skip: int = 0):
    """ISO week Mondays for ``count`` complete weeks ending before the week
    containing ``as_of_date`` (oldest first), after skipping ``skip`` weeks."""
    current = monday_of(as_of_date)
    end = current - timedelta(weeks=skip)
    return [end - timedelta(weeks=i) for i in range(count, 0, -1)]
