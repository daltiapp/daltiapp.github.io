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
  ["location", "장소", "text"],
  ["startAt", "시작일", "datetime-local"],
  ["endAt", "종료일", "datetime-local"],
  ["applicationStartAt", "접수 시작", "datetime-local"],
  ["applicationEndAt", "접수 마감", "datetime-local"],
  ["judge", "심사위원", "list"],
  ["matchTypes", "경기 종목", "list"],
  ["url", "상세 URL", "url"],
  ["detailStatus", "상세 상태", "select-status"],
  ["detailNotice", "상세 메모", "text"]
];

export const EVENT_TYPES = ["대회", "랭킹전", "승급전", "선발전"];
