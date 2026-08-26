import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  MATCH_KEYS,
  cacheKauImages,
  evaluateAutoEligibility,
  mergeCodexExtraction,
  runCodexImageExtraction,
  validateKauImageUrl
} from "../kau-automation.mjs";

function draft(overrides = {}) {
  return {
    applicationEndAt: "2026-09-10T23:59:59",
    applicationStartAt: "2026-09-01T00:00:00",
    club: "한국어질리티연합",
    detailNotice: "",
    detailStatus: "detail_ready",
    endAt: "2026-09-20T17:00:00",
    eventType: "승급전",
    judge: ["홍길동"],
    location: "키녹 그린스페이스",
    matchTypes: ["점핑", "어질리티"],
    name: "KAU 가을 승급전",
    startAt: "2026-09-20T09:00:00",
    url: "https://www.agility.co.kr/17/?bmode=view&idx=999000001&t=board",
    ...overrides
  };
}

function activeData() {
  return {
    matches: {
      competitions: [draft({
        name: "기존 대회",
        url: "https://www.agility.co.kr/17/?bmode=view&idx=888000001&t=board"
      })]
    },
    venues: { venues: [{ name: "키녹 그린스페이스" }] }
  };
}

function exactEvidence() {
  return Object.fromEntries(["startAt", "endAt", "location", "judge"].map((field, index) => [
    field,
    { source: "codex_image", raw: `${field} 원문`, imageIndex: index + 1 }
  ]));
}

test("KAU 이미지는 cdn.imweb.me의 HTTPS 주소만 허용한다", () => {
  assert.equal(validateKauImageUrl("https://cdn.imweb.me/upload/a.jpg").hostname, "cdn.imweb.me");
  assert.throws(() => validateKauImageUrl("http://cdn.imweb.me/a.jpg"), /허용되지 않은/);
  assert.throws(() => validateKauImageUrl("https://example.com/a.jpg"), /허용되지 않은/);
});

test("이미지 캐시는 URL·SHA·MIME 근거와 로컬 파일만 만든다", async () => {
  const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dalti-kau-cache-"));
  const bytes = Buffer.from("poster-bytes");
  const fetchImpl = async () => new Response(bytes, {
    status: 200,
    headers: { "content-type": "image/jpeg", "content-length": String(bytes.length) }
  });
  try {
    const result = await cacheKauImages({
      sourceId: "999000001",
      images: ["https://cdn.imweb.me/upload/poster.jpg"]
    }, { cacheRoot, fetchImpl });
    assert.equal(result.imageEvidence.length, 1);
    assert.equal(result.imageEvidence[0].contentType, "image/jpeg");
    assert.match(result.imageEvidence[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal((await fs.readFile(result.localFiles[0])).toString(), "poster-bytes");
  } finally {
    await fs.rm(cacheRoot, { recursive: true, force: true });
  }
});

test("Codex exact 근거는 빈 필드와 자정 시간만 보완하고 충돌은 경고로 남긴다", () => {
  const item = {
    sourceUrl: draft().url,
    draft: draft({ location: "", startAt: "2026-09-20T00:00:00" }),
    fieldEvidence: {},
    warnings: [
      { field: "location", level: "required", message: "장소 확인 필요" },
      { field: "judge", level: "required", message: "심사위원 확인 필요" }
    ]
  };
  const extraction = {
    draft: draft({ judge: ["다른 심사위원"] }),
    evidence: [
      { field: "location", imageIndex: 1, rawText: "키녹 그린스페이스", certainty: "exact" },
      { field: "startAt", imageIndex: 1, rawText: "9월 20일 09:00", certainty: "exact" },
      { field: "judge", imageIndex: 2, rawText: "다른 심사위원", certainty: "exact" }
    ],
    warnings: []
  };
  const merged = mergeCodexExtraction(item, extraction, new Date("2026-08-20T00:00:00Z"));
  assert.equal(merged.draft.location, "키녹 그린스페이스");
  assert.equal(merged.draft.startAt, "2026-09-20T09:00:00");
  assert.deepEqual(merged.draft.judge, ["홍길동"]);
  assert.ok(merged.warnings.some(warning => warning.field === "judge"));
});

test("자동 반영은 신규 1~2건의 엄격한 근거만 허용하고 3건부터 차단한다", () => {
  const item = {
    diffKind: "new",
    draft: draft(),
    fieldEvidence: exactEvidence(),
    warnings: [],
    automation: { state: "extracted" }
  };
  assert.equal(evaluateAutoEligibility(item, activeData(), 2).eligible, true);
  const blocked = evaluateAutoEligibility(item, activeData(), 3);
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.reasons.some(reason => reason.includes("3건 이상")));
  const warned = evaluateAutoEligibility({
    ...item,
    automation: { state: "extracted", extractorWarnings: ["포스터 일부가 흐림"] }
  }, activeData(), 1);
  assert.equal(warned.eligible, false);
  assert.ok(warned.reasons.some(reason => reason.includes("Codex 판독 경고")));
});

test("Codex 실행은 저장된 인증을 쓰는 ephemeral/read-only 구조화 호출이다", async () => {
  let invocation;
  const extraction = await runCodexImageExtraction(
    { sourceTitle: "테스트", sourceUrl: draft().url, draft: draft() },
    activeData(),
    ["/tmp/poster.jpg"],
    {
      runner: async value => {
        invocation = value;
        return JSON.stringify({ draft: draft(), evidence: [], warnings: [] });
      }
    }
  );
  assert.deepEqual(Object.keys(extraction.draft).sort(), [...MATCH_KEYS].sort());
  assert.ok(invocation.args.includes("--ephemeral"));
  assert.ok(invocation.args.includes("read-only"));
  assert.ok(invocation.args.includes("--output-schema"));
  assert.ok(invocation.args.includes("--image"));
});
