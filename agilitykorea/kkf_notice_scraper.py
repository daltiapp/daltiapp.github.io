#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict, dataclass
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qs, quote, unquote, urlencode, urljoin, urlparse, urlsplit, urlunsplit
from urllib.request import Request, urlopen


BASE_LIST_URL = (
    "https://www.thekkf.or.kr/new_home/news/board/"
    "list.php?board=board&code=1&intCurPage=&strSearchWord=&strSearchType==&f_word=&f_idx=&part="
)
OUTPUT_DIR = Path(__file__).resolve().parent / "notice"
OUTPUT_JSON = OUTPUT_DIR / "notice_kkf.json"
DETAIL_DIR = OUTPUT_DIR / "detail"
LOG_FILE = OUTPUT_DIR / "kkf_notice_scraper.log"

KEYWORDS = ["awc", "어질리티"]
SEARCH_TYPES = {
    "title": "fs",
    "body": "fc",
}
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
    view_count: int | None
    matched_keywords: list[str]
    matched_in: list[str]
    body_html: str
    body_text: str
    link_urls: list[str]
    image_urls: list[str]
    tables: list[dict[str, object]]
    attachments: list[dict[str, object]]


class LinkImageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.image_urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = dict(attrs)
        if tag == "a" and attr_map.get("href"):
            self.hrefs.append(attr_map["href"])
        elif tag == "img" and attr_map.get("src"):
            self.image_urls.append(attr_map["src"])


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
        elif tag in {"br", "p", "div", "tr", "td", "th", "li", "h1", "h2", "h3"}:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip_depth > 0:
            self._skip_depth -= 1
        elif tag in {"br", "p", "div", "tr", "td", "th", "li", "h1", "h2", "h3"}:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0 and data:
            self.parts.append(data)

    def get_text(self) -> str:
        return normalize_text(" ".join(self.parts))


class RichTextExtractor(HTMLParser):
    BLOCK_TAGS = {
        "address",
        "article",
        "blockquote",
        "caption",
        "dd",
        "div",
        "dl",
        "dt",
        "fieldset",
        "figcaption",
        "figure",
        "footer",
        "form",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "li",
        "ol",
        "p",
        "section",
        "table",
        "tbody",
        "thead",
        "tfoot",
        "tr",
        "ul",
    }

    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self.parts: list[str] = []

    def _append(self, text: str) -> None:
        if self._skip_depth == 0:
            self.parts.append(text)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
            return
        if tag == "br":
            self._append("\n")
        elif tag in {"td", "th"}:
            self._append(" | ")
        elif tag in self.BLOCK_TAGS:
            self._append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip_depth > 0:
            self._skip_depth -= 1
            return
        if tag in {"td", "th"}:
            self._append(" | ")
        elif tag in self.BLOCK_TAGS or tag == "br":
            self._append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0 and data:
            self.parts.append(data)

    def get_text(self) -> str:
        return normalize_preserved_text("".join(self.parts))


class TableMatrixParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self._in_cell = False
        self._current_cell: list[str] = []
        self._current_row: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
            return
        if self._skip_depth > 0:
            return
        if tag == "tr":
            self._current_row = []
        elif tag in {"td", "th"}:
            self._in_cell = True
            self._current_cell = []
        elif tag == "br" and self._in_cell:
            self._current_cell.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip_depth > 0:
            self._skip_depth -= 1
            return
        if self._skip_depth > 0:
            return
        if tag in {"td", "th"} and self._in_cell:
            self._current_row.append(normalize_preserved_text("".join(self._current_cell)))
            self._current_cell = []
            self._in_cell = False
        elif tag == "tr":
            cleaned_row = [cell for cell in self._current_row if cell]
            if cleaned_row:
                self.rows.append(cleaned_row)
            self._current_row = []

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0 and self._in_cell and data:
            self._current_cell.append(data)


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
                encodings.extend(["euc-kr", "cp949", "utf-8"])

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


def unique(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        value = (item or "").strip()
        if value and value not in seen:
            seen.add(value)
            output.append(value)
    return output


def dedupe_keep_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            output.append(item)
    return output


def normalize_text(text: str) -> str:
    text = unescape(text).replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_preserved_text(text: str) -> str:
    text = unescape(text).replace("\xa0", " ")
    text = text.replace("\r", "")
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"(?:\n[| ]*){3,}", "\n\n", text)
    text = re.sub(r"^\s*\|\s*", "", text, flags=re.M)
    text = re.sub(r"\s+\|", " |", text)
    return text.strip()


def lower_text(text: str) -> str:
    return normalize_text(text).lower()


def extract_seq(url: str) -> str:
    qs = parse_qs(urlparse(url).query)
    return str(qs.get("seq", [""])[0])


def canonicalize_detail_url(url: str) -> str:
    seq = extract_seq(url)
    if not seq:
        return url
    return (
        "https://www.thekkf.or.kr/new_home/news/board/view.php"
        f"?board=board&seq={seq}"
    )


def build_public_detail_url(seq: str) -> str:
    return f"https://www.thekkf.or.kr/new_home/10_etc/01_notice.php?mode=view&seq={seq}"


def is_deleted_notice(html: str) -> bool:
    lowered = lower_text(html)
    markers = [
        "존재하지 않는 글입니다",
        "삭제된 글",
        "삭제된 게시물",
        "없는 글입니다",
    ]
    return any(marker in lowered for marker in markers)


def detect_keywords(title: str) -> tuple[list[str], list[str]]:
    title_l = lower_text(title)
    matched_keywords: list[str] = []
    matched_in: set[str] = set()

    for keyword in KEYWORDS:
        keyword_l = keyword.lower()
        if keyword_l in title_l:
            matched_in.add("title")
            matched_keywords.append(keyword)

    return matched_keywords, sorted(matched_in)


def parse_links_and_images(html: str) -> tuple[list[str], list[str]]:
    parser = LinkImageParser()
    parser.feed(html)
    parser.close()
    return dedupe_keep_order(parser.hrefs), dedupe_keep_order(parser.image_urls)


def extract_text(html: str) -> str:
    parser = TextExtractor()
    parser.feed(html)
    parser.close()
    return parser.get_text()


def extract_rich_text(html: str) -> str:
    parser = RichTextExtractor()
    parser.feed(html)
    parser.close()
    return parser.get_text()


def parse_pagination_links(list_url: str, html: str) -> list[str]:
    hrefs, _ = parse_links_and_images(html)
    page_links: list[str] = [list_url]
    for href in hrefs:
        full_url = urljoin(list_url, href)
        if "list.php" not in full_url:
            continue
        query = parse_qs(urlparse(full_url).query)
        if "page" in query:
            page_links.append(full_url)
    return dedupe_keep_order(page_links)


def parse_detail_links(list_url: str, html: str) -> list[str]:
    hrefs, _ = parse_links_and_images(html)
    detail_links: list[str] = []
    for href in hrefs:
        full_url = urljoin(list_url, href)
        if "view.php" not in full_url:
            continue
        if "board=board" not in full_url:
            continue
        if extract_seq(full_url):
            detail_links.append(canonicalize_detail_url(full_url))
    return dedupe_keep_order(detail_links)


def build_search_url(keyword: str, search_type: str) -> str:
    query = urlencode(
        {
            "board": "board",
            "code": "1",
            "strSearchType": search_type,
            "strSearchWord": keyword,
        }
    )
    return f"https://www.thekkf.or.kr/new_home/news/board/list.php?{query}"


def discover_all_list_pages(start_url: str) -> list[str]:
    queue = [start_url]
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


def collect_candidate_detail_urls() -> list[str]:
    logging.info("Start full board crawl: %s", BASE_LIST_URL)
    list_pages = discover_all_list_pages(BASE_LIST_URL)
    logging.info("Discovered list pages: %s", len(list_pages))
    return collect_detail_urls(list_pages)


def extract_title(view_html: str) -> str:
    patterns = [
        r'<table[^>]*class="[^"]*\bbbs_view\b[^"]*"[^>]*>.*?<th[^>]*>(.*?)</th>',
        r"<title>(.*?)</title>",
    ]
    for pattern in patterns:
        match = re.search(pattern, view_html, re.I | re.S)
        if not match:
            continue
        text = extract_text(match.group(1))
        if text:
            return text
    return ""


def extract_content_iframe_url(view_url: str, view_html: str) -> str | None:
    match = re.search(r'<iframe[^>]+src="([^"]*content\.php\?seq=\d+[^"]*)"', view_html, re.I)
    if not match:
        return None
    return urljoin(view_url, match.group(1))


def parse_published_at(raw_value: str) -> str:
    match = re.search(r"(\d{4})\.(\d{1,2})\.(\d{1,2})", raw_value)
    if not match:
        return ""
    year, month, day = match.groups()
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}T00:00:00+09:00"


def extract_detail_meta(view_html: str) -> tuple[str, str, int | None]:
    match = re.search(
        r'<table[^>]*class="[^"]*\bbbs_view\b[^"]*"[^>]*>.*?<thead>.*?<tr>\s*<td[^>]*>(.*?)</td>',
        view_html,
        re.I | re.S,
    )
    if not match:
        return "", "", None

    meta_text = extract_text(match.group(1))
    published_at_raw = ""
    view_count = None

    date_match = re.search(r"작성일\s*([0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2})", meta_text)
    if date_match:
        published_at_raw = date_match.group(1)

    view_match = re.search(r"조회수\s*([0-9,]+)", meta_text)
    if view_match:
        try:
            view_count = int(view_match.group(1).replace(",", ""))
        except ValueError:
            view_count = None

    return published_at_raw, parse_published_at(published_at_raw), view_count


def extract_body_inner_html(content_html: str) -> str:
    match = re.search(r"<body[^>]*>(.*?)</body>", content_html, re.I | re.S)
    body_html = match.group(1) if match else content_html
    body_html = re.sub(r"<script\b.*?</script>", "", body_html, flags=re.I | re.S)
    return body_html.strip()


def absolutize_html_urls(base_url: str, html: str) -> str:
    def replace_attr(match: re.Match[str]) -> str:
        attr_name = match.group(1)
        quote = match.group(2)
        attr_value = match.group(3).strip()
        if not attr_value or attr_value.startswith(("#", "javascript:", "mailto:", "tel:", "data:")):
            return match.group(0)
        return f'{attr_name}={quote}{urljoin(base_url, attr_value)}{quote}'

    return re.sub(r'(href|src)=([\'"])(.+?)\2', replace_attr, html, flags=re.I | re.S)


def extract_body_assets(content_url: str, body_html: str) -> tuple[str, str, list[str], list[str]]:
    resolved_html = absolutize_html_urls(content_url, body_html)
    link_urls, image_urls = parse_links_and_images(resolved_html)
    resolved_links = [
        urljoin(content_url, link_url)
        for link_url in link_urls
        if not link_url.lower().startswith("javascript:")
    ]
    resolved_images = [urljoin(content_url, image_url) for image_url in image_urls]
    body_text = extract_rich_text(resolved_html)
    return (
        resolved_html,
        body_text,
        dedupe_keep_order(resolved_links),
        dedupe_keep_order(resolved_images),
    )


def extract_tables(body_html: str) -> list[dict[str, object]]:
    tables: list[dict[str, object]] = []
    for index, match in enumerate(re.finditer(r"<table\b.*?</table>", body_html, re.I | re.S), start=1):
        table_html = match.group(0).strip()
        parser = TableMatrixParser()
        parser.feed(table_html)
        parser.close()
        tables.append(
            {
                "index": index,
                "html": table_html,
                "rows": parser.rows,
            }
        )
    return tables


def safe_request_url(url: str) -> str:
    parts = urlsplit(url)
    path = quote(parts.path, safe='/%')
    query = quote(parts.query, safe='=&/%()')
    return urlunsplit((parts.scheme, parts.netloc, path, query, parts.fragment))


def build_direct_attachment_url(view_url: str, href: str) -> str:
    full_url = urljoin(view_url, href)
    parsed = urlparse(full_url)
    filepath = parse_qs(parsed.query).get("filepath", [""])[0]
    if filepath:
        return urljoin(view_url, quote(filepath, safe='/%'))
    return full_url


def extract_pdf_text(url: str) -> str:
    temp_path = None
    try:
        request = Request(safe_request_url(url), headers={**HEADERS, "Referer": url})
        with urlopen(request, timeout=REQUEST_TIMEOUT) as response:
            data = response.read()
        if not data:
            return ""
        fd, temp_path = tempfile.mkstemp(suffix=".pdf")
        os.write(fd, data)
        os.close(fd)
        result = subprocess.run(
            ["/usr/bin/textutil", "-convert", "txt", temp_path, "-stdout"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return ""
        return normalize_preserved_text(result.stdout)
    except Exception:
        return ""
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


def extract_attachments(view_url: str, view_html: str) -> list[dict[str, object]]:
    attachments: list[dict[str, object]] = []

    for match in re.finditer(r"<p[^>]*class=['\"]file['\"][^>]*>(.*?)</p>", view_html, re.I | re.S):
        block = match.group(1)
        label_text = extract_text(re.sub(r"<!--.*?-->", "", block, flags=re.S))
        href_match = re.search(r"href=['\"]([^'\"]+)['\"]", block, re.I)
        if not href_match:
            continue

        raw_href = href_match.group(1).strip()
        direct_url = build_direct_attachment_url(view_url, raw_href)
        file_name = unquote(direct_url.rstrip("/").split("/")[-1])
        file_ext = ""
        if "." in file_name:
            file_ext = "." + file_name.rsplit(".", 1)[-1].lower()

        attachment = {
            "label": label_text or "첨부파일",
            "url": direct_url,
            "file_name": file_name,
            "file_ext": file_ext,
            "text": "",
        }

        if file_ext == ".pdf":
            attachment["text"] = extract_pdf_text(direct_url)

        attachments.append(attachment)

    deduped: list[dict[str, object]] = []
    seen_urls: set[str] = set()
    for attachment in attachments:
        if attachment["url"] in seen_urls:
            continue
        seen_urls.add(attachment["url"])
        deduped.append(attachment)

    return deduped


def parse_notice_detail(detail_url: str) -> NoticeItem | None:
    canonical_url = canonicalize_detail_url(detail_url)
    seq = extract_seq(canonical_url)
    logging.info("Parse detail: %s", canonical_url)
    view_html = fetch_html(canonical_url)
    if is_deleted_notice(view_html):
        return None

    title = extract_title(view_html)
    matched_keywords, matched_in = detect_keywords(title)
    if not matched_keywords:
        return None

    published_at_raw, published_at, view_count = extract_detail_meta(view_html)
    content_url = extract_content_iframe_url(canonical_url, view_html)

    body_html = ""
    body_text = ""
    link_urls: list[str] = []
    image_urls: list[str] = []
    tables: list[dict[str, object]] = []
    attachments = extract_attachments(canonical_url, view_html)
    if content_url:
        content_html = fetch_html(content_url)
        body_html = extract_body_inner_html(content_html)
        body_html, body_text, link_urls, image_urls = extract_body_assets(content_url, body_html)
        tables = extract_tables(body_html)
        time.sleep(REQUEST_SLEEP)
    else:
        body_text = extract_text(view_html)

    return NoticeItem(
        seq=seq,
        title=title,
        url=build_public_detail_url(seq),
        internal_url=canonical_url,
        published_at_raw=published_at_raw,
        published_at=published_at,
        view_count=view_count,
        matched_keywords=matched_keywords,
        matched_in=matched_in,
        body_html=body_html,
        body_text=body_text,
        link_urls=link_urls,
        image_urls=image_urls,
        tables=tables,
        attachments=attachments,
    )


def dedupe_notice_items(items: list[NoticeItem]) -> list[NoticeItem]:
    unique: dict[str, NoticeItem] = {}

    for item in items:
        existing = unique.get(item.seq)
        if existing is None:
            unique[item.seq] = item
            continue

        existing.matched_keywords = dedupe_keep_order(
            existing.matched_keywords + item.matched_keywords
        )
        existing.matched_in = dedupe_keep_order(existing.matched_in + item.matched_in)

        if not existing.title and item.title:
            existing.title = item.title
        if not existing.published_at_raw and item.published_at_raw:
            existing.published_at_raw = item.published_at_raw
        if not existing.published_at and item.published_at:
            existing.published_at = item.published_at
        if existing.view_count is None and item.view_count is not None:
            existing.view_count = item.view_count
        if not existing.body_html and item.body_html:
            existing.body_html = item.body_html
        if not existing.body_text and item.body_text:
            existing.body_text = item.body_text

        existing.link_urls = dedupe_keep_order(existing.link_urls + item.link_urls)
        existing.image_urls = dedupe_keep_order(existing.image_urls + item.image_urls)
        if not existing.tables and item.tables:
            existing.tables = item.tables
        if not existing.attachments and item.attachments:
            existing.attachments = item.attachments

    return list(unique.values())


def filter_title_matched_items(items: list[NoticeItem]) -> list[NoticeItem]:
    filtered: list[NoticeItem] = []

    for item in items:
        matched_keywords, matched_in = detect_keywords(item.title)
        if not matched_keywords:
            logging.info("Skip by final title filter: seq=%s title=%s", item.seq, item.title)
            continue

        item.matched_keywords = matched_keywords
        item.matched_in = matched_in
        filtered.append(item)

    return filtered


def build_index_item(item: NoticeItem) -> dict[str, object]:
    return {
        "seq": item.seq,
        "title": item.title,
        "url": item.url,
        "internal_url": item.internal_url,
        "published_at_raw": item.published_at_raw,
        "published_at": item.published_at,
        "view_count": item.view_count,
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
    unique_items = filter_title_matched_items(dedupe_notice_items(items))
    written_detail_names: set[str] = set()

    for item in unique_items:
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
        "total_count": len(unique_items),
        "detail_dir": "./detail",
        "items": [build_index_item(item) for item in unique_items],
    }
    write_json_file(OUTPUT_JSON, payload)
    logging.info("Saved JSON: %s", OUTPUT_JSON)


def main() -> int:
    setup_logging()
    logging.info("Start KKF notice scraper")

    detail_urls = collect_candidate_detail_urls()
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

    items = filter_title_matched_items(items)
    items.sort(key=lambda item: int(item.seq) if item.seq.isdigit() else 0)
    save_result(items)
    logging.info("Done. matched_items=%s", len(items))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
