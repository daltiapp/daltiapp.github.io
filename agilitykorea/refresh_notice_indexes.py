#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
COMBINED_JSON = BASE_DIR / "notice" / "notice_combined.json"

STEPS = [
    BASE_DIR / "kkf_notice_scraper.py",
    BASE_DIR / "dongsa_notice_scraper.py",
    BASE_DIR / "build_combined_notice_index.py",
]


def load_notice_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {
        str(item.get("notice_id", ""))
        for item in payload.get("items", [])
        if item.get("notice_id")
    }


def main() -> int:
    previous_ids = load_notice_ids(COMBINED_JSON)

    for script_path in STEPS:
        print(f"Run: {script_path.name}")
        subprocess.run([sys.executable, str(script_path)], check=True)

    current_payload = json.loads(COMBINED_JSON.read_text(encoding="utf-8"))
    current_items = current_payload.get("items", [])
    current_ids = {
        str(item.get("notice_id", ""))
        for item in current_items
        if item.get("notice_id")
    }
    new_ids = current_ids - previous_ids

    print(f"Total notices: {len(current_items)}")
    print(f"New notices: {len(new_ids)}")

    # Stable notice_id values allow a future push sender to diff only new items.
    for item in current_items:
        notice_id = str(item.get("notice_id", ""))
        if notice_id not in new_ids:
            continue
        title = str(item.get("title", ""))
        source = str(item.get("source_label", ""))
        print(f"NEW\t{notice_id}\t{source}\t{title}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
