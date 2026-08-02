import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Instagram, LoaderCircle, RefreshCw } from "lucide-react";
import { api } from "../lib/api";

const STATUS_LABELS = { pending_review: "검수대기", approved: "승인", rejected: "반려" };

function StatusChip({ status }) {
  const cls =
    status === "approved"
      ? "chip-approved"
      : status === "rejected"
        ? "chip-rejected"
        : "chip-pending";
  return <span className={`chip ${cls}`}>{STATUS_LABELS[status] || status}</span>;
}

function DraftPreview({ draft }) {
  const [open, setOpen] = useState(false);
  if (!draft) return null;
  return (
    <div className="ig-draft-preview">
      <button
        className="ig-draft-toggle"
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Draft JSON</span>
      </button>
      {open && (
        <pre className="ig-draft-json">{JSON.stringify(draft, null, 2)}</pre>
      )}
    </div>
  );
}

export function InstagramQueue({ onPreview, onToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [addingId, setAddingId] = useState(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.instagramQueue();
      setItems(Array.isArray(data) ? data : data.queue || []);
    } catch (error) {
      onToast?.(error.message);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  async function handleFetch() {
    setFetching(true);
    try {
      const result = await api.instagramFetch();
      onToast?.(`수집 완료: ${result.newCount ?? 0}건 추가, 총 ${result.totalCount ?? 0}건`);
      setItems(Array.isArray(result.queue) ? result.queue : []);
    } catch (error) {
      onToast?.(error.message);
    } finally {
      setFetching(false);
    }
  }

  async function handleAdd(item) {
    setAddingId(item.shortcode || item.id);
    try {
      const previewData = await api.preview({
        mode: "match",
        draft: item.draft,
        source: { url: item.postUrl }
      });
      onPreview(previewData);
    } catch (error) {
      onToast?.(error.message);
    } finally {
      setAddingId(null);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Instagram 큐</h1>
          <p>인스타그램에서 수집된 대회 게시물을 확인하고 일정에 추가합니다.</p>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          <button
            className="button secondary"
            type="button"
            onClick={loadQueue}
            disabled={loading}
          >
            <RefreshCw size={15} /> 새로고침
          </button>
          <button
            className="button primary"
            type="button"
            onClick={handleFetch}
            disabled={fetching}
          >
            {fetching ? <LoaderCircle className="spin" size={17} /> : <Instagram size={17} />}
            Instagram 수집
          </button>
        </div>
      </header>

      <section style={{ padding: "var(--sp-4)" }}>
        {loading ? (
          <p style={{ textAlign: "center", padding: "var(--sp-6)", color: "var(--text-muted)" }}>
            큐를 불러오는 중...
          </p>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "var(--sp-6)", color: "var(--text-muted)" }}>
            <Instagram size={40} style={{ marginBottom: "var(--sp-2)", opacity: 0.4 }} />
            <h3>큐가 비어 있습니다</h3>
            <p>위의 "Instagram 수집" 버튼을 눌러 게시물을 수집하세요.</p>
          </div>
        ) : (
          <div className="ig-queue-list">
            {items.map((item) => {
              const id = item.shortcode || item.id;
              const caption = item.caption || "";
              const captionPreview =
                caption.length > 100 ? caption.slice(0, 100) + "…" : caption;
              const postedDate = item.postedAt
                ? new Date(item.postedAt).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                  })
                : "날짜 없음";

              return (
                <div key={id} className="card ig-queue-item">
                  <div className="ig-queue-item-header">
                    <span className="ig-queue-date">{postedDate}</span>
                    <StatusChip status={item.status || "pending_review"} />
                  </div>
                  <p className="ig-queue-caption">{captionPreview}</p>
                  <DraftPreview draft={item.draft} />
                  <div className="ig-queue-item-actions">
                    <button
                      className="button primary sm"
                      type="button"
                      onClick={() => handleAdd(item)}
                      disabled={addingId === id}
                    >
                      {addingId === id ? (
                        <LoaderCircle className="spin" size={14} />
                      ) : null}
                      대회일정 추가
                    </button>
                    {item.postUrl && (
                      <a
                        href={item.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button secondary sm"
                      >
                        원본 보기
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
