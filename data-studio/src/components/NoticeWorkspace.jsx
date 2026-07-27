import { ExternalLink, LockKeyhole, RefreshCw } from "lucide-react";

export function NoticeWorkspace({ notices = [], manifest }) {
  return (
    <div className="notice-workspace">
      <section className="notice-policy">
        <LockKeyhole size={22} />
        <div>
          <h2>공지 산출물은 직접 수정하지 않습니다</h2>
          <p>
            공지 목록·상세는 공식 수집 스크립트의 재생성 결과로만 갱신됩니다.
            게시일 기준 최근 2일과 3건 이상 푸시 차단 정책도 함께 유지합니다.
          </p>
        </div>
        <button className="button secondary" disabled type="button">
          <RefreshCw size={16} /> 공식 재생성 연결
        </button>
      </section>
      <section className="notice-list-section">
        <div className="panel-title">
          <h2>활성 공지사항</h2>
          <span>
            {manifest?.basePath}/{manifest?.files?.notice} · {notices.length}건
          </span>
        </div>
        <div className="notice-list">
          {notices.slice(0, 18).map((notice) => (
            <article key={notice.id}>
              <div className="notice-source">{notice.source}</div>
              <div>
                <strong>{notice.title}</strong>
                <p>
                  {notice.published_at_raw} · ID {notice.id} ·{" "}
                  {notice.source_seq}
                </p>
              </div>
              <a href={notice.url} target="_blank" rel="noreferrer" aria-label="원본 열기">
                <ExternalLink size={17} />
              </a>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
