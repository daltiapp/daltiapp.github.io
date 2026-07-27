import { ArrowDownUp, Braces, CalendarDays, ExternalLink, MapPin, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

function dateLabel(value) {
  if (!value) return "일정 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(value));
}

function imageSource(value) {
  if (!value) return "";
  return value.startsWith("https://drive.google.com/")
    ? `/api/image?url=${encodeURIComponent(value)}`
    : value;
}

function MatchCard({ item }) {
  return (
    <article className="client-card match-client-card">
      <div className="client-card-head">
        <div>
          <span className="client-kicker">{item.eventType || "대회"}</span>
          <h3>{item.name}</h3>
        </div>
        <span className={`client-status ${item.detailStatus === "detail_ready" ? "ready" : ""}`}>
          {item.detailStatus === "detail_ready" ? "상세 준비" : "상세 대기"}
        </span>
      </div>
      <dl className="client-facts">
        <div><dt><CalendarDays size={15} /> 일정</dt><dd>{dateLabel(item.startAt)}</dd></div>
        <div><dt><MapPin size={15} /> 장소</dt><dd>{item.location || "미정"}</dd></div>
        <div><dt>주최</dt><dd>{item.club || "미정"}</dd></div>
        <div><dt>종목</dt><dd>{(item.matchTypes || []).join(" · ") || "미정"}</dd></div>
        <div><dt>심사위원</dt><dd>{(item.judge || []).join(" · ") || "미정"}</dd></div>
      </dl>
      <div className="client-card-actions">
        <details>
          <summary><Braces size={14} /> JSON 원문</summary>
          <pre>{JSON.stringify(item, null, 2)}</pre>
        </details>
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer">상세 원문 <ExternalLink size={13} /></a> : null}
      </div>
    </article>
  );
}

function VenueCard({ item }) {
  const photos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
  return (
    <article className="client-card venue-client-card">
      <div className="venue-client-photos">
        {photos.length ? photos.map((photo, index) => (
          <a href={photo} target="_blank" rel="noreferrer" key={`${photo}-${index}`}>
            <img src={imageSource(photo)} alt={`${item.name} 사진 ${index + 1}`} loading="lazy" />
          </a>
        )) : <div className="venue-client-photo-empty"><MapPin size={30} /></div>}
      </div>
      <div className="venue-client-body">
        <div className="client-card-head">
          <div>
            <span className="client-kicker">대회 장소</span>
            <h3>{item.name}</h3>
          </div>
          <span className="client-status ready">등록 완료</span>
        </div>
        <p>{item.location?.address || "주소 미정"}</p>
        <small>
          {item.location?.latitude ?? "-"}, {item.location?.longitude ?? "-"} · 사진 {item.photos?.length || 0}장
        </small>
        <div className="client-card-actions">
          <details>
            <summary><Braces size={14} /> JSON 원문</summary>
            <pre>{JSON.stringify(item, null, 2)}</pre>
          </details>
        </div>
      </div>
    </article>
  );
}

export function DataBrowser({ type, items = [], path }) {
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("ko"));
  const isMatch = type === "match";
  const filtered = useMemo(
    () => {
      const result = items.filter((item) =>
        !deferredQuery
        || JSON.stringify(item).toLocaleLowerCase("ko").includes(deferredQuery)
      );
      if (!isMatch) return result;

      return [...result].sort((a, b) => {
        const aTime = Date.parse(a.startAt || "");
        const bTime = Date.parse(b.startAt || "");
        const aValid = Number.isFinite(aTime);
        const bValid = Number.isFinite(bTime);
        if (!aValid && !bValid) return 0;
        if (!aValid) return 1;
        if (!bValid) return -1;
        const aValue = aTime;
        const bValue = bTime;
        return sortOrder === "newest" ? bValue - aValue : aValue - bValue;
      });
    },
    [items, deferredQuery, isMatch, sortOrder]
  );

  return (
    <section className="data-browser">
      <div className="data-browser-toolbar">
        <div>
          <h2>{isMatch ? "현재 대회 JSON" : "현재 장소 JSON"}</h2>
          <p>{path} · 전체 {items.length}건 · 검색 결과 {filtered.length}건</p>
        </div>
        <div className="data-browser-controls">
          {isMatch ? (
            <label className="data-sort">
              <ArrowDownUp size={15} />
              <span className="sr-only">대회 정렬 순서</span>
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                <option value="newest">최신순</option>
                <option value="oldest">오래된순</option>
              </select>
            </label>
          ) : null}
          <label className="data-search">
            <Search size={16} />
            <span className="sr-only">현재 JSON 검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isMatch ? "대회명·장소·주최 검색" : "장소명·주소 검색"}
            />
          </label>
        </div>
      </div>
      <div className={`client-grid ${isMatch ? "match-grid" : "venue-grid"}`}>
        {filtered.map((item) =>
          isMatch
            ? <MatchCard item={item} key={`${item.url}-${item.startAt}`} />
            : <VenueCard item={item} key={item.name} />
        )}
      </div>
      {!filtered.length ? <p className="data-empty">검색 조건에 맞는 데이터가 없습니다.</p> : null}
    </section>
  );
}
