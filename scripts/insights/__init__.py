"""Derived "insights" data layer for the analytics v2 site.

Everything here reads the PUBLISHED ``site/data/*.json`` files (plus the git
history of ``site/data/cards.json`` for the card changelog) and writes only
into ``site/data/insights/``. Nothing here touches AWS or the raw game cache,
so it runs the same locally and in CI. Entry point: ``scripts/build_insights.py``.

Modules
-------
stats_kit       Wilson intervals, verdict and pilot gates, Beta posterior
                quantiles, two-proportion z — the rules the frontend mirrors.
concentration   Estimated share of a sample played by its busiest pilot.
weeks           Parse published week keys (legacy %W or ISO) into ISO weeks.
matchup_model   Bradley-Terry strengths + shrunk pairwise matchup estimates.
meta_pulse      "What changed" (last 4 ISO weeks vs prior 8) + headline facts.
card_changelog  Dated card stat changes from git history + run-to-run diffs.
profiles        One small JSON per commander for the profile pages.
community_decks Flat searchable index of named community decklists.
build           Orchestrates all of the above and writes the manifest.
"""
