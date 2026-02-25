"""Pytest conftest — path setup so tests can import fetch_data and helpers."""

import sys
from pathlib import Path

# Add scripts/ to sys.path so `from fetch_data import ...` works
SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

# Add tests/ to sys.path so `from helpers import ...` works
TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))
