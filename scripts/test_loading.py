"""
Atlas Conquest — Site Loading Time Tests

Measures page load performance: JSON file sizes, total payload per page,
and estimated load times at various connection speeds.

Usage:
    python scripts/test_loading.py
"""

import json
import os
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "site" / "data"

# Which data files each page loads (based on shared.js loadAllData + page-specific)
SHARED_FILES = [
    "metadata.json",
    "commander_stats.json",
    "card_stats.json",
    "trends.json",
    "matchups.json",
    "commanders.json",
    "game_distributions.json",
    "deck_composition.json",
    "first_turn.json",
    "commander_trends.json",
    "duration_winrates.json",
    "action_winrates.json",
]

# commander_card_stats.json is lazy-loaded only on Cards page when selecting a commander
LAZY_FILES = [
    "commander_card_stats.json",
]

# Connection speeds in bytes/sec
SPEEDS = {
    "3G (1.5 Mbps)": 1_500_000 / 8,
    "4G (10 Mbps)": 10_000_000 / 8,
    "Broadband (50 Mbps)": 50_000_000 / 8,
}

# Thresholds
WARN_FILE_KB = 500  # Warn if any single file exceeds this
WARN_TOTAL_MB = 3.0  # Warn if total initial payload exceeds this
FAIL_TOTAL_MB = 5.0  # Fail if total initial payload exceeds this


def get_file_size(path):
    """Return file size in bytes, or 0 if missing."""
    try:
        return os.path.getsize(path)
    except OSError:
        return 0


def format_size(bytes_val):
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024 * 1024:
        return f"{bytes_val / 1024:.1f} KB"
    else:
        return f"{bytes_val / (1024 * 1024):.2f} MB"


def main():
    print("=" * 60)
    print("Atlas Conquest — Site Loading Performance Report")
    print("=" * 60)
    print()

    # Individual file sizes
    print("📦 Data File Sizes")
    print("-" * 50)

    total_initial = 0
    total_lazy = 0
    warnings = []

    all_files = [(f, False) for f in SHARED_FILES] + [(f, True) for f in LAZY_FILES]

    for filename, is_lazy in all_files:
        path = DATA_DIR / filename
        size = get_file_size(path)
        label = " (lazy)" if is_lazy else ""
        flag = ""

        if size > WARN_FILE_KB * 1024:
            flag = " ⚠️"
            warnings.append(f"{filename} is {format_size(size)} (>{WARN_FILE_KB}KB)")

        if is_lazy:
            total_lazy += size
        else:
            total_initial += size

        print(f"  {filename:<35} {format_size(size):>10}{label}{flag}")

    print(f"  {'─' * 48}")
    print(f"  {'Initial load total':<35} {format_size(total_initial):>10}")
    print(f"  {'Lazy-loaded total':<35} {format_size(total_lazy):>10}")
    print(f"  {'Everything total':<35} {format_size(total_initial + total_lazy):>10}")
    print()

    # Estimated load times
    print("⏱  Estimated Data Load Times (initial page load)")
    print("-" * 50)

    for speed_name, bps in SPEEDS.items():
        time_sec = total_initial / bps
        print(f"  {speed_name:<25} {time_sec:.2f}s")

    print()

    # Load time with lazy files
    print("⏱  Estimated Load Times (with lazy data)")
    print("-" * 50)
    total_all = total_initial + total_lazy

    for speed_name, bps in SPEEDS.items():
        time_sec = total_all / bps
        print(f"  {speed_name:<25} {time_sec:.2f}s")

    print()

    # Summary
    total_initial_mb = total_initial / (1024 * 1024)
    passed = True

    if total_initial_mb > FAIL_TOTAL_MB:
        print(f"❌ FAIL: Initial payload {total_initial_mb:.2f}MB exceeds {FAIL_TOTAL_MB}MB limit")
        passed = False
    elif total_initial_mb > WARN_TOTAL_MB:
        print(f"⚠️  WARNING: Initial payload {total_initial_mb:.2f}MB exceeds {WARN_TOTAL_MB}MB soft limit")
    else:
        print(f"✅ Initial payload {total_initial_mb:.2f}MB is within limits")

    for w in warnings:
        print(f"⚠️  {w}")

    if not warnings and passed:
        print("✅ All individual files within size limits")

    print()
    return 0 if passed else 1


if __name__ == "__main__":
    exit(main())
