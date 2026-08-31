export const EMPTY_MATCH = {
  applicationEndAt: "",
  applicationStartAt: "",
  club: "",
  detailNotice: "",
  detailStatus: "detail_ready",
  endAt: "",
  eventType: "대회",
  judge: [],
  location: "",
  matchTypes: [],
  name: "",
  startAt: "",
  url: ""
};

export const MATCH_OPTIONAL_KEYS = ["eventChair", "detailImages"];

export function matchDraftSchemaPass(draft) {
  const source = draft || {};
  const coreKeys = Object.keys(EMPTY_MATCH);
  const keys = Object.keys(source);
  if (!coreKeys.every(key => Object.hasOwn(source, key))) return false;
  if (!keys.every(key => coreKeys.includes(key) || MATCH_OPTIONAL_KEYS.includes(key))) return false;
  if (Object.hasOwn(source, "eventChair")
      && (typeof source.eventChair !== "string" || source.eventChair.trim() === "")) return false;
  if (Object.hasOwn(source, "detailImages")) {
    return Array.isArray(source.detailImages)
      && source.detailImages.length > 0
      && source.detailImages.every(value =>
        typeof value === "string"
        && /^https:\/\/drive\.google\.com\/uc\?export=view&id=[A-Za-z0-9_-]+$/.test(value));
  }
  return true;
}

export const EMPTY_VENUE = {
  name: "",
  location: {
    name: "",
    address: "",
    latitude: "",
    longitude: ""
  },
  photos: []
};

export const MATCH_FIELDS = [
  ["name", "대회명", "text"],
  ["club", "주최", "text"],
  ["eventType", "대회 유형", "select"],
  ["eventChair", "대회장", "text"],
  ["location", "장소", "text"],
  ["startAt", "시작일", "datetime-local"],
  ["endAt", "종료일", "datetime-local"],
  ["applicationStartAt", "접수 시작", "datetime-local"],
  ["applicationEndAt", "접수 마감", "datetime-local"],
  ["judge", "심사위원", "list"],
  ["matchTypes", "경기 종목", "list"],
  ["url", "상세 URL", "url"],
  ["detailStatus", "상세 상태", "select-status"],
  ["detailNotice", "상세 메모", "text"],
  ["detailImages", "대회 이미지 URL", "list"]
];

export const REVIEW_MATCH_FIELDS = MATCH_FIELDS.filter(
  ([field]) => !MATCH_OPTIONAL_KEYS.includes(field)
);

export const EVENT_TYPES = ["대회", "랭킹전", "승급전", "선발전"];
