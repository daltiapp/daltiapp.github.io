import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeMatchText,
  healthStatus,
  loadActiveData,
  repositoryHealth,
  validateMatch,
  validateVenue
} from "../server.mjs";

test("상태 확인 응답이 실행 중인 Data Studio 서버를 식별한다", () => {
  const health = healthStatus();
  assert.equal(health.service, "dalti-data-studio");
  assert.equal(health.pid, process.pid);
  assert.equal(health.port, 4190);
  assert.match(health.repoRoot, /daltiapp\.github\.io$/);
});

test("활성 manifest에서 실제 JSON을 해석한다", async () => {
  const data = await loadActiveData();
  assert.equal(data.manifest.basePath, "/ak/v1");
  assert.ok(data.matches.competitions.length > 0);
  assert.ok(data.venues.venues.length > 0);
  assert.ok(data.notices.items.length > 0);
  assert.match(data.matchPath, /\/ak\/v1\/match\/match\.json$/);
  assert.match(data.venuePath, /\/ak\/v1\/venue\/venue\.json$/);
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
