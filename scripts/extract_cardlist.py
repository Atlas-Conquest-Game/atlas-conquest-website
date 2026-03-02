"""Extract card list from FullCardList.asset into cardlist.json.

Run this when you want to update cardlist.json without running the full pipeline:
    python scripts/extract_cardlist.py

The main pipeline (fetch_data.py) also calls this automatically.

Reads:  Formats/FullCardList.asset
Writes: site/data/cardlist.json
"""
import sys
from pathlib import Path

# Allow importing from scripts/pipeline/ when run standalone
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline.io_helpers import write_cardlist

if __name__ == "__main__":
    write_cardlist()
