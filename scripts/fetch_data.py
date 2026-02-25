"""Atlas Conquest — Data Pipeline entry point.

All logic lives in the pipeline/ package. This file exists so that
`python scripts/fetch_data.py` continues to work (used by CI).
"""

from pipeline.main import main

if __name__ == "__main__":
    main()
