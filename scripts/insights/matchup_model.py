"""Matchup model: Bradley-Terry commander strengths + shrunk pairwise estimates.

Input is the ordered-pair records in matchups.json (mirror matches excluded).
For every period × map:

1. Fit Bradley-Terry strengths s_i by Hunter's MM iteration, with a tiny
   regulariser (one virtual win and one virtual loss against an "average"
   opponent of strength 1) so a commander that never lost or never won still
   gets a finite strength. Strengths are renormalised to geometric mean 1
   after every MM step, so "strength 1" is the field average.
   Each strength gets a 95% interval from the observed Fisher information of
   the (regularised) likelihood, for log-strength relative to the field mean.
   Strengths are MODEL INPUTS, not a ranking: they are published only for
   commanders with >= STRENGTH_MIN_GAMES non-mirror games, and the commander
   list is alphabetical.
2. expected(a beats b) = s_a / (s_a + s_b) — published only when both
   strengths are (the model still uses it internally as the prior centre).
3. Each pair's estimate is the posterior mean of Beta(k·e + wins, k·(1-e) +
   losses) with k = PRIOR_GAMES (~20 games of prior weight centred on the
   expectation); lo/hi are the 95% posterior interval. Below LOW_DATA_N games
   the estimate is mostly the prior, so est/lo/hi/favored are null.
4. ``favored`` ("a" / "b" / null) is set only when the posterior interval
   excludes 0.5 AND the raw record points the same way.
5. Evidence label (same for both orientations):
     low-data  n < 10 (record only)
     counter   n >= 20, favored side set, the favored side beats the strength
               expectation (interval excludes it by more than COUNTER_MARGIN
               on the favored side) and |est - 0.5| >= 0.10
     lean      favored side set (interval excludes 0.5, raw record agrees),
               not a counter
     even      interval straddles 0.5 and n >= 40
     unclear   everything else (straddles 0.5 with n < 40, or the posterior
               and the raw record disagree)

Both orientations of every PLAYED pair are published (pairs with n = 0 are
omitted), with est_ab = 1 - est_ba exactly (the b-side is derived from the
rounded a-side values).
"""

from __future__ import annotations

import math
from collections import defaultdict

from insights.common import MAPS, MODEL_PERIODS, commander_slug, r4
from insights.stats_kit import LOW_DATA_GAMES, Z95, beta_interval, invert_matrix, wilson

PRIOR_GAMES = 20          # Beta prior weight (games) centred on the BT expectation
BT_PRIOR_GAMES = 2.0      # virtual games vs an average opponent (1 win, 1 loss)
LOW_DATA_N = 10           # below: record only (no est/lo/hi/favored)
COUNTER_MIN_N = 20
COUNTER_MARGIN = 0.02
COUNTER_MIN_EDGE = 0.10
EVEN_MIN_N = LOW_DATA_GAMES   # "even" needs this many games (mirrors stats_kit)
RELIABLE_N = 20           # raw_wr gate and "pairs with n >= 20" in the summary
STRENGTH_MIN_GAMES = 20   # strength / expected published at or above this

EVIDENCE_LEVELS = ["counter", "lean", "even", "unclear", "low-data"]
EVIDENCE_LABELS = {
    "counter": "Counter (beats what overall strength predicts)",
    "lean": "Leans one way",
    "even": "Even as far as we can tell",
    "unclear": "Too early to tell",
    "low-data": "Not enough games",
}


def fit_bradley_terry(names, wins, prior_games=BT_PRIOR_GAMES, max_iter=20000, tol=1e-10):
    """Fit Bradley-Terry strengths with Hunter's (2004) MM algorithm.

    names: iterable of commander names.
    wins:  {(a, b): games a won against b} for a != b (mirrors ignored).

    Returns (strengths, iterations, converged); strengths has geometric mean 1.
    """
    names = sorted(set(names))
    if not names:
        return {}, 0, True
    n_pair = defaultdict(float)
    total_wins = {i: prior_games / 2.0 for i in names}
    for (a, b), w in wins.items():
        if a == b or a not in total_wins or b not in total_wins or not w:
            continue
        total_wins[a] += w
        key = (a, b) if a < b else (b, a)
        n_pair[key] += w
    opponents = defaultdict(list)
    for (a, b), n in n_pair.items():
        if n > 0:
            opponents[a].append((b, n))
            opponents[b].append((a, n))

    p = {i: 1.0 for i in names}
    converged = False
    it = 0
    for it in range(1, max_iter + 1):
        new = {}
        for i in names:
            # Virtual games are against an average opponent: strength 1 is the
            # geometric mean, restored after every step below.
            denom = prior_games / (p[i] + 1.0)
            for j, n in opponents[i]:
                denom += n / (p[i] + p[j])
            new[i] = total_wins[i] / denom
        # Renormalise to geometric mean 1. Pairwise expectations are
        # scale-free, and without this the overall scale is pinned only by the
        # tiny regulariser, which makes plain MM crawl (thousands of steps).
        log_gm = sum(math.log(v) for v in new.values()) / len(new)
        gm = math.exp(log_gm)
        new = {i: v / gm for i, v in new.items()}
        delta = max(abs(math.log(new[i]) - math.log(p[i])) for i in names)
        p = new
        if delta < tol:
            converged = True
            break
    return p, it, converged


def log_strength_se(names, wins, strengths, prior_games=BT_PRIOR_GAMES):
    """Standard error of each log-strength relative to the field mean.

    Observed Fisher information of the regularised BT log-likelihood at the
    fit (games between i and j contribute n·p(1−p); the virtual games vs the
    average opponent contribute prior_games·q(1−q)), inverted, then projected
    onto contrasts θ_i − mean(θ) so the interval is "vs the field average".
    Returns {name: se} (None if the matrix is singular).
    """
    names = sorted(names)
    k = len(names)
    if k == 0:
        return {}
    idx = {n: i for i, n in enumerate(names)}
    info = [[0.0] * k for _ in range(k)]
    for i, a in enumerate(names):
        s = strengths[a]
        q = s / (s + 1.0)
        info[i][i] += prior_games * q * (1.0 - q)
    games = defaultdict(float)
    for (a, b), w in wins.items():
        if a == b or a not in idx or b not in idx or not w:
            continue
        key = (a, b) if a < b else (b, a)
        games[key] += w
    for (a, b), n in games.items():
        p = strengths[a] / (strengths[a] + strengths[b])
        v = n * p * (1.0 - p)
        i, j = idx[a], idx[b]
        info[i][i] += v
        info[j][j] += v
        info[i][j] -= v
        info[j][i] -= v
    try:
        cov = invert_matrix(info)
    except ValueError:
        return {n: None for n in names}
    # Var(θ_i − mean θ) = C_ii − 2·mean_j C_ij + mean_jl C_jl
    row_mean = [sum(row) / k for row in cov]
    grand = sum(row_mean) / k
    out = {}
    for n, i in idx.items():
        var = cov[i][i] - 2.0 * row_mean[i] + grand
        out[n] = math.sqrt(var) if var > 0 else None
    return out


def expected_prob(s_a, s_b):
    return s_a / (s_a + s_b)


def pair_posterior(wins, n, expected, prior_games=PRIOR_GAMES):
    """Posterior mean and 95% interval of P(a beats b).

    Beta prior with ``prior_games`` of weight centred on ``expected``.
    """
    alpha = prior_games * expected + wins
    beta = prior_games * (1.0 - expected) + (n - wins)
    est = alpha / (alpha + beta)
    lo, hi = beta_interval(alpha, beta)
    return est, lo, hi


def favored_side(n, wins, lo, hi):
    """'a' / 'b' when the posterior interval excludes 0.5 and the raw record
    points the same way (n >= LOW_DATA_N); otherwise None."""
    if n < LOW_DATA_N or lo is None or hi is None:
        return None
    if lo > 0.5 and wins * 2 > n:
        return "a"
    if hi < 0.5 and wins * 2 < n:
        return "b"
    return None


def classify_evidence(n, est, lo, hi, expected, wins=None):
    """Evidence label for a pair from a's side (see module docstring).

    ``wins`` (a's wins) is needed to check the raw record agrees; when omitted
    the raw record is assumed to agree with the posterior."""
    if n < LOW_DATA_N:
        return "low-data"
    if wins is None:
        wins = n if est > 0.5 else (0 if est < 0.5 else n / 2.0)
    fav = favored_side(n, wins, lo, hi)
    if fav is not None:
        edge = abs(est - 0.5)
        if fav == "a":
            beats_expectation = lo > expected + COUNTER_MARGIN
        else:
            beats_expectation = hi < expected - COUNTER_MARGIN
        if n >= COUNTER_MIN_N and beats_expectation and edge >= COUNTER_MIN_EDGE - 1e-12:
            return "counter"
        return "lean"
    if lo <= 0.5 <= hi and n >= EVEN_MIN_N:
        return "even"
    return "unclear"


def _flip(row):
    """b-side of a canonical a-side row, derived from the ROUNDED a-side so
    est_ab + est_ba == 1 exactly."""
    def inv(x):
        return None if x is None else r4(1.0 - x)
    return {
        "a": row["b"],
        "b": row["a"],
        "n": row["n"],
        "wins": row["n"] - row["wins"],
        "raw_wr": inv(row["raw_wr"]),
        "expected": inv(row["expected"]),
        "est": inv(row["est"]),
        "lo": inv(row["hi"]),
        "hi": inv(row["lo"]),
        "evidence": row["evidence"],
        "favored": {"a": "b", "b": "a", None: None}[row["favored"]],
    }


def _interval_from_log(theta, se):
    if se is None:
        return None, None
    return math.exp(theta - Z95 * se), math.exp(theta + Z95 * se)


def build_block(block, include_unplayed=False):
    """Model one period × map block of matchups.json ({"commanders", "matchups"})."""
    rows = (block or {}).get("matchups", [])
    names = set((block or {}).get("commanders", []))
    wins = {}
    for r in rows:
        a, b = r["commander"], r["opponent"]
        names.update((a, b))
        if a == b:
            continue
        wins[(a, b)] = wins.get((a, b), 0) + int(r.get("wins", 0))
    names = sorted(names)
    strengths, iterations, converged = fit_bradley_terry(names, wins)
    ses = log_strength_se(names, wins, strengths)

    commanders = []
    gated = {}
    for name in names:
        g = sum(wins.get((name, o), 0) + wins.get((o, name), 0) for o in names if o != name)
        w = sum(wins.get((name, o), 0) for o in names if o != name)
        s = strengths.get(name, 1.0)
        show = g >= STRENGTH_MIN_GAMES
        gated[name] = not show
        theta = math.log(s)
        s_lo, s_hi = _interval_from_log(theta, ses.get(name))
        commanders.append({
            "name": name,
            "slug": commander_slug(name),
            "games": g,
            "wins": w,
            "strength": r4(s) if show else None,
            "strength_lo": r4(s_lo) if show and s_lo is not None else None,
            "strength_hi": r4(s_hi) if show and s_hi is not None else None,
            "log_strength": r4(theta) if show else None,
            "log_strength_se": r4(ses.get(name)) if show and ses.get(name) is not None else None,
            "expected_vs_field": r4(s / (s + 1.0)) if show else None,
            "expected_vs_field_lo": r4(s_lo / (s_lo + 1.0)) if show and s_lo is not None else None,
            "expected_vs_field_hi": r4(s_hi / (s_hi + 1.0)) if show and s_hi is not None else None,
        })
    # Alphabetical on purpose: strengths are model inputs, not a ranking.

    pairs = []
    total_games = 0
    counters = []
    reliable = consistent = 0
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            w_ab = wins.get((a, b), 0)
            w_ba = wins.get((b, a), 0)
            n = w_ab + w_ba
            total_games += n
            if n == 0 and not include_unplayed:
                continue
            e = expected_prob(strengths[a], strengths[b])
            est, lo, hi = pair_posterior(w_ab, n, e)
            # Classify on the rounded values so both orientations and the
            # published numbers agree exactly.
            est_r, lo_r, hi_r = r4(est), r4(lo), r4(hi)
            evidence = classify_evidence(n, est_r, lo_r, hi_r, e, wins=w_ab)
            show = n >= LOW_DATA_N
            row = {
                "a": a, "b": b, "n": n, "wins": w_ab,
                "raw_wr": r4(w_ab / n) if n >= RELIABLE_N else None,
                "expected": None if gated[a] or gated[b] else r4(e),
                "est": est_r if show else None,
                "lo": lo_r if show else None,
                "hi": hi_r if show else None,
                "evidence": evidence,
                "favored": favored_side(n, w_ab, lo_r, hi_r),
            }
            pairs.append(row)
            pairs.append(_flip(row))
            if n >= RELIABLE_N:
                reliable += 1
                wlo, whi = wilson(w_ab, n)
                if wlo <= e <= whi:
                    consistent += 1
            if evidence == "counter":
                win_row = row if row["favored"] == "a" else _flip(row)
                counters.append({
                    "winner": win_row["a"], "loser": win_row["b"],
                    "n": n, "wins": win_row["wins"],
                    "est": win_row["est"], "lo": win_row["lo"], "hi": win_row["hi"],
                    "expected": win_row["expected"],
                })
    pairs.sort(key=lambda r: (r["a"], r["b"]))
    counters.sort(key=lambda c: (-c["est"], c["winner"], c["loser"]))

    return {
        "games": total_games,
        "fit": {"iterations": iterations, "converged": converged},
        "commanders": commanders,
        "pairs": pairs,
        "counters": counters,
        "summary": {
            "commanders": len(names),
            "pairs_played": sum(1 for p in pairs if p["n"] > 0) // 2,
            "pairs_n20": reliable,
            "counters": len(counters),
            "consistent_with_strength": consistent,
            "consistent_share": r4(consistent / reliable) if reliable else None,
        },
    }


def method_block():
    return {
        "model": "Bradley-Terry strengths fit by MM iteration on non-mirror games",
        "bt_regulariser": "1 virtual win + 1 virtual loss vs an average opponent (strength 1 = geometric mean, renormalised every MM step)",
        "strength_scale": "geometric mean of strengths = 1; expected(a beats b) = s_a / (s_a + s_b)",
        "strength_interval": ("95% interval from the observed Fisher information of the regularised "
                              "likelihood, for log-strength relative to the field mean"),
        "strength_gate": (f"strength, its interval, expected_vs_field and every pair's expected are null "
                          f"when a commander has fewer than {STRENGTH_MIN_GAMES} non-mirror games"),
        "strength_use": ("model inputs, not a ranking: the commander list is alphabetical; show the "
                         "mirror-free record with its interval instead"),
        "estimate": "posterior mean of Beta(k*expected + wins, k*(1-expected) + losses)",
        "prior_games": PRIOR_GAMES,
        "interval": "95% equal-tailed Beta posterior interval",
        "estimate_gate": f"est, lo, hi and favored are null below {LOW_DATA_N} games (record only)",
        "favored": "set only when the posterior interval excludes 0.5 and the raw record points the same way",
        "evidence": {
            "low-data": f"n < {LOW_DATA_N}",
            "counter": (f"n >= {COUNTER_MIN_N}, favored set, the favored side beats the strength "
                        f"expectation by more than {COUNTER_MARGIN} (interval bound), "
                        f"|est - 0.5| >= {COUNTER_MIN_EDGE}"),
            "lean": "favored set (interval excludes 0.5 and the raw record agrees), not a counter",
            "even": f"interval straddles 0.5 and n >= {EVEN_MIN_N}",
            "unclear": "everything else",
        },
        "evidence_labels": EVIDENCE_LABELS,
        "unplayed_pairs": "omitted (no row means no recorded games)",
        "raw_wr_gate": f"raw_wr is null below {RELIABLE_N} games (wins and n always present)",
        "consistent_with_strength": (f"pairs with n >= {RELIABLE_N} whose raw 95% Wilson interval "
                                     "contains the strength-model expectation"),
    }


def build_matchup_model(matchups, as_of, periods=MODEL_PERIODS, maps=MAPS):
    data = {}
    for period in periods:
        data[period] = {}
        for map_name in maps:
            block = (matchups.get(period) or {}).get(map_name)
            data[period][map_name] = build_block(block)
    return {
        "schema_version": 1,
        "as_of": as_of,
        "periods": list(periods),
        "maps": list(maps),
        "method": method_block(),
        "data": data,
    }
