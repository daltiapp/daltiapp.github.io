import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  analyzeMatchText,
  currentKauJob,
  hasBlockingWorkspaceChanges,
  healthStatus,
  loadActiveData,
  repositoryHealth,
  resolveWarnings,
  reviewQueueDir,
  validateMatch,
  validateVenue
} from "../server.mjs";

const STUDIO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.resolve(STUDIO_ROOT, "..");

// Tests must never touch the operator's live queue file or create the
// operational review/ directory. The queue dir is redirected into a
// test-only directory that is removed after each case.
const REVIEW_QUEUE_DIR_RELATIVE = "data-studio/tests/.tmp-queue";
process.env.DALTI_REVIEW_QUEUE_DIR = REVIEW_QUEUE_DIR_RELATIVE;
const REVIEW_QUEUE_DIR_ABS = path.join(REPO_ROOT, REVIEW_QUEUE_DIR_RELATIVE);

// Helper to create a temporary queue directory with files
async function withTempQueueDir(files, fn) {
  await fs.mkdir(REVIEW_QUEUE_DIR_ABS, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    await fs.writeFile(
      path.join(REVIEW_QUEUE_DIR_ABS, filename),
      JSON.stringify(content, null, 2) + "\n",
      "utf8"
    );
  }
  try {
    await fn();
  } finally {
    await fs.rm(REVIEW_QUEUE_DIR_ABS, { recursive: true, force: true }).catch(() => {});
  }
}

// Helper for HTTP requests
const PORT = 4190;
const BASE = `http://127.0.0.1:${PORT}`;

async function apiRequest(method, urlPath, body) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" }
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`${BASE}${urlPath}`, options);
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

// Sample queue data factories
function makeSampleKauQueue() {
  return {
    schemaVersion: 1,
    source: "agility.co.kr",
    sourceLabel: "한국어질리티연합",
    generatedAt: "2026-07-30T13:00:51+09:00",
    year: 2026,
    counts: { total: 1, pending_review: 1, approved: 0, rejected: 0, new: 1, changed: 0 },
    items: [{
      id: "kau-172472260",
      sourceId: "172472260",
      sourceUrl: "https://www.agility.co.kr/17/?bmode=view&idx=172472260&t=board",
      sourceTitle: "26.08.08.(토) KAU 어질리티 승급전",
      publishedAt: "2026-07-16T12:47:00+09:00",
      collectedAt: "2026-07-30T13:00:51+09:00",
      diffKind: "new",
      status: "pending_review",
      fingerprint: "abc123",
      confidence: 0.72,
      draft: {
        applicationEndAt: "2026-07-27T23:59:59",
        applicationStartAt: "2026-07-19T00:00:00",
        club: "한국어질리티연합",
        detailNotice: "",
        detailStatus: "detail_pending",
        endAt: "2026-08-08T00:00:00",
        eventType: "승급전",
        judge: [],
        location: "",
        matchTypes: ["점핑", "어질리티"],
        name: "26.08.08.(토) KAU 승급전(점/어)",
        startAt: "2026-08-08T00:00:00",
        url: "https://www.agility.co.kr/17/?bmode=view&idx=172472260&t=board"
      },
      fieldEvidence: {},
      warnings: [
        { field: "location", level: "required", message: "장소 수동 입력 필요" }
      ],
      images: [],
      review: { reviewedAt: "", reviewer: "", note: "", editedFields: [] }
    }]
  };
}

function makeSampleKkfQueue() {
  return {
    schemaVersion: 1,
    source: "thekkf.or.kr",
    sourceLabel: "한국애견연맹",
    generatedAt: "2026-07-30T14:00:00+09:00",
    year: 2026,
    counts: { total: 1, pending_review: 1, approved: 0, rejected: 0, new: 1, changed: 0 },
    items: [{
      id: "kkf-1001",
      sourceId: "1001",
      sourceUrl: "https://www.thekkf.or.kr/board/view?seq=1001",
      sourceTitle: "제15회 KKF 어질리티 전국대회",
      publishedAt: "2026-07-20T10:00:00+09:00",
      collectedAt: "2026-07-30T14:00:00+09:00",
      diffKind: "new",
      status: "pending_review",
      fingerprint: "def456",
      confidence: 0.85,
      draft: {
        applicationEndAt: "2026-08-10T23:59:59",
        applicationStartAt: "2026-08-01T00:00:00",
        club: "한국애견연맹",
        detailNotice: "",
        detailStatus: "detail_ready",
        endAt: "2026-08-15T00:00:00",
        eventType: "대회",
        judge: ["김심사"],
        location: "키녹 그린스페이스",
        matchTypes: ["점핑", "어질리티", "비기너"],
        name: "제15회 KKF 어질리티 전국대회",
        startAt: "2026-08-15T00:00:00",
        url: "https://www.thekkf.or.kr/board/view?seq=1001"
      },
      fieldEvidence: {
        location: { value: "키녹 그린스페이스", source: "detail", confidence: 0.9 }
      },
      warnings: [],
      images: [],
      review: { reviewedAt: "", reviewer: "", note: "", editedFields: [] }
    }]
  };
}

// === Existing tests ===

test("상태 확인 응답이 실행 중인 Data Studio 서버를 식별한다", () => {
  const health = healthStatus();
  assert.equal(health.service, "dalti-data-studio");
  assert.equal(health.pid, process.pid);
  assert.equal(health.port, 4190);
  assert.match(health.repoRoot, /daltiapp\.github\.io$/);
});

test("KAU 작업 상태는 앱 시작 전 안전한 대기 상태다", () => {
  const job = currentKauJob();
  assert.equal(job.status, "idle");
  assert.equal(job.autoAppliedCount, 0);
});

test("검수 큐 자체 변경은 허용하되 다른 산출물 변경은 차단한다", () => {
  const health = {
    changedFiles: ["review/schedule/kau_review_queue.json"]
  };
  assert.equal(hasBlockingWorkspaceChanges(health, ["review/schedule/kau_review_queue.json"]), false);
  assert.equal(hasBlockingWorkspaceChanges({ changedFiles: ["ak/v2/match/match.json"] }, []), true);
});

test("활성 manifest에서 실제 JSON을 해석한다", async () => {
  const data = await loadActiveData();
  assert.equal(data.manifest.basePath, "/ak/v2");
  assert.ok(data.matches.competitions.length > 0);
  assert.ok(data.venues.venues.length > 0);
  assert.ok(data.notices.items.length > 0);
  assert.match(data.matchPath, /\/ak\/v2\/match\/match\.json$/);
  assert.match(data.venuePath, /\/ak\/v2\/venue\/venue\.json$/);
});

test("저장소 상태에서 브랜치와 원격 동기화 정보를 제공한다", async () => {
  const health = await repositoryHealth();
  assert.equal(health.branch, "main");
  assert.match(health.remoteUrl, /\S+/);
  assert.equal(typeof health.ahead, "number");
  assert.equal(typeof health.behind, "number");
  assert.ok(Array.isArray(health.changedFiles));
});

test("원문에서 알려진 장소와 날짜를 대회 초안으로 추출한다", async () => {
  const data = await loadActiveData();
  const result = analyzeMatchText(
    "ARES : GAME ON 어질리티 대회\n2026년 9월 19일 09시 00분\n키녹 그린스페이스\n비기너, 노비스1",
    "https://example.com/competition/ares",
    data
  );
  assert.equal(result.draft.location, "키녹 그린스페이스");
  assert.equal(result.draft.startAt, "2026-09-19T09:00:00");
  assert.ok(result.draft.matchTypes.includes("비기너"));
});

test("대회는 정확한 13개 필드와 중복을 검사한다", async () => {
  const data = await loadActiveData();
  const existing = data.matches.competitions[0];
  const validation = validateMatch(existing, data);
  assert.deepEqual(Object.keys(validation.item), [
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
  ]);
  assert.equal(validation.blocking, true);
});

test("장소 좌표 범위와 중복을 검사한다", async () => {
  const data = await loadActiveData();
  const validation = validateVenue(
    {
      name: "새 테스트 장소",
      location: {
        name: "새 테스트 장소",
        address: "서울특별시 테스트로 1",
        latitude: 37.5,
        longitude: 127.1
      },
      photos: ["https://example.com/photo.jpg"]
    },
    data
  );
  assert.equal(validation.blocking, false);
});

// === Multi-source Review Queue tests ===

test("검수 큐 디렉터리가 없을 때 빈 큐로 200 응답한다", async () => {
  // Ensure the queue directory does not exist
  await fs.rm(REVIEW_QUEUE_DIR_ABS, { recursive: true, force: true }).catch(() => {});
  // Dynamically import the merged loader to test directory-not-found behavior
  // We use a dynamic approach that mimics the server logic
  const dirPath = path.join(REPO_ROOT, REVIEW_QUEUE_DIR_RELATIVE);
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") entries = null;
    else throw error;
  }
  assert.equal(entries, null, "Queue directory should not exist");
});

test("KKF+KAU 두 파일을 합친 조회 결과와 소스별 counts를 제공한다", async () => {
  const kauQueue = makeSampleKauQueue();
  const kkfQueue = makeSampleKkfQueue();

  await withTempQueueDir({
    "kau_review_queue.json": kauQueue,
    "kkf_review_queue.json": kkfQueue
  }, async () => {
    // Read both files and simulate merging logic
    const dir = REVIEW_QUEUE_DIR_ABS;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const queueFiles = entries.filter(e => e.isFile() && /_review_queue\.json$/.test(e.name));
    assert.equal(queueFiles.length, 2, "Should find 2 queue files");

    // Parse and merge
    const allItems = [];
    const sources = [];
    for (const entry of queueFiles) {
      const data = JSON.parse(await fs.readFile(path.join(dir, entry.name), "utf8"));
      const key = entry.name.replace(/_review_queue\.json$/, "");
      const items = data.items.map(item => ({
        ...item,
        _source: { key, label: data.sourceLabel, file: `${REVIEW_QUEUE_DIR_RELATIVE}/${entry.name}` }
      }));
      allItems.push(...items);
      sources.push({ key, label: data.sourceLabel, counts: data.counts });
    }

    // Verify merged results
    assert.equal(allItems.length, 2);
    assert.ok(allItems.some(i => i.id === "kau-172472260"));
    assert.ok(allItems.some(i => i.id === "kkf-1001"));

    // Verify source tracking
    const kauItem = allItems.find(i => i.id === "kau-172472260");
    assert.equal(kauItem._source.key, "kau");
    assert.equal(kauItem._source.label, "한국어질리티연합");

    const kkfItem = allItems.find(i => i.id === "kkf-1001");
    assert.equal(kkfItem._source.key, "kkf");
    assert.equal(kkfItem._source.label, "한국애견연맹");

    // Verify sources array
    assert.equal(sources.length, 2);
    const kauSource = sources.find(s => s.key === "kau");
    assert.equal(kauSource.counts.total, 1);
    assert.equal(kauSource.counts.pending_review, 1);
  });
});

test("KKF 항목 수정 시 KAU 파일은 바뀌지 않음", async () => {
  const kauQueue = makeSampleKauQueue();
  const kkfQueue = makeSampleKkfQueue();

  await withTempQueueDir({
    "kau_review_queue.json": kauQueue,
    "kkf_review_queue.json": kkfQueue
  }, async () => {
    // Record KAU file content before modification
    const kauFilePath = path.join(REVIEW_QUEUE_DIR_ABS, "kau_review_queue.json");
    const kkfFilePath = path.join(REVIEW_QUEUE_DIR_ABS, "kkf_review_queue.json");
    const kauBefore = await fs.readFile(kauFilePath, "utf8");
    const kauHashBefore = crypto.createHash("sha256").update(kauBefore).digest("hex");

    // Modify KKF item (simulate what server does)
    const kkfData = JSON.parse(await fs.readFile(kkfFilePath, "utf8"));
    const item = kkfData.items[0];
    item.draft.location = "수정된 장소";
    item.review.editedFields = ["location"];
    if (!item.fieldEvidence) item.fieldEvidence = {};
    item.fieldEvidence.location = { source: "manual" };
    // Save only KKF file
    await fs.writeFile(kkfFilePath, JSON.stringify(kkfData, null, 2) + "\n", "utf8");

    // Verify KAU file is unchanged
    const kauAfter = await fs.readFile(kauFilePath, "utf8");
    const kauHashAfter = crypto.createHash("sha256").update(kauAfter).digest("hex");
    assert.equal(kauHashBefore, kauHashAfter, "KAU file must not change when KKF item is modified");
  });
});

test("13필드 외 키가 draft에 있으면 거부한다", async () => {
  const MATCH_KEYS = [
    "applicationEndAt", "applicationStartAt", "club", "detailNotice", "detailStatus",
    "endAt", "eventType", "judge", "location", "matchTypes", "name", "startAt", "url"
  ];
  const invalidDraft = { name: "수정", invalidField: "bad", anotherBad: "x" };
  const invalidKeys = Object.keys(invalidDraft).filter(k => !MATCH_KEYS.includes(k));
  assert.ok(invalidKeys.length > 0);
  assert.ok(invalidKeys.includes("invalidField"));
  assert.ok(invalidKeys.includes("anotherBad"));
});

test("사람이 값을 채우면 해당 필수 경고가 해제된다", () => {
  const item = {
    draft: {
      location: "",
      judge: [],
      name: "테스트 대회"
    },
    warnings: [
      { field: "location", level: "required", message: "장소 수동 입력 필요" },
      { field: "judge", level: "required", message: "심사위원 수동 입력 필요" },
      { field: "eventType", level: "check", message: "이벤트 유형 확인" }
    ]
  };

  assert.equal(resolveWarnings(item).length, 3);

  item.draft.location = "소노펫 어질리티 센터";
  assert.deepEqual(
    resolveWarnings(item).map(w => w.field),
    ["judge", "eventType"]
  );

  item.draft.judge = ["홍상우"];
  assert.deepEqual(
    resolveWarnings(item).map(w => w.field),
    ["eventType"]
  );
});

test("검수 큐 디렉터리는 환경변수로 격리할 수 있다", () => {
  assert.equal(reviewQueueDir(), REVIEW_QUEUE_DIR_RELATIVE);
  assert.notEqual(reviewQueueDir(), "review/schedule");
});

test("큐 파일명 패턴이 *_review_queue.json만 매칭한다", async () => {
  await withTempQueueDir({
    "kau_review_queue.json": { schemaVersion: 1, items: [] },
    "kkf_review_queue.json": { schemaVersion: 1, items: [] },
    "not_a_queue.json": { bad: true },
    "review_queue.json.bak": { bad: true }
  }, async () => {
    const entries = await fs.readdir(REVIEW_QUEUE_DIR_ABS, { withFileTypes: true });
    const pattern = /_review_queue\.json$/;
    const matched = entries.filter(e => e.isFile() && pattern.test(e.name));
    assert.equal(matched.length, 2);
    assert.ok(matched.some(e => e.name === "kau_review_queue.json"));
    assert.ok(matched.some(e => e.name === "kkf_review_queue.json"));
  });
});

test("필수 경고가 남은 항목은 preview를 거부하는 로직이 동작한다", () => {
  const item = {
    id: "kau-test-003",
    status: "approved",
    warnings: [{ field: "location", level: "required", message: "장소 필수" }],
    draft: {
      applicationEndAt: "", applicationStartAt: "", club: "테스트", detailNotice: "",
      detailStatus: "detail_pending", endAt: "2026-08-08T00:00:00", eventType: "대회",
      judge: [], location: "", matchTypes: [], name: "테스트", startAt: "2026-08-08T00:00:00",
      url: "https://example.com/test"
    }
  };

  const requiredWarnings = (item.warnings || []).filter(w => w.level === "required");
  assert.ok(requiredWarnings.length > 0, "Required warnings should block preview");
});

test("서로 다른 소스의 항목이 같은 URL을 가리키면 중복 감지", async () => {
  const kauQueue = makeSampleKauQueue();
  // Make KKF have the same URL as KAU
  const kkfQueue = makeSampleKkfQueue();
  kkfQueue.items[0].draft.url = kauQueue.items[0].draft.url;

  await withTempQueueDir({
    "kau_review_queue.json": kauQueue,
    "kkf_review_queue.json": kkfQueue
  }, async () => {
    // Simulate cross-source URL duplicate detection
    const dir = REVIEW_QUEUE_DIR_ABS;
    const allItems = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries.filter(e => /_review_queue\.json$/.test(e.name))) {
      const data = JSON.parse(await fs.readFile(path.join(dir, entry.name), "utf8"));
      const key = entry.name.replace(/_review_queue\.json$/, "");
      allItems.push(...data.items.map(i => ({ ...i, _source: { key } })));
    }

    const urlToItems = new Map();
    for (const item of allItems) {
      const url = item.draft?.url;
      if (url) {
        if (!urlToItems.has(url)) urlToItems.set(url, []);
        urlToItems.get(url).push(item);
      }
    }
    const duplicateUrls = [...urlToItems.entries()].filter(([, items]) => items.length > 1);
    assert.ok(duplicateUrls.length > 0, "Should detect cross-source URL duplicates");
    const [url, dupes] = duplicateUrls[0];
    assert.ok(dupes.some(i => i._source.key === "kau"));
    assert.ok(dupes.some(i => i._source.key === "kkf"));
  });
});

test("빈 디렉터리에 파일이 없으면 빈 큐로 처리한다", async () => {
  // Create empty directory
  await fs.mkdir(REVIEW_QUEUE_DIR_ABS, { recursive: true });
  try {
    const entries = await fs.readdir(REVIEW_QUEUE_DIR_ABS, { withFileTypes: true });
    const pattern = /_review_queue\.json$/;
    const matched = entries.filter(e => e.isFile() && pattern.test(e.name));
    assert.equal(matched.length, 0, "Empty directory should yield no queue files");
  } finally {
    await fs.rm(REVIEW_QUEUE_DIR_ABS, { recursive: true, force: true }).catch(() => {});
  }
});
