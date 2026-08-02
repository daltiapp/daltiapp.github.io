import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const STUDIO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(STUDIO_ROOT, "..");
const PORT = Number(process.env.DALTI_DATA_STUDIO_PORT || 4190);
const HOST = "127.0.0.1";
const IMAGE_PROXY_HOSTS = new Set(["drive.google.com", "drive.usercontent.google.com"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MATCH_KEYS = [
  "applicationEndAt",
  "applicationStartAt",
  "club",
  "detailNotice",
  "detailStatus",
  "endAt",
  "eventType",
  "judge",
  "location",
  "matchTypes",
  "name",
  "startAt",
  "url"
];
const previews = new Map();
const reviewPreviews = new Map();

const DEFAULT_REVIEW_QUEUE_DIR = "review/schedule";
const QUEUE_FILE_PATTERN = /_review_queue\.json$/;

// Source key → label mapping for display
const SOURCE_LABELS = {
  kkf: "한국애견연맹",
  kau: "한국어질리티연합"
};

// Resolved lazily so tests can redirect the queue directory with
// DALTI_REVIEW_QUEUE_DIR instead of touching the operator's live queue.
export function reviewQueueDir() {
  const configured = String(process.env.DALTI_REVIEW_QUEUE_DIR || "").trim();
  return configured || DEFAULT_REVIEW_QUEUE_DIR;
}

// List all *_review_queue.json files in the queue directory
async function listQueueFiles() {
  const dirPath = safeRepoPath(reviewQueueDir());
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter(e => e.isFile() && QUEUE_FILE_PATTERN.test(e.name))
    .map(e => ({
      name: e.name,
      key: e.name.replace(/_review_queue\.json$/, ""),
      relativePath: `${reviewQueueDir()}/${e.name}`,
      absolutePath: path.join(dirPath, e.name)
    }));
}

async function loadSingleQueueFile(fileMeta) {
  try {
    return await readJson(fileMeta.absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function loadAllQueues() {
  const files = await listQueueFiles();
  const results = [];
  for (const fileMeta of files) {
    const data = await loadSingleQueueFile(fileMeta);
    if (data) results.push({ fileMeta, data });
  }
  return results;
}

// Merge all queue files into a unified response with source tracking
async function loadMergedReviewQueue() {
  const queues = await loadAllQueues();
  if (queues.length === 0) {
    return {
      schemaVersion: 1,
      items: [],
      counts: { total: 0, pending_review: 0, approved: 0, rejected: 0, new: 0, changed: 0 },
      sources: []
    };
  }

  const allItems = [];
  const sources = [];

  for (const { fileMeta, data } of queues) {
    const sourceKey = fileMeta.key;
    const sourceLabel = data.sourceLabel || SOURCE_LABELS[sourceKey] || sourceKey;
    const items = (data.items || []).map(item => ({
      ...item,
      _source: { key: sourceKey, label: sourceLabel, file: fileMeta.relativePath }
    }));
    allItems.push(...items);

    const counts = data.counts || computeCounts(data.items || []);
    sources.push({
      key: sourceKey,
      label: sourceLabel,
      file: fileMeta.relativePath,
      generatedAt: data.generatedAt || null,
      counts
    });
  }

  const counts = computeCounts(allItems);
  return { schemaVersion: 1, items: allItems, counts, sources };
}

function computeCounts(items) {
  return {
    total: items.length,
    pending_review: items.filter(i => i.status === "pending_review").length,
    approved: items.filter(i => i.status === "approved").length,
    rejected: items.filter(i => i.status === "rejected").length,
    new: items.filter(i => i.diffKind === "new").length,
    changed: items.filter(i => i.diffKind === "changed").length
  };
}

// Find which queue file contains a given item by id
async function findItemInQueues(itemId) {
  const queues = await loadAllQueues();
  for (const { fileMeta, data } of queues) {
    const item = (data.items || []).find(i => i.id === itemId);
    if (item) return { fileMeta, data, item };
  }
  return null;
}

// Save a single queue file (only the one that was modified)
async function saveSingleQueueFile(fileMeta, queueData) {
  const filePath = fileMeta.absolutePath;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // Recompute counts for this file
  queueData.counts = computeCounts(queueData.items || []);
  const temporary = `${filePath}.dalti-data-studio-${process.pid}.tmp`;
  await fs.writeFile(temporary, jsonText(queueData), "utf8");
  await fs.rename(temporary, filePath);
}

function fieldIsFilled(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  return value !== null && value !== undefined;
}

// A warning is resolved once its field carries a value. Without this the
// image-only fields (location, judge) would stay blocking forever and no
// reviewed item could ever be applied.
export function resolveWarnings(item) {
  const warnings = Array.isArray(item.warnings) ? item.warnings : [];
  return warnings.filter(warning => {
    if (!warning || !warning.field) return true;
    if (!MATCH_KEYS.includes(warning.field)) return true;
    return !fieldIsFilled(item.draft ? item.draft[warning.field] : undefined);
  });
}

// Kept for backward compatibility in apply flow
function updateQueueCounts(queue) {
  queue.counts = computeCounts(queue.items || []);
  return queue;
}

function diffQueueItemWithActive(item, activeMatches) {
  if (!item.draft || !item.draft.url) return { syncStatus: "unknown" };
  const existing = activeMatches.find(m => m.url === item.draft.url);
  if (!existing) return { syncStatus: "not_applied" };
  const draftKeys = MATCH_KEYS.filter(k => JSON.stringify(item.draft[k]) !== JSON.stringify(existing[k]));
  if (draftKeys.length === 0) return { syncStatus: "applied" };
  return { syncStatus: "changed", changedFields: draftKeys };
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function hash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function safeRepoPath(relativePath) {
  const resolved = path.resolve(REPO_ROOT, relativePath.replace(/^\/+/, ""));
  if (!resolved.startsWith(`${REPO_ROOT}${path.sep}`)) {
    throw new Error("활성 데이터 경로가 저장소 밖을 가리킵니다.");
  }
  return resolved;
}

export async function loadActiveData() {
  const manifestPath = path.join(REPO_ROOT, "agilitykorea-manifest.json");
  const manifest = await readJson(manifestPath);
  if (!/^\/ak\/v\d+$/.test(manifest.basePath)) {
    throw new Error("manifest basePath가 /ak/vN 형식이 아닙니다.");
  }
  const base = safeRepoPath(manifest.basePath);
  const matchPath = safeRepoPath(path.join(manifest.basePath, manifest.files.match));
  const venuePath = safeRepoPath(path.join(manifest.basePath, manifest.files.venue));
  const noticePath = safeRepoPath(path.join(manifest.basePath, manifest.files.notice));
  const [matches, venues, notices] = await Promise.all([
    readJson(matchPath),
    readJson(venuePath),
    readJson(noticePath)
  ]);
  return {
    manifest,
    manifestPath,
    base,
    matchPath,
    venuePath,
    noticePath,
    matches,
    venues,
    notices
  };
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: REPO_ROOT,
    maxBuffer: 1024 * 1024
  });
  return stdout.trim();
}

function changedFilesFromStatus(status) {
  return status
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const value = line.slice(3).trim().replace(/^"|"$/g, "");
      return value.includes(" -> ") ? value.split(" -> ").at(-1) : value;
    });
}

export async function repositoryHealth() {
  const [status, branch, remoteUrl, head, upstream] = await Promise.all([
    git(["status", "--porcelain"]),
    git(["branch", "--show-current"]),
    git(["remote", "get-url", "origin"]),
    git(["rev-parse", "--short", "HEAD"]),
    git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]).catch(() => "")
  ]);
  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const counts = await git(["rev-list", "--left-right", "--count", `${upstream}...HEAD`]);
    [behind, ahead] = counts.split(/\s+/).map(Number);
  }
  return {
    clean: status === "",
    status: status ? status.split("\n").slice(0, 50) : [],
    changedFiles: changedFilesFromStatus(status),
    branch,
    remoteUrl,
    head,
    upstream,
    ahead,
    behind,
    synced: status === "" && ahead === 0 && behind === 0
  };
}

function validateCommitMessage(subject, body) {
  if (!subject || subject.length > 100) {
    throw new Error("커밋 제목은 1~100자로 입력하세요.");
  }
  const bilingualFormat = /[가-힣][\s\S]*\([A-Za-z][\s\S]*\)/;
  if (!bilingualFormat.test(subject) || !bilingualFormat.test(body)) {
    throw new Error("커밋 제목과 내용은 모두 한글(English) 형식으로 작성하세요.");
  }
}

function assertCommitPathsSafe(files) {
  const blocked = files.find((file) =>
    /(^|\/)(\.env(?:\..*)?|keystore\.properties|[^/]+\.(?:pem|key|p12|jks))$/i.test(file)
    || file.startsWith(".git/")
    || file.includes("/node_modules/")
  );
  if (blocked) {
    throw new Error(`보안상 자동 커밋할 수 없는 파일이 포함돼 있습니다: ${blocked}`);
  }
}

async function commitAndPushRepository(body) {
  if (body.confirmed !== true) {
    throw new Error("변경 파일과 푸시 대상을 직접 확인해야 합니다.");
  }
  const before = await repositoryHealth();
  if (!before.branch) throw new Error("detached HEAD에서는 자동 커밋·푸시할 수 없습니다.");
  if (before.behind > 0) {
    throw new Error(`원격 브랜치가 ${before.behind}개 커밋 앞서 있습니다. 먼저 최신 코드를 반영하세요.`);
  }
  let commitHash = "";
  if (!before.clean) {
    assertCommitPathsSafe(before.changedFiles);
    const subject = String(body.subject || "").trim();
    const messageBody = String(body.body || "").trim();
    validateCommitMessage(subject, messageBody);
    await git(["add", "-A", "--", ...before.changedFiles]);
    try {
      await git(["commit", "-m", subject, "-m", messageBody]);
      commitHash = await git(["rev-parse", "--short", "HEAD"]);
    } catch (error) {
      await git(["restore", "--staged", "--", ...before.changedFiles]).catch(() => {});
      throw new Error(`커밋에 실패했습니다. 로컬 파일은 유지했습니다: ${error.message}`);
    }
  }
  const afterCommit = await repositoryHealth();
  if (afterCommit.ahead > 0) {
    try {
      await git(["push", "origin", afterCommit.branch]);
    } catch (error) {
      throw new Error(
        `커밋 ${commitHash || afterCommit.head}은 유지됐지만 푸시에 실패했습니다: ${error.message}`
      );
    }
  }
  return {
    ok: true,
    commit: commitHash || afterCommit.head,
    branch: afterCommit.branch,
    pushed: afterCommit.ahead > 0,
    health: await repositoryHealth()
  };
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

async function validatePublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("유효한 원본 URL을 입력하세요.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("http 또는 https 원본만 가져올 수 있습니다.");
  }
  if (url.username || url.password) {
    throw new Error("인증정보가 포함된 URL은 가져올 수 없습니다.");
  }
  const records = await dns.lookup(url.hostname, { all: true });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("로컬·사설 네트워크 주소는 가져올 수 없습니다.");
  }
  return url;
}

async function fetchPublicPage(rawUrl) {
  let current = await validatePublicUrl(rawUrl);
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "DaltiDataStudio/0.1 (+local operator tool)",
          Accept: "text/html,application/xhtml+xml"
        }
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("원본 사이트의 이동 주소가 비어 있습니다.");
      current = await validatePublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) {
      throw new Error(`원본 사이트 응답 오류 (${response.status})`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      throw new Error("현재는 HTML 원본만 분석할 수 있습니다.");
    }
    const html = await response.text();
    if (html.length > 2_000_000) {
      throw new Error("원본 문서가 2MB를 넘어 분석을 중단했습니다.");
    }
    return { html, finalUrl: current.toString() };
  }
  throw new Error("원본 사이트의 리디렉션이 너무 많습니다.");
}

const IG_APP_ID = "936619743392459";

function extractInstagramUsername(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.includes("instagram.com")) return null;
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    // Profile URL: /username or /username/
    if (parts.length === 1 && !["p", "reel", "stories", "explore"].includes(parts[0])) {
      return parts[0];
    }
    return null;
  } catch {
    return null;
  }
}

function extractInstagramPostShortcode(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.includes("instagram.com")) return null;
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    // Post URL: /p/{shortcode} or /reel/{shortcode}
    if ((parts[0] === "p" || parts[0] === "reel") && parts[1]) {
      return parts[1];
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchInstagramProfile(username) {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-IG-App-ID": IG_APP_ID,
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "*/*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.instagram.com/",
        "Sec-Fetch-Site": "same-origin"
      }
    });
    if (!response.ok) {
      throw new Error(`Instagram 프로필 API 응답 오류 (${response.status})`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchInstagramPost(shortcode) {
  const url = `https://www.instagram.com/api/v1/media/${shortcode}/info/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-IG-App-ID": IG_APP_ID,
        "Accept": "*/*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });
    if (!response.ok) {
      throw new Error(`Instagram 게시물 API 응답 오류 (${response.status})`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractInstagramCaptions(profileData) {
  const user = profileData?.data?.user;
  if (!user) return "";

  const texts = [];
  // Biography
  if (user.biography) texts.push(user.biography);

  // Recent posts from timeline
  const timelineEdges = user.edge_owner_to_timeline_media?.edges || [];
  for (const edge of timelineEdges.slice(0, 12)) {
    const caption = edge.node?.edge_media_to_caption?.edges?.[0]?.node?.text;
    if (caption) texts.push(caption);
  }

  // IGTV / Reels / Felix videos
  const felixEdges = user.edge_felix_video_timeline?.edges || [];
  for (const edge of felixEdges.slice(0, 6)) {
    const caption = edge.node?.edge_media_to_caption?.edges?.[0]?.node?.text;
    if (caption) texts.push(caption);
  }

  return texts.join("\n---\n").slice(0, 80_000);
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractMeta(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    )
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]);
  }
  return "";
}

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeDate(year, month, day, hour = "00", minute = "00") {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function extractDates(text) {
  const values = [];
  const pattern =
    /(20\d{2})\s*[년./-]\s*(\d{1,2})\s*[월./-]\s*(\d{1,2})\s*일?(?:\s*(\d{1,2})\s*(?:시|:)\s*(\d{1,2})?)?/g;
  let match;
  while ((match = pattern.exec(text)) && values.length < 4) {
    values.push(normalizeDate(match[1], match[2], match[3], match[4], match[5]));
  }
  return values;
}

function findKnownValue(text, values) {
  return values
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((value) => text.includes(value)) || "";
}

function compactTitle(text) {
  return text
    .split(/\n|[|｜]/)
    .map((line) => line.trim())
    .find((line) => /대회|어질리티|AGILITY|Agility/.test(line))
    ?.slice(0, 120) || "";
}

export function analyzeMatchText(text, sourceUrl, activeData) {
  const dates = extractDates(text);
  const venueNames = activeData.venues.venues.map((venue) => venue.name);
  const clubs = activeData.matches.competitions.map((item) => item.club);
  const location = findKnownValue(text, venueNames);
  const club = findKnownValue(text, clubs);
  const eventType =
    ["승급전", "랭킹전", "선발전"].find((type) => text.includes(type)) || "대회";
  const matchTypes = [
    "비기너",
    "노비스1",
    "노비스2",
    "점핑0",
    "점핑",
    "어질리티",
    "LV1",
    "LV2",
    "LV3",
    "펜타슬론",
    "바이애슬론",
    "스누커",
    "갬블러"
  ].filter((type) => text.toLowerCase().includes(type.toLowerCase()));
  const draft = {
    applicationEndAt: dates[3] || "",
    applicationStartAt: dates[2] || "",
    club,
    detailNotice: "",
    detailStatus: "detail_ready",
    endAt: dates[1] || dates[0] || "",
    eventType,
    judge: [],
    location,
    matchTypes: [...new Set(matchTypes)],
    name: compactTitle(text),
    startAt: dates[0] || "",
    url: sourceUrl || ""
  };
  const fieldEvidence = {};
  for (const [key, value] of Object.entries(draft)) {
    const present = Array.isArray(value) ? value.length > 0 : Boolean(value);
    if (present) {
      fieldEvidence[key] = {
        label: key === "eventType" ? "원문 + repo 패턴" : "원본",
        confidence: ["url", "startAt", "endAt", "location"].includes(key)
          ? "high"
          : "review"
      };
    }
  }
  return { draft, fieldEvidence };
}

export function analyzeVenueText(text, activeData) {
  const known = activeData.venues.venues.find(
    (venue) => text.includes(venue.name) || text.includes(venue.location.address)
  );
  const coordinate = text.match(
    /(?:위도|lat(?:itude)?)\s*[:=]?\s*(-?\d{2,3}\.\d+)[^\d-]+(?:경도|lng|lon(?:gitude)?)\s*[:=]?\s*(-?\d{2,3}\.\d+)/i
  );
  return {
    name: known?.name || "",
    location: {
      name: known?.name || "",
      address: known?.location.address || "",
      latitude: coordinate?.[1] || known?.location.latitude || "",
      longitude: coordinate?.[2] || known?.location.longitude || ""
    },
    photos: known?.photos || []
  };
}

function asIso(value) {
  if (!value) return "";
  return value.length === 16 ? `${value}:00` : value;
}

function canonicalMatch(draft) {
  const canonical = {
    applicationEndAt: asIso(String(draft.applicationEndAt || "")),
    applicationStartAt: asIso(String(draft.applicationStartAt || "")),
    club: String(draft.club || "").trim(),
    detailNotice: String(draft.detailNotice || "").trim(),
    detailStatus: String(draft.detailStatus || "detail_ready"),
    endAt: asIso(String(draft.endAt || "")),
    eventType: String(draft.eventType || "").trim(),
    judge: [...new Set((draft.judge || []).map((item) => String(item).trim()).filter(Boolean))],
    location: String(draft.location || "").trim(),
    matchTypes: [
      ...new Set((draft.matchTypes || []).map((item) => String(item).trim()).filter(Boolean))
    ],
    name: String(draft.name || "").trim(),
    startAt: asIso(String(draft.startAt || "")),
    url: String(draft.url || "").trim()
  };
  return Object.fromEntries(MATCH_KEYS.map((key) => [key, canonical[key]]));
}

function isIsoOrEmpty(value) {
  return value === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value);
}

export function validateMatch(draft, activeData) {
  const item = canonicalMatch(draft);
  const missing = ["name", "club", "eventType", "location", "startAt", "endAt"].filter(
    (key) => !item[key]
  );
  const exactKeys =
    JSON.stringify(Object.keys(item)) === JSON.stringify(MATCH_KEYS);
  const datesValid = [
    item.applicationStartAt,
    item.applicationEndAt,
    item.startAt,
    item.endAt
  ].every(isIsoOrEmpty);
  const duplicate = activeData.matches.competitions.find(
    (existing) =>
      (item.url && existing.url === item.url) ||
      (existing.name === item.name && existing.startAt === item.startAt)
  );
  const venueLinked = activeData.venues.venues.some(
    (venue) => venue.name === item.location
  );
  let urlIsDetail = !item.url;
  if (item.url) {
    try {
      const parsedUrl = new URL(item.url);
      urlIsDetail =
        ["http:", "https:"].includes(parsedUrl.protocol) &&
        !["instagram.com", "facebook.com", "linktr.ee"].some((host) =>
          parsedUrl.hostname.includes(host)
        );
    } catch {
      urlIsDetail = false;
    }
  }
  const checks = [
    {
      id: "schema",
      label: "13개 필드",
      detail:
        exactKeys && datesValid && !missing.length
          ? "필수 필드와 ISO 날짜 형식 통과"
          : `확인 필요: ${missing.join(", ") || "날짜 형식"}`,
      status: exactKeys && datesValid && !missing.length ? "pass" : "warn"
    },
    {
      id: "url",
      label: "상세 URL 원문 일치",
      detail: item.url
        ? urlIsDetail
          ? "원본 상세 주소가 입력됨"
          : "SNS 링크가 아닌 실제 상세 주소 권장"
        : "상세 주소가 비어 있어 운영자 확인 필요",
      status: item.url && urlIsDetail ? "pass" : "warn"
    },
    {
      id: "venue",
      label: "장소 데이터 연결",
      detail: venueLinked ? "활성 venue.json에 같은 이름이 있음" : "장소 JSON에서 찾지 못함",
      status: venueLinked ? "pass" : "warn"
    },
    {
      id: "duplicate",
      label: "중복 일정",
      detail: duplicate ? "같은 URL 또는 대회명·시작일 일정이 있음" : "중복 없음",
      status: duplicate ? "warn" : "pass"
    },
    {
      id: "push",
      label: "푸시 안전 가드",
      detail: "변경 1건 · 앱 푸시는 실행하지 않음",
      status: "pass"
    }
  ];
  const blocking = !exactKeys || !datesValid || missing.length > 0 || Boolean(duplicate);
  return { item, checks, blocking };
}

export function validateVenue(draft, activeData) {
  const item = {
    name: String(draft.name || "").trim(),
    location: {
      name: String(draft.location?.name || draft.name || "").trim(),
      address: String(draft.location?.address || "").trim(),
      latitude: Number(draft.location?.latitude),
      longitude: Number(draft.location?.longitude)
    },
    photos: (draft.photos || []).map((photo) => String(photo).trim()).filter(Boolean)
  };
  const complete =
    item.name &&
    item.location.name === item.name &&
    item.location.address &&
    Number.isFinite(item.location.latitude) &&
    item.location.latitude >= -90 &&
    item.location.latitude <= 90 &&
    Number.isFinite(item.location.longitude) &&
    item.location.longitude >= -180 &&
    item.location.longitude <= 180;
  const duplicate = activeData.venues.venues.some((venue) => venue.name === item.name);
  const photosValid = item.photos.every((photo) => {
    try {
      return ["http:", "https:"].includes(new URL(photo).protocol);
    } catch {
      return false;
    }
  });
  const checks = [
    {
      id: "schema",
      label: "장소 스키마",
      detail: complete ? "이름·주소·좌표 형식 통과" : "필수 필드 또는 좌표 확인 필요",
      status: complete ? "pass" : "warn"
    },
    {
      id: "duplicate",
      label: "중복 장소",
      detail: duplicate ? "같은 이름의 장소가 이미 있음" : "중복 없음",
      status: duplicate ? "warn" : "pass"
    },
    {
      id: "photos",
      label: "사진 URL",
      detail: photosValid ? `${item.photos.length}개 URL 형식 통과` : "유효하지 않은 URL 있음",
      status: photosValid ? "pass" : "warn"
    },
    {
      id: "manifest",
      label: "활성 manifest",
      detail: `${activeData.manifest.basePath}의 files.venue 사용`,
      status: "pass"
    },
    {
      id: "push",
      label: "푸시 안전 가드",
      detail: "장소 변경은 앱 푸시를 실행하지 않음",
      status: "pass"
    }
  ];
  return { item, checks, blocking: !complete || duplicate || !photosValid };
}

function kstParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  })
    .formatToParts(new Date())
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return parts;
}

function kstTimestamp() {
  const now = kstParts();
  return `${now.year}-${now.month}-${now.day}T${now.hour}:${now.minute}:${now.second}+09:00`;
}

function nextManifest(manifest) {
  const now = kstParts();
  const day = `${now.year}${now.month}${now.day}`;
  const current = String(manifest.dataVersion || "");
  const suffix = current.startsWith(`${day}.`)
    ? Number(current.split(".")[1] || 0) + 1
    : 1;
  const dataVersion = `${day}.${suffix}`;
  const baseVersion = String(manifest.basePath).match(/\/ak\/(v\d+)$/)?.[1];
  if (!baseVersion) {
    throw new Error("manifest basePath에서 활성 데이터 버전을 확인할 수 없습니다.");
  }
  return {
    ...manifest,
    dataVersion,
    forceRefreshKey: `${baseVersion}:${dataVersion}`,
    updatedAt: `${now.year}-${now.month}-${now.day}T${now.hour}:${now.minute}:${now.second}+09:00`
  };
}

function relative(file) {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

function hasBlockingWorkspaceChanges(health) {
  return health.status.some((line) => {
    const changedPath = line.slice(3).trim().replace(/^"|"$/g, "");
    return !changedPath.startsWith("data-studio/");
  });
}

async function createPreview(mode, draft, source) {
  const [activeData, health] = await Promise.all([loadActiveData(), repositoryHealth()]);
  if (hasBlockingWorkspaceChanges(health)) {
    throw new Error(
      `저장소에 기존 변경이 있어 미리보기를 확정할 수 없습니다: ${health.status.join(", ")}`
    );
  }
  const validation =
    mode === "venue"
      ? validateVenue(draft, activeData)
      : validateMatch(draft, activeData);
  if (validation.blocking) {
    const reasons = validation.checks
      .filter((check) => check.status !== "pass")
      .map((check) => check.label)
      .join(", ");
    throw new Error(`확정 전 검사를 통과하지 못했습니다: ${reasons}`);
  }
  const targetPath = mode === "venue" ? activeData.venuePath : activeData.matchPath;
  const currentData = mode === "venue" ? activeData.venues : activeData.matches;
  const nextData =
    mode === "venue"
      ? { venues: [...currentData.venues, validation.item] }
      : { competitions: [...currentData.competitions, validation.item] };
  const manifestNext = nextManifest(activeData.manifest);
  const targetBefore = await fs.readFile(targetPath, "utf8");
  const manifestBefore = await fs.readFile(activeData.manifestPath, "utf8");
  const targetAfter = jsonText(nextData);
  const manifestAfter = jsonText(manifestNext);
  const previewId = crypto.randomUUID();
  const files = [relative(targetPath), relative(activeData.manifestPath)];
  const currentCount =
    mode === "venue"
      ? activeData.venues.venues.length
      : activeData.matches.competitions.length;
  const manifestFields = (value) => ({
    service: value.service,
    schemaVersion: value.schemaVersion,
    dataVersion: value.dataVersion,
    forceRefreshKey: value.forceRefreshKey,
    basePath: value.basePath,
    updatedAt: value.updatedAt
  });
  const beforeExcerpt = {
    target: files[0],
    currentCount,
    manifest: manifestFields(activeData.manifest)
  };
  const afterExcerpt = {
    operation: "append",
    target: files[0],
    added: validation.item,
    resultingCount: currentCount + 1,
    manifest: manifestFields(manifestNext)
  };
  const record = {
    createdAt: Date.now(),
    mode,
    branch: health.branch,
    source,
    files: [
      {
        path: targetPath,
        relative: files[0],
        before: targetBefore,
        after: targetAfter,
        hash: hash(targetBefore)
      },
      {
        path: activeData.manifestPath,
        relative: files[1],
        before: manifestBefore,
        after: manifestAfter,
        hash: hash(manifestBefore)
      }
    ]
  };
  previews.set(previewId, record);
  return {
    previewId,
    branch: health.branch,
    files,
    checks: validation.checks,
    before: JSON.stringify(beforeExcerpt, null, 2),
    after: JSON.stringify(afterExcerpt, null, 2),
    commit:
      mode === "venue"
        ? {
            subject: "대회 장소 추가(Add competition venue)",
            body:
              "확인된 원본을 기준으로 장소 정보와 데이터 버전을 반영(Apply the verified venue and data version)"
          }
        : {
            subject: "대회 일정 추가(Add competition schedule)",
            body:
              "확인된 원본을 기준으로 대회 일정과 데이터 버전을 반영(Apply the verified competition schedule and data version)"
          }
  };
}

async function applyPreview(body) {
  if (!body.confirmedDiff || !body.confirmedPush) {
    throw new Error("변경 내용과 푸시 대상을 모두 직접 확인해야 합니다.");
  }
  const preview = previews.get(body.previewId);
  if (!preview) throw new Error("미리보기가 만료됐습니다. 다시 생성하세요.");
  if (Date.now() - preview.createdAt > 20 * 60 * 1000) {
    previews.delete(body.previewId);
    throw new Error("미리보기 생성 후 20분이 지나 다시 확인해야 합니다.");
  }
  const health = await repositoryHealth();
  if (!health.clean || health.branch !== preview.branch) {
    throw new Error("미리보기 이후 저장소 상태 또는 브랜치가 바뀌었습니다.");
  }
  for (const file of preview.files) {
    const current = await fs.readFile(file.path, "utf8");
    if (hash(current) !== file.hash) {
      throw new Error(`${file.relative} 파일이 미리보기 이후 변경됐습니다.`);
    }
  }
  for (const file of preview.files) {
    const temporary = `${file.path}.dalti-data-studio-${process.pid}.tmp`;
    await fs.writeFile(temporary, file.after, "utf8");
    await fs.rename(temporary, file.path);
  }
  const relativeFiles = preview.files.map((file) => file.relative);
  let commitHash = "";
  try {
    await git(["add", "--", ...relativeFiles]);
    const subject = String(body.subject || "").trim();
    const messageBody = String(body.body || "").trim();
    if (!subject || subject.length > 100) {
      throw new Error("커밋 제목은 1~100자로 입력하세요.");
    }
    const bilingualFormat = /[가-힣][\s\S]*\([A-Za-z][\s\S]*\)/;
    if (!bilingualFormat.test(subject) || !bilingualFormat.test(messageBody)) {
      throw new Error("커밋 제목과 내용은 모두 한글(English) 형식으로 작성하세요.");
    }
    await git([
      "commit",
      "-m",
      subject,
      "-m",
      messageBody
    ]);
    commitHash = await git(["rev-parse", "--short", "HEAD"]);
    await git(["push", "origin", preview.branch]);
  } catch (error) {
    if (!commitHash) {
      await git(["restore", "--staged", "--", ...relativeFiles]).catch(() => {});
      for (const file of preview.files) {
        await fs.writeFile(file.path, file.before, "utf8");
      }
    }
    throw new Error(
      commitHash
        ? `커밋 ${commitHash}은 생성됐지만 푸시에 실패했습니다: ${error.message}`
        : `파일을 원복했습니다. 커밋에 실패했습니다: ${error.message}`
    );
  }
  previews.delete(body.previewId);
  return { ok: true, commit: commitHash, branch: preview.branch };
}

async function parseBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("요청 본문은 1MB 이하여야 합니다.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function imageProxyTarget(value) {
  const target = new URL(String(value || ""));
  if (target.protocol !== "https:" || !IMAGE_PROXY_HOSTS.has(target.hostname)) {
    throw new Error("허용되지 않은 이미지 주소입니다.");
  }
  return target;
}

async function sendProxiedImage(res, value) {
  let target = imageProxyTarget(value);
  let response;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    response = await fetch(target, { redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location || redirectCount === 3) throw new Error("이미지 리디렉션을 확인하지 못했습니다.");
    target = imageProxyTarget(new URL(location, target).toString());
  }
  if (!response.ok) {
    throw new Error(`이미지를 가져오지 못했습니다(${response.status}).`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("이미지 응답 형식이 아닙니다.");
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_IMAGE_BYTES) {
    throw new Error("이미지 크기가 8MB를 초과합니다.");
  }
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=3600"
  });
  res.end(body);
}

export function healthStatus() {
  return {
    service: "dalti-data-studio",
    pid: process.pid,
    port: PORT,
    repoRoot: REPO_ROOT
  };
}

async function apiHandler(req, res) {
  try {
    if (req.method === "GET" && req.url?.startsWith("/api/image?")) {
      const requestURL = new URL(req.url, `http://${HOST}:${PORT}`);
      await sendProxiedImage(res, requestURL.searchParams.get("url"));
      return;
    }

    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, healthStatus());
      return;
    }

    if (req.method === "GET" && req.url === "/api/state") {
      const [activeData, health, historyRaw] = await Promise.all([
        loadActiveData(),
        repositoryHealth(),
        git(["log", "-10", "--pretty=format:%h%x09%cs%x09%s"])
      ]);
      const history = historyRaw.split("\n").filter(Boolean).map((line) => {
        const [hashValue, date, ...subject] = line.split("\t");
        return { hash: hashValue, date, subject: subject.join("\t") };
      });
      sendJson(res, 200, {
        manifest: activeData.manifest,
        counts: {
          matches: activeData.matches.competitions.length,
          venues: activeData.venues.venues.length,
          notices: activeData.notices.items.length
        },
        notices: activeData.notices.items,
        datasets: {
          matches: activeData.matches.competitions,
          venues: activeData.venues.venues,
          matchPath: relative(activeData.matchPath),
          venuePath: relative(activeData.venuePath)
        },
        health,
        history,
        defaultEvidence: [
          {
            label: "활성 manifest",
            value: `${activeData.manifest.basePath} · schemaVersion ${activeData.manifest.schemaVersion}`
          },
          {
            label: "repo 패턴",
            value: `대회 ${activeData.matches.competitions.length}건 · 장소 ${activeData.venues.venues.length}건`
          },
          {
            label: "운영 정책",
            value: "13개 필드 · 실제 상세 URL · 3건 이상 푸시 차단"
          }
        ],
        references: [
          {
            title: "AgilityKorea Active Data Contract",
            detail: "manifest 진입점, 활성 버전, match 13개 필드 계약",
            path: "AGILITYKOREA_DATA_VERSIONING.md"
          },
          {
            title: "Push Safety Policy",
            detail: "3건 이상 차단, 최근 2일 공지, 상태 오염 대응",
            path: "../agility-scraper/PUSH_SAFETY_POLICY.md"
          },
          {
            title: "Notice Schema",
            detail: "목록·상세 자연키, pretty JSON, 재생성 운영 계약",
            path: "../agility-scraper/NOTICE_SCHEMA.md"
          }
        ]
      });
      return;
    }

    if (req.method === "GET" && req.url === "/api/repository") {
      sendJson(res, 200, await repositoryHealth());
      return;
    }

    if (req.method === "POST" && req.url === "/api/repository/commit-push") {
      sendJson(res, 200, await commitAndPushRepository(await parseBody(req)));
      return;
    }

    if (req.method === "POST" && req.url === "/api/analyze") {
      const body = await parseBody(req);
      if (!["match", "venue"].includes(body.mode)) {
        throw new Error("대회 또는 장소 작업에서만 원본 분석을 사용할 수 있습니다.");
      }
      const activeData = await loadActiveData();
      let sourceText = String(body.text || "").trim();
      let finalUrl = String(body.url || "").trim();
      let sourceLabel = body.sourceType === "instagram" ? "Instagram 게시물" : "원본 사이트";
      if (body.sourceType === "instagram") {
        // Instagram 내부 API를 통한 게시물 데이터 가져오기
        const username = extractInstagramUsername(finalUrl);
        const shortcode = extractInstagramPostShortcode(finalUrl);
        if (username) {
          const profileData = await fetchInstagramProfile(username);
          sourceText = extractInstagramCaptions(profileData);
          finalUrl = `https://www.instagram.com/${username}/`;
        } else if (shortcode) {
          // 개별 게시물 URL인 경우 프로필 URL로 가이드
          throw new Error(
            "Instagram 프로필 URL을 입력하세요 (예: https://www.instagram.com/korea_kennel_agility/). 개별 게시물 URL은 아직 지원하지 않습니다."
          );
        } else {
          throw new Error(
            "Instagram 프로필 URL을 인식하지 못했습니다. https://www.instagram.com/계정명/ 형식으로 입력하세요."
          );
        }
      } else if (body.sourceType !== "text") {
        const page = await fetchPublicPage(finalUrl);
        finalUrl = page.finalUrl;
        sourceText = [
          extractMeta(page.html, "og:title"),
          extractMeta(page.html, "og:description"),
          htmlToText(page.html)
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 80_000);
      } else {
        sourceLabel = "붙여넣은 원문";
      }
      if (!sourceText) {
        throw new Error(
          "공개 원문을 읽지 못했습니다. 게시글 본문 또는 이미지 OCR 텍스트를 붙여넣으세요."
        );
      }
      const evidence = [
        { label: sourceLabel, value: finalUrl || "사용자 제공 텍스트", url: finalUrl || undefined },
        {
          label: "repo 패턴",
          value: `활성 대회 ${activeData.matches.competitions.length}건과 장소 ${activeData.venues.venues.length}건 비교`
        },
        {
          label: "정책 문서",
          value: "match 13개 필드 · URL 자연키 · 사람 승인 필수"
        }
      ];
      if (body.mode === "venue") {
        const draft = analyzeVenueText(sourceText, activeData);
        sendJson(res, 200, {
          draft,
          evidence,
          checks: validateVenue(draft, activeData).checks,
          notice: "주소와 좌표는 지도 원본에서 반드시 재확인하세요."
        });
      } else {
        const result = analyzeMatchText(sourceText, finalUrl, activeData);
        sendJson(res, 200, {
          ...result,
          evidence,
          checks: validateMatch(result.draft, activeData).checks,
          notice:
            body.sourceType === "instagram"
              ? "Instagram은 보조 근거입니다. 상세 URL은 실제 대회 상세 페이지로 교체하세요."
              : ""
        });
      }
      return;
    }

    if (req.method === "POST" && req.url === "/api/preview") {
      const body = await parseBody(req);
      if (!["match", "venue"].includes(body.mode)) {
        throw new Error("공지 JSON은 직접 미리보기·수정할 수 없습니다.");
      }
      sendJson(res, 200, await createPreview(body.mode, body.draft, body.source));
      return;
    }

    if (req.method === "POST" && req.url === "/api/apply") {
      sendJson(res, 200, await applyPreview(await parseBody(req)));
      return;
    }

    // === Review Queue API ===
    if (req.method === "GET" && req.url === "/api/review/queue") {
      const [merged, activeData] = await Promise.all([loadMergedReviewQueue(), loadActiveData()]);
      const activeMatches = activeData.matches.competitions || [];
      const items = merged.items.map(item => ({
        ...item,
        _sync: diffQueueItemWithActive(item, activeMatches)
      }));
      sendJson(res, 200, { ...merged, items });
      return;
    }

    if (req.method === "POST" && req.url === "/api/review/item") {
      const body = await parseBody(req);
      if (!body.id) throw new Error("항목 id가 필요합니다.");
      if (!body.draft) throw new Error("draft가 필요합니다.");
      const draftKeys = Object.keys(body.draft);
      const invalidKeys = draftKeys.filter(k => !MATCH_KEYS.includes(k));
      if (invalidKeys.length) {
        throw new Error(`draft에 허용되지 않은 필드가 있습니다: ${invalidKeys.join(", ")}`);
      }
      const found = await findItemInQueues(body.id);
      if (!found) throw new Error("해당 id의 항목을 찾을 수 없습니다.");
      const { fileMeta, data, item } = found;
      const editedFields = [];
      for (const key of draftKeys) {
        if (JSON.stringify(item.draft[key]) !== JSON.stringify(body.draft[key])) {
          item.draft[key] = body.draft[key];
          editedFields.push(key);
          if (!item.fieldEvidence) item.fieldEvidence = {};
          if (!item.fieldEvidence[key]) item.fieldEvidence[key] = {};
          item.fieldEvidence[key].source = "manual";
        }
      }
      if (!item.review) item.review = { reviewedAt: "", reviewer: "", note: "", editedFields: [] };
      item.review.editedFields = [...new Set([...(item.review.editedFields || []), ...editedFields])];
      item.warnings = resolveWarnings(item);
      item.fingerprint = hash(JSON.stringify(item.draft));
      await saveSingleQueueFile(fileMeta, data);
      sendJson(res, 200, { ok: true, editedFields, warnings: item.warnings });
      return;
    }

    if (req.method === "POST" && req.url === "/api/review/status") {
      const body = await parseBody(req);
      if (!body.id) throw new Error("항목 id가 필요합니다.");
      const validStatuses = ["approved", "rejected", "pending_review"];
      if (!validStatuses.includes(body.status)) {
        throw new Error(`status는 ${validStatuses.join("/")} 중 하나여야 합니다.`);
      }
      const found = await findItemInQueues(body.id);
      if (!found) throw new Error("해당 id의 항목을 찾을 수 없습니다.");
      const { fileMeta, data, item } = found;
      item.status = body.status;
      if (!item.review) item.review = { reviewedAt: "", reviewer: "", note: "", editedFields: [] };
      if (body.note !== undefined) item.review.note = String(body.note);
      if (body.status === "approved" || body.status === "rejected") {
        item.review.reviewedAt = kstTimestamp();
      }
      await saveSingleQueueFile(fileMeta, data);
      sendJson(res, 200, { ok: true, status: item.status });
      return;
    }

    if (req.method === "POST" && req.url === "/api/review/preview") {
      const body = await parseBody(req);
      const merged = await loadMergedReviewQueue();
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) throw new Error("미리보기할 항목 id 목록이 필요합니다.");
      const approvedItems = merged.items.filter(i => ids.includes(i.id) && i.status === "approved");
      if (approvedItems.length !== ids.length) {
        const missing = ids.filter(id => !approvedItems.find(i => i.id === id));
        throw new Error(`승인되지 않았거나 존재하지 않는 항목이 있습니다: ${missing.join(", ")}`);
      }
      // Check for required warnings
      for (const item of approvedItems) {
        const requiredWarnings = (item.warnings || []).filter(w => w.level === "required");
        if (requiredWarnings.length) {
          throw new Error(`항목 ${item.id}에 필수 수정 경고가 남아 있습니다: ${requiredWarnings.map(w => w.message).join("; ")}`);
        }
      }
      // Check for cross-source URL duplicates among selected items
      const urlToItems = new Map();
      for (const item of approvedItems) {
        const url = item.draft?.url;
        if (url) {
          if (!urlToItems.has(url)) urlToItems.set(url, []);
          urlToItems.get(url).push(item);
        }
      }
      const duplicateUrls = [...urlToItems.entries()].filter(([, items]) => items.length > 1);
      if (duplicateUrls.length > 0) {
        const details = duplicateUrls.map(([url, items]) =>
          `URL ${url}: ${items.map(i => `${i.id}(${i._source?.key || "?"})`).join(", ")}`
        );
        throw new Error(`서로 다른 소스의 항목이 같은 URL을 가리킵니다:\n${details.join("\n")}`);
      }
      const [activeData, health] = await Promise.all([loadActiveData(), repositoryHealth()]);
      if (hasBlockingWorkspaceChanges(health)) {
        throw new Error(`저장소에 기존 변경이 있어 미리보기를 확정할 수 없습니다: ${health.status.join(", ")}`);
      }
      // Build next match data
      const currentMatches = activeData.matches;
      const nextCompetitions = [...currentMatches.competitions];
      const changes = [];
      for (const item of approvedItems) {
        const canonical = canonicalMatch(item.draft);
        // Validate 13 fields
        const keys = Object.keys(canonical);
        if (keys.length !== MATCH_KEYS.length || !MATCH_KEYS.every(k => keys.includes(k))) {
          throw new Error(`항목 ${item.id}의 draft가 13필드 계약을 만족하지 않습니다.`);
        }
        // Check duplicate URL in existing data
        const existingIdx = nextCompetitions.findIndex(c => c.url && c.url === canonical.url);
        if (existingIdx >= 0) {
          changes.push({ type: "update", id: item.id, source: item._source, index: existingIdx, before: nextCompetitions[existingIdx], after: canonical });
          nextCompetitions[existingIdx] = canonical;
        } else {
          changes.push({ type: "add", id: item.id, source: item._source, after: canonical });
          nextCompetitions.push(canonical);
        }
      }
      const nextMatchData = { competitions: nextCompetitions };
      const manifestNext = nextManifest(activeData.manifest);
      const targetBefore = await fs.readFile(activeData.matchPath, "utf8");
      const manifestBefore = await fs.readFile(activeData.manifestPath, "utf8");
      const targetAfter = jsonText(nextMatchData);
      const manifestAfter = jsonText(manifestNext);

      // Determine which queue files will be affected
      const affectedSources = new Map();
      for (const item of approvedItems) {
        if (item._source) {
          affectedSources.set(item._source.file, item._source);
        }
      }
      // Read current contents of affected queue files for hash tracking
      const queueFileRecords = [];
      for (const [relPath] of affectedSources) {
        const absPath = safeRepoPath(relPath);
        const before = await fs.readFile(absPath, "utf8");
        queueFileRecords.push({
          path: absPath,
          relative: relPath,
          before,
          hash: hash(before)
        });
      }

      const previewId = crypto.randomUUID();
      const files = [relative(activeData.matchPath), relative(activeData.manifestPath), ...queueFileRecords.map(q => q.relative)];

      const record = {
        createdAt: Date.now(),
        branch: health.branch,
        ids,
        files: [
          { path: activeData.matchPath, relative: files[0], before: targetBefore, after: targetAfter, hash: hash(targetBefore) },
          { path: activeData.manifestPath, relative: files[1], before: manifestBefore, after: manifestAfter, hash: hash(manifestBefore) },
          ...queueFileRecords
        ],
        queueFiles: queueFileRecords.map(q => q.relative),
        approvedItems
      };
      reviewPreviews.set(previewId, record);

      // Build source-level summary for UI
      const sourceSummary = [];
      for (const [, src] of affectedSources) {
        const count = approvedItems.filter(i => i._source?.file === src.file).length;
        sourceSummary.push({ key: src.key, label: src.label, file: src.file, count });
      }

      sendJson(res, 200, {
        previewId,
        branch: health.branch,
        files,
        changes,
        manifestBefore: { dataVersion: activeData.manifest.dataVersion, forceRefreshKey: activeData.manifest.forceRefreshKey, updatedAt: activeData.manifest.updatedAt },
        manifestAfter: { dataVersion: manifestNext.dataVersion, forceRefreshKey: manifestNext.forceRefreshKey, updatedAt: manifestNext.updatedAt },
        itemCount: approvedItems.length,
        sources: sourceSummary
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/review/apply") {
      const body = await parseBody(req);
      if (!body.confirmedDiff || !body.confirmedPush) {
        throw new Error("변경 내용과 푸시 대상을 모두 직접 확인해야 합니다.");
      }
      const preview = reviewPreviews.get(body.previewId);
      if (!preview) throw new Error("미리보기가 만료됐습니다. 다시 생성하세요.");
      if (Date.now() - preview.createdAt > 20 * 60 * 1000) {
        reviewPreviews.delete(body.previewId);
        throw new Error("미리보기 생성 후 20분이 지나 다시 확인해야 합니다.");
      }
      const health = await repositoryHealth();
      if (!health.clean || health.branch !== preview.branch) {
        throw new Error("미리보기 이후 저장소 상태 또는 브랜치가 바뀌었습니다.");
      }
      // Check file hashes (match.json + manifest only; queue files may have changed via status edits)
      const coreFiles = preview.files.filter(f => !preview.queueFiles?.includes(f.relative));
      for (const file of coreFiles) {
        const current = await fs.readFile(file.path, "utf8");
        if (hash(current) !== file.hash) {
          throw new Error(`${file.relative} 파일이 미리보기 이후 변경됐습니다.`);
        }
      }
      // Write match.json and manifest
      for (const file of coreFiles) {
        const temporary = `${file.path}.dalti-data-studio-${process.pid}.tmp`;
        await fs.writeFile(temporary, file.after, "utf8");
        await fs.rename(temporary, file.path);
      }
      // Update queue items' statuses in their respective source files
      const queues = await loadAllQueues();
      const affectedFiles = new Set();
      for (const id of preview.ids) {
        for (const { fileMeta, data } of queues) {
          const item = (data.items || []).find(i => i.id === id);
          if (item) {
            item.status = "approved";
            if (!item.review) item.review = { reviewedAt: "", reviewer: "", note: "", editedFields: [] };
            item.review.reviewedAt = kstTimestamp();
            affectedFiles.add(JSON.stringify({ fileMeta, data }));
            break;
          }
        }
      }
      // Save only affected queue files
      const savedQueueFiles = [];
      for (const { fileMeta, data } of queues) {
        const hasAffectedItem = (data.items || []).some(i => preview.ids.includes(i.id));
        if (hasAffectedItem) {
          await saveSingleQueueFile(fileMeta, data);
          savedQueueFiles.push(fileMeta.relativePath);
        }
      }
      // Commit and push
      const relativeFiles = coreFiles.map(f => f.relative);
      relativeFiles.push(...savedQueueFiles);
      let commitHash = "";
      try {
        await git(["add", "--", ...relativeFiles]);
        const subject = String(body.subject || "검수 큐 반영(Apply review queue items)").trim();
        const messageBody = String(body.body || "검수 승인된 항목을 활성 match.json에 반영(Apply approved review queue items to active match.json)").trim();
        await git(["commit", "-m", subject, "-m", messageBody]);
        commitHash = await git(["rev-parse", "--short", "HEAD"]);
        await git(["push", "origin", preview.branch]);
      } catch (error) {
        if (!commitHash) {
          await git(["restore", "--staged", "--", ...relativeFiles]).catch(() => {});
          for (const file of coreFiles) {
            await fs.writeFile(file.path, file.before, "utf8");
          }
        }
        throw new Error(
          commitHash
            ? `커밋 ${commitHash}은 생성됐지만 푸시에 실패했습니다: ${error.message}`
            : `파일을 원복했습니다. 커밋에 실패했습니다: ${error.message}`
        );
      }
      reviewPreviews.delete(body.previewId);
      sendJson(res, 200, { ok: true, commit: commitHash, branch: preview.branch, appliedIds: preview.ids, queueFiles: savedQueueFiles });
      return;
    }

    // --- Instagram Fetch Endpoint ---
    if (method === "POST" && pathname === "/api/instagram/fetch") {
      const profileData = await fetchInstagramProfile("korea_kennel_agility");
      const edges = profileData?.graphql?.user?.edge_owner_to_timeline_media?.edges || [];
      const totalPosts = edges.length;

      const competitionKeywords = ['대회', '승급전', '랭킹전', '선발전', '챔피언', '개최', '참가신청', '출진'];
      const datePattern = /(20\d{2})\s*[년.\/-]\s*(\d{1,2})\s*[월.\/-]\s*(\d{1,2})/;

      const activeData = await loadActiveData();
      const queuePath = safeRepoPath("review/instagram/instagram_queue.json");
      await fs.mkdir(path.dirname(queuePath), { recursive: true });

      let queue = [];
      try {
        queue = await readJson(queuePath);
      } catch {
        queue = [];
      }

      const existingShortcodes = new Set(queue.map((item) => item.shortcode));
      let newCompetitions = 0;
      let skipped = 0;

      for (const edge of edges) {
        const node = edge.node;
        const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || "";
        const shortcode = node.shortcode;

        const matchedKeywords = competitionKeywords.filter((kw) => caption.includes(kw));
        const hasDate = datePattern.test(caption);
        const isCompetition = matchedKeywords.length >= 2 || (matchedKeywords.length >= 1 && hasDate);

        if (!isCompetition) continue;

        if (existingShortcodes.has(shortcode)) {
          skipped++;
          continue;
        }

        const postUrl = `https://www.instagram.com/p/${shortcode}/`;
        const { draft } = analyzeMatchText(caption, postUrl, activeData);

        queue.push({
          id: `ig_${shortcode}`,
          shortcode,
          postUrl,
          captionPreview: caption.slice(0, 200),
          postedAt: new Date(node.taken_at_timestamp * 1000).toISOString(),
          fetchedAt: kstTimestamp(),
          isCompetition: true,
          draft,
          status: "pending_review"
        });

        existingShortcodes.add(shortcode);
        newCompetitions++;
      }

      await fs.writeFile(queuePath, jsonText(queue), "utf8");
      sendJson(res, 200, { ok: true, fetched: totalPosts, competitions: newCompetitions, skipped, queue });
      return;
    }

    // --- Instagram Queue Endpoint ---
    if (method === "GET" && pathname === "/api/instagram/queue") {
      const queuePath = safeRepoPath("review/instagram/instagram_queue.json");
      let queue = [];
      try {
        queue = await readJson(queuePath);
      } catch {
        queue = [];
      }
      sendJson(res, 200, queue);
      return;
    }

    sendJson(res, 404, { error: "API 경로를 찾을 수 없습니다." });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "요청 처리 중 오류가 발생했습니다." });
  }
}

async function start() {
  const development = process.env.NODE_ENV !== "production";
  const vite = development
    ? await (await import("vite")).createServer({
        root: STUDIO_ROOT,
        server: { middlewareMode: true },
        appType: "spa"
      })
    : null;
  const server = http.createServer(async (req, res) => {
    if (req.url?.startsWith("/api/")) {
      await apiHandler(req, res);
      return;
    }
    if (vite) {
      vite.middlewares(req, res, () => {
        res.writeHead(404);
        res.end("Not found");
      });
      return;
    }
    const requested = req.url === "/" ? "index.html" : req.url.split("?")[0].slice(1);
    const file = path.resolve(STUDIO_ROOT, "dist", requested);
    const dist = path.resolve(STUDIO_ROOT, "dist");
    if (!file.startsWith(`${dist}${path.sep}`) && file !== path.join(dist, "index.html")) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    try {
      const content = await fs.readFile(file);
      const extension = path.extname(file);
      const mime =
        extension === ".html"
          ? "text/html; charset=utf-8"
          : extension === ".js"
            ? "text/javascript; charset=utf-8"
            : extension === ".css"
              ? "text/css; charset=utf-8"
              : "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  server.listen(PORT, HOST, () => {
    console.log(`Dalti Data Studio: http://${HOST}:${PORT}`);
    console.log(`Repository: ${REPO_ROOT}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
