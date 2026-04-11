#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import logging
import re
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

from kkf_notice_scraper import (
    absolutize_html_urls,
    dedupe_keep_order,
    extract_pdf_text,
    extract_rich_text,
    extract_tables,
    parse_links_and_images,
)


BASE_LIST_URL = "http://www.dong-sa.or.kr/board/index.jsp?code=notice"
OUTPUT_DIR = Path(__file__).resolve().parent / "notice" / "dongsa"
OUTPUT_JSON = OUTPUT_DIR / "notice_dongsa.json"
DETAIL_DIR = OUTPUT_DIR / "detail"
LOG_FILE = OUTPUT_DIR / "dongsa_notice_scraper.log"

KEYWORDS = ["WAO", "KAO", "어질리티"]
REQUEST_TIMEOUT = 20
REQUEST_SLEEP = 0.05
MAX_RETRIES = 3
DETAIL_WORKERS = 8

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/135.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Referer": BASE_LIST_URL,
}


@dataclass
class NoticeItem:
    seq: str
    title: str
    url: str
    internal_url: str
    published_at_raw: str
    published_at: str
    matched_keywords: list[str]
    matched_in: list[str]
    body_html: str
    body_text: str
    link_urls: list[str]
    image_urls: list[str]
    tables: list[dict[str, object]]
    attachments: list[dict[str, object]]


def setup_logging() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        value = (item or "").strip()
        if value and value not in seen:
            seen.add(value)
            output.append(value)
    return output


def fetch_html(url: str) -> str:
    last_error: Exception | None = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            request = Request(url, headers=HEADERS)
            with urlopen(request, timeout=REQUEST_TIMEOUT) as response:
                content = response.read()
                header = response.headers.get("Content-Type", "")
                encodings = []
                match = re.search(r"charset=([a-zA-Z0-9_-]+)", header, re.I)
                if match:
                    encodings.append(match.group(1))
                encodings.extend(["utf-8", "euc-kr", "cp949"])

                for encoding in unique(encodings):
                    try:
                        return content.decode(encoding, errors="strict")
                    except Exception:
                        continue

                for encoding in unique(encodings):
                    try:
                        return content.decode(encoding, errors="replace")
                    except Exception:
                        continue

                raise UnicodeDecodeError("unknown", b"", 0, 1, "unable to decode response")
        except Exception as error:
            last_error = error
            logging.warning("Fetch failed (%s/%s): %s", attempt, MAX_RETRIES, url)
            if attempt < MAX_RETRIES:
                time.sleep(float(attempt))

    assert last_error is not None
    raise last_error


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def lower_text(text: str) -> str:
    return normalize_text(text).lower()


def parse_published_at(raw_value: str) -> str:
    match = re.search(r"(\d{4})\.(\d{1,2})\.(\d{1,2})", raw_value)
    if not match:
        return ""
    year, month, day = match.groups()
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}T00:00:00+09:00"


def extract_id(url: str) -> str:
    qs = parse_qs(urlparse(url).query)
    return str(qs.get("id", [""])[0])


def canonicalize_detail_url(url: str) -> str:
    notice_id = extract_id(url)
    if not notice_id:
        return url
    query = urlencode({"id": notice_id, "code": "notice"})
    return f"http://www.dong-sa.or.kr/board/read.jsp?{query}"


def canonicalize_list_url(url: str) -> str:
    query = parse_qs(urlparse(url).query)
    page = str(query.get("page", ["1"])[0] or "1")
    if page == "1":
        return BASE_LIST_URL
    return f"{BASE_LIST_URL}&page={page}"


def parse_pagination_links(list_url: str, html: str) -> list[str]:
    hrefs, _ = parse_links_and_images(html)
    pages = [list_url]
    for href in hrefs:
        full_url = canonicalize_list_url(urljoin(list_url, href))
        if "/board/index.jsp" not in full_url or "code=notice" not in full_url:
            continue
        pages.append(full_url)
    return dedupe_keep_order(pages)


def parse_detail_links(list_url: str, html: str) -> list[str]:
    hrefs, _ = parse_links_and_images(html)
    detail_urls: list[str] = []
    for href in hrefs:
        full_url = urljoin(list_url, href)
        if "/board/read.jsp" not in full_url or "code=notice" not in full_url:
            continue
        notice_id = extract_id(full_url)
        if notice_id:
            detail_urls.append(canonicalize_detail_url(full_url))
    return dedupe_keep_order(detail_urls)


def discover_all_list_pages(start_url: str) -> list[str]:
    queue = [canonicalize_list_url(start_url)]
    seen: set[str] = set()
    ordered: list[str] = []

    while queue:
        current = queue.pop(0)
        if current in seen:
            continue

        seen.add(current)
        ordered.append(current)
        logging.info("Discover list page: %s", current)
        html = fetch_html(current)
        for link in parse_pagination_links(current, html):
            if link not in seen and link not in queue:
                queue.append(link)
        time.sleep(REQUEST_SLEEP)

    return ordered


def collect_detail_urls(list_pages: list[str]) -> list[str]:
    detail_urls: list[str] = []
    for page_url in list_pages:
        logging.info("Collect detail links from: %s", page_url)
        html = fetch_html(page_url)
        detail_urls.extend(parse_detail_links(page_url, html))
        time.sleep(REQUEST_SLEEP)
    return dedupe_keep_order(detail_urls)


def extract_title(view_html: str) -> str:
    match = re.search(r'<div class="read_tit">\s*(.*?)\s*</div>', view_html, re.I | re.S)
    return normalize_text(re.sub(r"<[^>]+>", " ", match.group(1))) if match else ""


def extract_detail_meta(view_html: str) -> tuple[str, str]:
    match = re.search(r'<div class="read_txt clear">.*?<p>(.*?)</p>', view_html, re.I | re.S)
    if not match:
        return "", ""
    meta_text = normalize_text(re.sub(r"<[^>]+>", " ", match.group(1)))
    date_match = re.search(r"([0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2})", meta_text)
    if not date_match:
        return "", ""
    published_at_raw = date_match.group(1)
    return published_at_raw, parse_published_at(published_at_raw)


def extract_first_div_inner_html(html: str, class_name: str) -> str:
    start_match = re.search(
        rf'<div[^>]*class="[^"]*\b{re.escape(class_name)}\b[^"]*"[^>]*>',
        html,
        re.I,
    )
    if not start_match:
        return ""

    content_start = start_match.end()
    depth = 1
    for match in re.finditer(r"</?div\b[^>]*>", html[content_start:], re.I):
        tag = match.group(0)
        if tag.lower().startswith("</div"):
            depth -= 1
        else:
            depth += 1
        if depth == 0:
            return html[content_start:content_start + match.start()].strip()
    return ""


def extract_attachments(view_url: str, view_html: str) -> list[dict[str, object]]:
    block_match = re.search(r'<dl class="file_upload clear">(.*?)</dl>', view_html, re.I | re.S)
    if not block_match:
        return []

    attachments: list[dict[str, object]] = []
    for href, label in re.findall(r'<dd>\s*<a href="([^"]+)".*?>(.*?)</a>\s*</dd>', block_match.group(1), re.I | re.S):
        direct_url = urljoin(view_url, href.strip())
        file_name = normalize_text(re.sub(r"<[^>]+>", " ", label))
        file_ext = ""
        if "." in file_name:
            file_ext = "." + file_name.rsplit(".", 1)[-1].lower()
        attachment = {
            "label": file_name or "첨부파일",
            "url": direct_url,
            "file_name": file_name,
            "file_ext": file_ext,
            "text": "",
        }
        if file_ext == ".pdf":
            attachment["text"] = extract_pdf_text(direct_url)
        attachments.append(attachment)
    return attachments


def detect_keywords(title: str) -> tuple[list[str], list[str]]:
    title_l = lower_text(title)
    matched_keywords: list[str] = []
    matched_in: set[str] = set()

    for keyword in KEYWORDS:
        keyword_l = keyword.lower()
        if keyword_l not in title_l:
            continue
        matched_keywords.append(keyword)
        matched_in.add("title")

    return dedupe_keep_order(matched_keywords), sorted(matched_in)


def parse_notice_detail(detail_url: str) -> NoticeItem | None:
    canonical_url = canonicalize_detail_url(detail_url)
    notice_id = extract_id(canonical_url)
    logging.info("Parse detail: %s", canonical_url)
    view_html = fetch_html(canonical_url)

    title = extract_title(view_html)
    if not title:
        return None

    published_at_raw, published_at = extract_detail_meta(view_html)
    body_html = extract_first_div_inner_html(view_html, "txt")
    body_html = absolutize_html_urls(canonical_url, body_html)
    link_urls, image_urls = parse_links_and_images(body_html)
    body_text = extract_rich_text(body_html)
    tables = extract_tables(body_html)
    attachments = extract_attachments(canonical_url, view_html)
    matched_keywords, matched_in = detect_keywords(title)
    if not matched_keywords:
        return None

    return NoticeItem(
        seq=notice_id,
        title=title,
        url=canonical_url,
        internal_url=canonical_url,
        published_at_raw=published_at_raw,
        published_at=published_at,
        matched_keywords=matched_keywords,
        matched_in=matched_in,
        body_html=body_html,
        body_text=body_text,
        link_urls=dedupe_keep_order([urljoin(canonical_url, link) for link in link_urls]),
        image_urls=dedupe_keep_order([urljoin(canonical_url, image) for image in image_urls]),
        tables=tables,
        attachments=attachments,
    )


def build_index_item(item: NoticeItem) -> dict[str, object]:
    return {
        "seq": item.seq,
        "title": item.title,
        "url": item.url,
        "internal_url": item.internal_url,
        "published_at_raw": item.published_at_raw,
        "published_at": item.published_at,
        "matched_keywords": item.matched_keywords,
        "matched_in": item.matched_in,
        "detail_path": f"./detail/{item.seq}.json",
        "image_count": len(item.image_urls),
        "attachment_count": len(item.attachments),
        "table_count": len(item.tables),
    }


def write_json_file(path: Path, payload: object) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def save_result(items: list[NoticeItem]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DETAIL_DIR.mkdir(parents=True, exist_ok=True)
    written_detail_names: set[str] = set()

    for item in items:
        detail_name = f"{item.seq}.json"
        write_json_file(DETAIL_DIR / detail_name, asdict(item))
        written_detail_names.add(detail_name)

    for stale_path in DETAIL_DIR.glob("*.json"):
        if stale_path.name not in written_detail_names:
            stale_path.unlink()

    payload = {
        "source_board_url": BASE_LIST_URL,
        "crawl_mode": "full_board",
        "storage": "split_index_detail",
        "keywords": KEYWORDS,
        "total_count": len(items),
        "detail_dir": "./detail",
        "items": [build_index_item(item) for item in items],
    }
    write_json_file(OUTPUT_JSON, payload)
    logging.info("Saved JSON: %s", OUTPUT_JSON)


def main() -> int:
    setup_logging()
    logging.info("Start Dongsa notice scraper")

    list_pages = discover_all_list_pages(BASE_LIST_URL)
    logging.info("Discovered list pages: %s", len(list_pages))
    detail_urls = collect_detail_urls(list_pages)
    logging.info("Collected candidate detail urls: %s", len(detail_urls))

    items: list[NoticeItem] = []
    with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as executor:
        future_map = {
            executor.submit(parse_notice_detail, detail_url): detail_url
            for detail_url in detail_urls
        }
        for index, future in enumerate(as_completed(future_map), start=1):
            try:
                item = future.result()
            except Exception:
                logging.exception("Failed future: %s", future_map[future])
                item = None
            if item is not None:
                items.append(item)
            logging.info("Detail progress %s / %s", index, len(detail_urls))

    items.sort(key=lambda item: int(item.seq) if item.seq.isdigit() else 0)
    save_result(items)
    logging.info("Done. matched_items=%s", len(items))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
