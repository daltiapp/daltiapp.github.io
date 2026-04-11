#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
NOTICE_DIR = BASE_DIR / "notice"
OUTPUT_JSON = NOTICE_DIR / "notice.json"

SOURCES = [
    {
        "key": "kkf",
        "label": "KKF",
        "index_path": NOTICE_DIR / "notice_kkf.json",
        "detail_prefix": "./detail/",
    },
    {
        "key": "dongsa",
        "label": "Dongsa",
        "index_path": NOTICE_DIR / "dongsa" / "notice_dongsa.json",
        "detail_prefix": "./dongsa/detail/",
    },
]


def load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_detail_path(detail_path: str, detail_prefix: str) -> str:
    suffix = str(detail_path or "").strip()
    if suffix.startswith("./detail/"):
        return f"{detail_prefix}{suffix.removeprefix('./detail/')}"
    return suffix


def merged_items() -> tuple[list[str], list[dict[str, object]]]:
    keywords: list[str] = []
    items: list[dict[str, object]] = []

    for source in SOURCES:
        payload = load_json(source["index_path"])
        for keyword in payload.get("keywords", []):
            if keyword not in keywords:
                keywords.append(keyword)

        for item in payload.get("items", []):
            merged = dict(item)
            merged["source"] = source["key"]
            merged["source_label"] = source["label"]
            merged["board"] = source["label"]
            merged["source_seq"] = item.get("seq", "")
            merged["notice_id"] = f"{source['key']}:{item.get('seq', '')}"
            merged["detail_path"] = normalize_detail_path(
                str(item.get("detail_path", "")),
                str(source["detail_prefix"]),
            )
            items.append(merged)

    items.sort(
        key=lambda item: (
            str(item.get("published_at") or ""),
            str(item.get("source") or ""),
            str(item.get("seq") or ""),
        ),
        reverse=True,
    )
    return keywords, items


def main() -> int:
    keywords, items = merged_items()
    payload = {
        "crawl_mode": "merged_indexes",
        "storage": "split_index_detail_multi_source",
        "identity_field": "notice_id",
        "keywords": keywords,
        "total_count": len(items),
        "sources": [
            {
                "key": source["key"],
                "label": source["label"],
                "index_path": str(source["index_path"].relative_to(NOTICE_DIR.parent)),
            }
            for source in SOURCES
        ],
        "items": items,
    }
    OUTPUT_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Saved combined notice index: {OUTPUT_JSON}")
    print(f"Combined items: {len(items)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
