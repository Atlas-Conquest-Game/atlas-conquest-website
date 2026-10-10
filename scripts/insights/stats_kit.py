"""Statistics helpers and the display gates every insights file follows.

The frontend mirrors these rules (see docs/DATA_MODEL.md, "Insights: stats
kit"), so keep the constants and the verdict logic in sync with the docs.

No tier lists, no tier labels: a commander or matchup is described by its
winrate, a 95% interval and its sample size, plus a plain-language verdict that
only says what the interval supports.
"""

from __future__ import annotations

import math

Z95 = 1.96

# ─── Gates (mirrored by the frontend) ────────────────────────────

# Below this many games no point estimate (winrate, interval) is published —
# only the count and "too early to tell".
MIN_GAMES_FOR_ESTIMATE = 20
# Below this many games an estimate is shown with a "low data" flag, and an
# interval straddling 50% reads "too early to tell" rather than "even".
LOW_DATA_GAMES = 40

# Pilot gates: a sample that is mostly one person's games describes that
# person, not the commander/package, and the Wilson interval (which assumes
# independent games) is far too narrow. Above this share of games from one
# pilot, no estimate or verdict is published.
MAX_TOP_PILOT_SHARE = 0.5
# commander_stats publishes ``pilots`` as null below this many distinct players.
MIN_PILOTS = 5

VERDICT_LABELS = {
    "above_even": "Above even",
    "below_even": "Below even",
    "even": "Even as far as we can tell",
    "too_early": "Too early to tell",
    "one_player": "Mostly one player's games",
    "few_players": "Fewer than 5 players",
}


def wilson(w, n, z=Z95):
    """95% Wilson score interval for w successes in n trials.

    Returns (lo, hi), or (None, None) when n == 0. Bounds are clamped to [0, 1].
    """
    if not n or n <= 0:
        return (None, None)
    if w < 0 or w > n:
        raise ValueError(f"wins {w} outside [0, {n}]")
    p = w / n
    z2 = z * z
    denom = 1.0 + z2 / n
    center = (p + z2 / (2.0 * n)) / denom
    half = z * math.sqrt(p * (1.0 - p) / n + z2 / (4.0 * n * n)) / denom
    lo = 0.0 if w == 0 else max(0.0, center - half)
    hi = 1.0 if w == n else min(1.0, center + half)
    return (lo, hi)


def verdict(lo, hi, n):
    """Plain-language verdict that only claims what the interval supports.

    Rules (in order):
      n < 20 (or no interval)     -> too_early, no point estimate shown
      lo > 0.5                    -> above_even
      hi < 0.5                    -> below_even
      straddles 0.5 and n < 40    -> too_early   (estimate shown, low data)
      straddles 0.5 and n >= 40   -> even        ("even as far as we can tell")

    Returns {"code", "label", "show_estimate", "low_data"}.
    """
    if n is None or n < MIN_GAMES_FOR_ESTIMATE or lo is None or hi is None:
        code, show = "too_early", False
    elif lo > 0.5:
        code, show = "above_even", True
    elif hi < 0.5:
        code, show = "below_even", True
    elif n < LOW_DATA_GAMES:
        code, show = "too_early", True
    else:
        code, show = "even", True
    return {
        "code": code,
        "label": VERDICT_LABELS[code],
        "show_estimate": show,
        "low_data": (n or 0) < LOW_DATA_GAMES,
    }


def rate_block(wins, games, *, extra=None):
    """Standard published record: counts always, estimate only past the gate.

    {"games", "wins", "wr", "lo", "hi", "verdict", "verdict_label", "low_data"}
    with wr/lo/hi null below MIN_GAMES_FOR_ESTIMATE.
    """
    games = int(games or 0)
    wins = int(wins or 0)
    lo, hi = wilson(wins, games)
    v = verdict(lo, hi, games)
    out = {
        "games": games,
        "wins": wins,
        "wr": round(wins / games, 4) if v["show_estimate"] else None,
        "lo": round(lo, 4) if v["show_estimate"] else None,
        "hi": round(hi, 4) if v["show_estimate"] else None,
        "verdict": v["code"],
        "verdict_label": v["label"],
        "low_data": v["low_data"],
    }
    if extra:
        out.update(extra)
    return out


def pilots_status(row):
    """How to read a commander_stats row's ``pilots`` field.

    "ok"         an integer count (>= MIN_PILOTS)
    "below_min"  key present and null: fewer than MIN_PILOTS distinct players
    "unknown"    key absent (data published before data_version 3.1.0)
    """
    if row is None or "pilots" not in row:
        return "unknown"
    return "below_min" if row["pilots"] is None else "ok"


def apply_pilot_gates(rb, concentration=None, pilot_status=None):
    """Withhold the estimate of a rate block whose games mostly come from one
    player or from fewer than MIN_PILOTS players (mutates and returns ``rb``).

    Order: n < 20 stays ``too_early``; then ``few_players`` (pilot_status ==
    "below_min"); then ``one_player`` (concentration["concentrated"]).
    Counts (games, wins) are kept; wr/lo/hi become null.
    """
    if rb is None or rb.get("games", 0) < MIN_GAMES_FOR_ESTIMATE:
        return rb
    code = None
    if pilot_status == "below_min":
        code = "few_players"
    elif concentration and concentration.get("concentrated"):
        code = "one_player"
    if code:
        rb["wr"] = rb["lo"] = rb["hi"] = None
        rb["verdict"] = code
        rb["verdict_label"] = VERDICT_LABELS[code]
    return rb


def two_proportion_z(w1, n1, w2, n2):
    """Pooled two-proportion z statistic for p1 - p2 (None if undefined)."""
    if not n1 or not n2:
        return None
    p = (w1 + w2) / (n1 + n2)
    var = p * (1.0 - p) * (1.0 / n1 + 1.0 / n2)
    if var <= 0:
        return None
    return (w1 / n1 - w2 / n2) / math.sqrt(var)


# ─── Beta distribution (no scipy in CI) ───────────────────────────

def _betacf(a, b, x, max_iter=500, eps=3e-15):
    """Continued fraction for the incomplete beta (Lentz; Numerical Recipes)."""
    fpmin = 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < fpmin:
        d = fpmin
    d = 1.0 / d
    h = d
    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < fpmin:
            d = fpmin
        c = 1.0 + aa / c
        if abs(c) < fpmin:
            c = fpmin
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < fpmin:
            d = fpmin
        c = 1.0 + aa / c
        if abs(c) < fpmin:
            c = fpmin
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break
    return h


def beta_cdf(x, a, b):
    """Regularized incomplete beta I_x(a, b) — the Beta(a, b) CDF at x."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    log_bt = (math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
              + a * math.log(x) + b * math.log1p(-x))
    bt = math.exp(log_bt)
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def beta_ppf(q, a, b, tol=1e-10):
    """Beta(a, b) quantile by bisection (deterministic, monotone-safe)."""
    if q <= 0.0:
        return 0.0
    if q >= 1.0:
        return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if beta_cdf(mid, a, b) < q:
            lo = mid
        else:
            hi = mid
        if hi - lo < tol:
            break
    return 0.5 * (lo + hi)


def beta_interval(a, b, level=0.95):
    tail = (1.0 - level) / 2.0
    return beta_ppf(tail, a, b), beta_ppf(1.0 - tail, a, b)


# ─── Histogram quantiles ──────────────────────────────────────────

def histogram_quantile(labels, counts, q):
    """Quantile from a bucketed histogram with "a-b" labels, interpolating
    linearly inside the bucket. Returns None for an empty histogram."""
    total = sum(counts)
    if total <= 0:
        return None
    target = q * total
    cum = 0.0
    for label, c in zip(labels, counts):
        lo_s, _, hi_s = str(label).partition("-")
        lo, hi = float(lo_s), float(hi_s or lo_s)
        if c > 0 and cum + c >= target:
            frac = (target - cum) / c
            return lo + frac * (hi - lo)
        cum += c
    lo_s, _, hi_s = str(labels[-1]).partition("-")
    return float(hi_s or lo_s)


# ─── Small dense linear algebra (no numpy in CI) ──────────────────

def invert_matrix(m):
    """Inverse of a small square matrix (list of lists) by Gauss-Jordan
    elimination with partial pivoting. Raises ValueError if singular."""
    k = len(m)
    a = [list(map(float, row)) + [1.0 if i == j else 0.0 for j in range(k)]
         for i, row in enumerate(m)]
    for col in range(k):
        pivot = max(range(col, k), key=lambda r: abs(a[r][col]))
        if abs(a[pivot][col]) < 1e-14:
            raise ValueError("singular matrix")
        a[col], a[pivot] = a[pivot], a[col]
        inv_p = 1.0 / a[col][col]
        a[col] = [v * inv_p for v in a[col]]
        for r in range(k):
            if r != col and a[r][col] != 0.0:
                f = a[r][col]
                a[r] = [vr - f * vc for vr, vc in zip(a[r], a[col])]
    return [row[k:] for row in a]
