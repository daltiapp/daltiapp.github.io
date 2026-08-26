import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MAX_KAU_IMAGES = 12;
export const MAX_KAU_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_KAU_TOTAL_IMAGE_BYTES = 60 * 1024 * 1024;

const KAU_IMAGE_HOSTS = new Set(["cdn.imweb.me"]);
const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATE_FIELDS = new Set(["applicationEndAt", "applicationStartAt", "endAt", "startAt"]);
const REQUIRED_AUTO_FIELDS = [
  "club",
  "endAt",
  "eventType",
  "judge",
  "location",
  "matchTypes",
  "name",
  "startAt",
  "url"
];
const EXACT_IMAGE_FIELDS = ["endAt", "judge", "location", "startAt"];

export const MATCH_KEYS = [
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

export function kauCacheRoot() {
  const configured = String(process.env.DALTI_KAU_CACHE_DIR || "").trim();
  return configured || path.join(os.homedir(), "Library", "Caches", "Dalti Data Studio", "kau");
}

export function validateKauImageUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw new Error("KAU 이미지 URL 형식이 올바르지 않습니다.");
  }
  if (parsed.protocol !== "https:" || !KAU_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`허용되지 않은 KAU 이미지 주소입니다: ${parsed.hostname || value}`);
  }
  parsed.hash = "";
  return parsed;
}

function extensionForContentType(contentType) {
  const normalized = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/avif") return "avif";
  if (normalized === "image/jpeg") return "jpg";
  return "img";
}

async function fetchAllowedImage(initialUrl, fetchImpl) {
  let target = validateKauImageUrl(initialUrl);
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetchImpl(target, {
      redirect: "manual",
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
        "User-Agent": "DaltiDataStudio/1.0"
      }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 3) throw new Error("이미지 리디렉션을 확인하지 못했습니다.");
      target = validateKauImageUrl(new URL(location, target).toString());
      continue;
    }
    if (!response.ok) throw new Error(`이미지 요청 실패 (${response.status})`);
    const contentType = String(response.headers.get("content-type") || "").split(";", 1)[0].trim();
    if (!contentType.startsWith("image/")) throw new Error(`이미지 MIME 형식이 아닙니다: ${contentType || "unknown"}`);
    const declaredBytes = Number(response.headers.get("content-length") || 0);
    if (declaredBytes > MAX_KAU_IMAGE_BYTES) throw new Error("이미지 파일이 15MB 제한을 초과했습니다.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_KAU_IMAGE_BYTES) throw new Error("이미지 파일이 15MB 제한을 초과했습니다.");
    return { bytes, contentType, resolvedUrl: target.toString() };
  }
  throw new Error("이미지 요청을 완료하지 못했습니다.");
}

export async function cacheKauImages(item, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const cacheRoot = options.cacheRoot || kauCacheRoot();
  const sourceId = String(item?.sourceId || "").replace(/[^0-9A-Za-z_-]/g, "");
  if (!sourceId) throw new Error("이미지 캐시에 필요한 sourceId가 없습니다.");
  const itemDirectory = path.join(cacheRoot, sourceId);
  await fs.mkdir(itemDirectory, { recursive: true });

  let totalBytes = 0;
  const imageEvidence = [];
  const localFiles = [];
  const sources = [...new Set((item.images || []).map(value => String(value).trim()).filter(Boolean))]
    .slice(0, MAX_KAU_IMAGES);

  for (let index = 0; index < sources.length; index += 1) {
    const sourceUrl = validateKauImageUrl(sources[index]).toString();
    const downloaded = await fetchAllowedImage(sourceUrl, fetchImpl);
    totalBytes += downloaded.bytes.length;
    if (totalBytes > MAX_KAU_TOTAL_IMAGE_BYTES) throw new Error("게시물 이미지 합계가 60MB 제한을 초과했습니다.");
    const sha256 = crypto.createHash("sha256").update(downloaded.bytes).digest("hex");
    const extension = extensionForContentType(downloaded.contentType);
    const filename = `${String(index + 1).padStart(2, "0")}-${sha256.slice(0, 20)}.${extension}`;
    const localPath = path.join(itemDirectory, filename);
    try {
      await fs.access(localPath);
    } catch {
      await fs.writeFile(localPath, downloaded.bytes);
    }
    imageEvidence.push({
      imageIndex: index + 1,
      url: sourceUrl,
      resolvedUrl: downloaded.resolvedUrl,
      sha256,
      contentType: downloaded.contentType,
      bytes: downloaded.bytes.length,
      cacheKey: `${sourceId}/${filename}`
    });
    localFiles.push(localPath);
  }

  const evidenceFingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(imageEvidence.map(({ imageIndex, url, sha256 }) => ({ imageIndex, url, sha256 }))))
    .digest("hex");
  return { imageEvidence, localFiles, evidenceFingerprint, totalBytes };
}

function isFilled(value) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" ? value.trim() !== "" : value !== null && value !== undefined;
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function evidenceByField(extraction) {
  const result = new Map();
  for (const evidence of extraction?.evidence || []) {
    if (!MATCH_KEYS.includes(evidence?.field)) continue;
    if (!result.has(evidence.field) || evidence.certainty === "exact") result.set(evidence.field, evidence);
  }
  return result;
}

function canRefineMidnight(field, currentValue, nextValue) {
  if (!new Set(["startAt", "endAt"]).has(field)) return false;
  if (!/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(String(currentValue || ""))) return false;
  return String(currentValue).slice(0, 10) === String(nextValue || "").slice(0, 10)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(String(nextValue || ""));
}

export function mergeCodexExtraction(item, extraction, now = new Date()) {
  const currentDraft = Object.fromEntries(MATCH_KEYS.map(key => [key, item?.draft?.[key]]));
  const extractedDraft = extraction?.draft || {};
  const nextDraft = structuredClone(currentDraft);
  const nextEvidence = structuredClone(item?.fieldEvidence || {});
  const warnings = (item?.warnings || []).filter(Boolean).map(warning => ({ ...warning }));
  const extractedEvidence = evidenceByField(extraction);
  const conflicts = [];

  for (const field of MATCH_KEYS) {
    if (field === "url" || field === "detailNotice") continue;
    const proposed = extractedDraft[field];
    const evidence = extractedEvidence.get(field);
    if (!evidence || evidence.certainty !== "exact" || !isFilled(proposed)) continue;
    const current = nextDraft[field];
    if (!isFilled(current) || canRefineMidnight(field, current, proposed)) {
      nextDraft[field] = proposed;
      nextEvidence[field] = {
        value: proposed,
        source: "codex_image",
        imageIndex: evidence.imageIndex,
        raw: evidence.rawText,
        confidence: 1,
        note: "Codex CLI 이미지 판독 후 규칙 검증 대기"
      };
      continue;
    }
    if (!valuesEqual(current, proposed)) {
      conflicts.push(field);
      warnings.push({
        field,
        level: "required",
        message: `${field} 값이 기존 근거와 이미지 판독 결과에서 서로 다릅니다.`
      });
    }
  }

  nextDraft.url = item.sourceUrl || currentDraft.url || "";
  nextDraft.detailNotice = "";
  const unresolvedWarnings = warnings.filter((warning, index, all) => {
    if (!warning?.field || !MATCH_KEYS.includes(warning.field)) return true;
    if (conflicts.includes(warning.field)) return true;
    if (!isFilled(nextDraft[warning.field])) return true;
    return all.findIndex(candidate => candidate.field === warning.field && candidate.message === warning.message) === index;
  });
  nextDraft.detailStatus = unresolvedWarnings.some(warning => warning.level === "required")
    ? "detail_pending"
    : "detail_ready";

  return {
    ...item,
    draft: nextDraft,
    fieldEvidence: nextEvidence,
    warnings: unresolvedWarnings,
    automation: {
      ...(item.automation || {}),
      state: "extracted",
      extractor: "codex-cli",
      extractedAt: now.toISOString(),
      conflicts,
      extractorWarnings: Array.isArray(extraction?.warnings) ? extraction.warnings : []
    }
  };
}

function normalizeKauUrlKey(value) {
  try {
    const url = new URL(String(value || ""));
    const index = url.searchParams.get("idx");
    if (!index || !url.hostname.toLowerCase().endsWith("agility.co.kr")) return "";
    return `agility.co.kr|${index}`;
  } catch {
    return "";
  }
}

function isIsoSecond(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(String(value || ""));
}

export function evaluateAutoEligibility(item, activeData, candidateCount) {
  const reasons = [];
  const checks = [];
  const draft = item?.draft || {};
  const exactKeys = MATCH_KEYS.every(key => Object.hasOwn(draft, key)) && Object.keys(draft).length === MATCH_KEYS.length;
  checks.push({ id: "schema", pass: exactKeys, label: "13필드 통과" });
  if (!exactKeys) reasons.push("13필드 계약 불일치");
  if (item?.diffKind !== "new") reasons.push("기존 일정 변경은 자동 반영하지 않음");
  if (candidateCount >= 3) reasons.push("한 번의 확인에서 후보가 3건 이상임");
  if (item?.automation?.state !== "extracted") reasons.push("Codex 이미지 판독이 완료되지 않음");
  if ((item?.warnings || []).length > 0) reasons.push("확인 경고가 남아 있음");
  if ((item?.automation?.extractorWarnings || []).length > 0) reasons.push("Codex 판독 경고가 남아 있음");

  for (const field of REQUIRED_AUTO_FIELDS) {
    if (!isFilled(draft[field])) reasons.push(`${field} 필수값 누락`);
  }
  for (const field of DATE_FIELDS) {
    if (isFilled(draft[field]) && !isIsoSecond(draft[field])) reasons.push(`${field} ISO 날짜 형식 오류`);
  }
  if (isFilled(draft.applicationStartAt) !== isFilled(draft.applicationEndAt)) {
    reasons.push("접수 시작/마감은 함께 있어야 함");
  }
  if (isIsoSecond(draft.startAt) && isIsoSecond(draft.endAt) && new Date(draft.endAt) < new Date(draft.startAt)) {
    reasons.push("대회 종료가 시작보다 빠름");
  }
  if (isIsoSecond(draft.applicationStartAt) && isIsoSecond(draft.applicationEndAt)
      && new Date(draft.applicationEndAt) < new Date(draft.applicationStartAt)) {
    reasons.push("접수 마감이 시작보다 빠름");
  }
  for (const field of EXACT_IMAGE_FIELDS) {
    const evidence = item?.fieldEvidence?.[field];
    if (evidence?.source !== "codex_image" || !evidence?.raw || !evidence?.imageIndex) {
      reasons.push(`${field} 이미지 근거 없음`);
    }
  }
  if ([draft.startAt, draft.endAt].some(value => /T00:00:00$/.test(String(value || "")))) {
    reasons.push("시작/종료 시각이 임의 자정값임");
  }

  const venues = new Set((activeData?.venues?.venues || []).map(venue => String(venue.name || "").trim()).filter(Boolean));
  const matches = activeData?.matches?.competitions || [];
  const clubs = new Set(matches.map(match => String(match.club || "").trim()).filter(Boolean));
  const eventTypes = new Set(matches.map(match => String(match.eventType || "").trim()).filter(Boolean));
  const matchTypes = new Set(matches.flatMap(match => match.matchTypes || []).map(value => String(value).trim()).filter(Boolean));
  if (!venues.has(String(draft.location || "").trim())) reasons.push("활성 venue.json과 장소가 연결되지 않음");
  if (!clubs.has(String(draft.club || "").trim())) reasons.push("기존 주최 정규화표에 없는 값");
  if (!eventTypes.has(String(draft.eventType || "").trim())) reasons.push("기존 대회종류 정규화표에 없는 값");
  for (const matchType of draft.matchTypes || []) {
    if (!matchTypes.has(String(matchType).trim())) reasons.push(`기존 경기종류 정규화표에 없는 값: ${matchType}`);
  }

  const candidateUrlKey = normalizeKauUrlKey(draft.url);
  const existingUrlKeys = new Set(matches.map(match => normalizeKauUrlKey(match.url)).filter(Boolean));
  const urlPass = Boolean(candidateUrlKey) && !existingUrlKeys.has(candidateUrlKey);
  checks.push({ id: "url", pass: urlPass, label: "상세 URL 일치" });
  if (!candidateUrlKey) reasons.push("agility.co.kr 상세 idx URL이 아님");
  if (existingUrlKeys.has(candidateUrlKey)) reasons.push("활성 일정에 같은 상세 URL이 이미 있음");
  checks.push({ id: "duplicate", pass: !existingUrlKeys.has(candidateUrlKey), label: "중복 없음" });
  checks.push({ id: "venue", pass: venues.has(String(draft.location || "").trim()), label: "장소 연결" });

  const uniqueReasons = [...new Set(reasons)];
  return { eligible: uniqueReasons.length === 0, reasons: uniqueReasons, checks };
}

export function buildCodexPrompt(item, activeData) {
  const venues = (activeData?.venues?.venues || []).map(venue => venue.name).filter(Boolean);
  const matches = activeData?.matches?.competitions || [];
  const clubs = [...new Set(matches.map(match => match.club).filter(Boolean))];
  const eventTypes = [...new Set(matches.map(match => match.eventType).filter(Boolean))];
  const matchTypes = [...new Set(matches.flatMap(match => match.matchTypes || []).filter(Boolean))];
  return [
    "첨부된 한국어질리티연합 대회 포스터만 읽고 일정 JSON 초안을 보완하세요.",
    "명확히 인쇄된 정보만 exact로 표시하고 추측하지 마세요. 읽히지 않으면 missing 또는 uncertain으로 표시하세요.",
    "URL과 detailNotice는 제공된 초안을 그대로 유지하세요. 날짜는 YYYY-MM-DDTHH:mm:ss 형식입니다.",
    "각 변경 필드에는 반드시 이미지 번호와 포스터에서 읽은 짧은 원문 근거를 넣으세요.",
    `원본 제목: ${item.sourceTitle || ""}`,
    `게시일: ${item.publishedAt || ""}`,
    `상세 URL: ${item.sourceUrl || ""}`,
    `현재 13필드 초안: ${JSON.stringify(item.draft || {}, null, 2)}`,
    `허용 장소명: ${JSON.stringify(venues)}`,
    `기존 주최 값: ${JSON.stringify(clubs)}`,
    `기존 대회종류 값: ${JSON.stringify(eventTypes)}`,
    `기존 경기종류 값: ${JSON.stringify(matchTypes)}`
  ].join("\n\n");
}

function spawnCodex(codexBin, args, prompt, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(codexBin, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Codex 이미지 판독 시간이 3분을 초과했습니다."));
    }, options.timeoutMs || 180_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Codex CLI 판독 실패 (${code}): ${stderr.trim().slice(-800)}`));
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin.end(prompt);
  });
}

export async function runCodexImageExtraction(item, activeData, localFiles, options = {}) {
  if (!localFiles.length) throw new Error("Codex가 읽을 게시물 이미지가 없습니다.");
  const codexBin = options.codexBin || process.env.DALTI_CODEX_BIN || "codex";
  const schemaPath = options.schemaPath || path.join(MODULE_ROOT, "codex-kau-output.schema.json");
  const args = [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--sandbox",
    "read-only",
    "--output-schema",
    schemaPath
  ];
  for (const localFile of localFiles) args.push("--image", localFile);
  args.push("-");
  const prompt = buildCodexPrompt(item, activeData);
  const raw = options.runner
    ? await options.runner({ codexBin, args, prompt, cwd: options.cwd })
    : await spawnCodex(codexBin, args, prompt, { cwd: options.cwd, timeoutMs: options.timeoutMs });
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Codex CLI가 유효한 JSON 초안을 반환하지 않았습니다.");
  }
  if (!parsed?.draft || !Array.isArray(parsed?.evidence) || !Array.isArray(parsed?.warnings)) {
    throw new Error("Codex CLI 출력이 일정 판독 스키마를 만족하지 않습니다.");
  }
  return parsed;
}
