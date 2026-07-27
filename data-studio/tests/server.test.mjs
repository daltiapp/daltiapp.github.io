import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeMatchText,
  loadActiveData,
  validateMatch,
  validateVenue
} from "../server.mjs";

test("활성 manifest에서 실제 JSON을 해석한다", async () => {
  const data = await loadActiveData();
  assert.equal(data.manifest.basePath, "/ak/v1");
  assert.ok(data.matches.competitions.length > 0);
  assert.ok(data.venues.venues.length > 0);
  assert.ok(data.notices.items.length > 0);
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
