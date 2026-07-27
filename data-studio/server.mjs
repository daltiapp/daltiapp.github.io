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
const PORT = Number(process.env.DALTI_DATA_STUDIO_PORT || 4173);
const HOST = "127.0.0.1";
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

async function apiHandler(req, res) {
  try {
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
      if (body.sourceType !== "text") {
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
