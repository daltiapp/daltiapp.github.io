import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Inbox, Keyboard, RefreshCw, Search, X } from "lucide-react";
import { ReviewDetail } from "./ReviewDetail";
import { ReviewPreviewModal } from "./ReviewPreviewModal";
import { api } from "../lib/api";

const STATUS_LABELS = { pending_review: "검수대기", approved: "승인", rejected: "반려" };
const DIFF_LABELS = { new: "신규", changed: "변경" };
const SOURCE_BADGE_LABELS = { kkf: "한국애견연맹", kau: "한국어질리티연합" };

function SourceBadge({ source }) {
  if (!source) return null;
  const label = source.label || SOURCE_BADGE_LABELS[source.key] || source.key;
  return <span className={`chip chip-source chip-source-${source.key}`} title={`소스: ${label}`}>{label}</span>;
}

function StatusChip({ status }) {
  const cls = status === "approved" ? "chip-approved" : status === "rejected" ? "chip-rejected" : "chip-pending";
  return <span className={`chip ${cls}`}>{STATUS_LABELS[status] || status}</span>;
}

function DiffBadge({ kind }) {
  if (!kind || kind === "matched") return null;
  const cls = kind === "new" ? "chip-new" : "chip-changed";
  return <span className={`chip ${cls}`}>{DIFF_LABELS[kind] || kind}</span>;
}

export function ReviewQueue({ onToast }) {
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [diffFilter, setDiffFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [previewData, setPreviewData] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  const loadQueue = useCallback(async () => {
    try {
      const data = await api.reviewQueue();
      setQueue(data);
    } catch (error) {
      onToast(error.message);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const items = useMemo(() => {
    if (!queue?.items) return [];
    let list = [...queue.items];
    if (filter !== "all") list = list.filter(i => i.status === filter);
    if (diffFilter !== "all") list = list.filter(i => i.diffKind === diffFilter);
    if (sourceFilter !== "all") list = list.filter(i => i._source?.key === sourceFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i =>
        (i.draft?.name || "").toLowerCase().includes(q) ||
        (i.sourceTitle || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortBy === "date") return new Date(b.collectedAt || 0) - new Date(a.collectedAt || 0);
      if (sortBy === "confidence") return (a.confidence || 0) - (b.confidence || 0);
      return 0;
    });
    return list;
  }, [queue, filter, diffFilter, sourceFilter, search, sortBy]);

  const selectedItem = useMemo(
    () => items.find(i => i.id === selectedId) || null,
    [items, selectedId]
  );

  // Keep a selection so the detail pane is not left empty on load or after filtering.
  useEffect(() => {
    if (!items.length) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (!items.some(i => i.id === selectedId)) setSelectedId(items[0].id);
  }, [items, selectedId]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.target.isContentEditable) return;

      const currentIdx = items.findIndex(i => i.id === selectedId);
      if (e.key === "j") {
        e.preventDefault();
        const next = Math.min(currentIdx + 1, items.length - 1);
        if (items[next]) setSelectedId(items[next].id);
      } else if (e.key === "k") {
        e.preventDefault();
        const prev = Math.max(currentIdx - 1, 0);
        if (items[prev]) setSelectedId(items[prev].id);
      } else if (e.key === "a" && selectedItem) {
        e.preventDefault();
        handleStatusChange(selectedItem.id, "approved");
      } else if (e.key === "r" && selectedItem) {
        e.preventDefault();
        handleStatusChange(selectedItem.id, "rejected");
      } else if (e.key === "e" && selectedItem) {
        e.preventDefault();
        // Focus first input in detail panel
        const firstInput = document.querySelector(".review-detail-panel input, .review-detail-panel textarea");
        if (firstInput) firstInput.focus();
      } else if (e.key === "?") {
        e.preventDefault();
        setShowHelp(h => !h);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [items, selectedId, selectedItem]);

  async function handleStatusChange(id, status, note) {
    try {
      await api.reviewStatus({ id, status, note });
      await loadQueue();
      onToast(`${STATUS_LABELS[status]} 처리 완료`);
    } catch (error) {
      onToast(error.message);
    }
  }

  async function handleItemEdit(id, draft) {
    try {
      await api.reviewItem({ id, draft });
      await loadQueue();
    } catch (error) {
      onToast(error.message);
    }
  }

  async function handleBulkStatus(status) {
    for (const id of checkedIds) {
      try {
        await api.reviewStatus({ id, status });
      } catch { /* continue */ }
    }
    setCheckedIds(new Set());
    await loadQueue();
    onToast(`${checkedIds.size}건 ${STATUS_LABELS[status]} 처리 완료`);
  }

  async function handlePreview() {
    const ids = [...checkedIds].filter(id => {
      const item = (queue?.items || []).find(i => i.id === id);
      return item && item.status === "approved";
    });
    if (!ids.length) {
      onToast("승인된 항목만 미리보기할 수 있습니다.");
      return;
    }
    try {
      const data = await api.reviewPreview({ ids });
      setPreviewData(data);
    } catch (error) {
      onToast(error.message);
    }
  }

  function toggleCheck(id) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return <div className="review-detail-empty"><p>검수 큐를 불러오는 중...</p></div>;
  }

  const isEmpty = !queue?.items?.length;

  return (
    <>
      <div className="review-layout">
        <header className="review-topbar">
          <div className="review-topbar-title">
            <h1>검수 큐</h1>
            <p>
              자동 수집 초안을 확인하고 승인한 항목만 활성 <code>match.json</code>에 반영합니다.
              {queue?.generatedAt
                ? ` · 마지막 수집 ${new Date(queue.generatedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}`
                : ""}
            </p>
          </div>
          <div className="review-topbar-stats">
            <span className="stat">
              <strong>{queue?.counts?.pending_review ?? 0}</strong>
              검수대기
            </span>
            <span className="stat">
              <strong>{queue?.counts?.approved ?? 0}</strong>
              승인
            </span>
            <span className="stat">
              <strong>{queue?.counts?.rejected ?? 0}</strong>
              반려
            </span>
            <button className="button secondary" type="button" onClick={loadQueue}>
              <RefreshCw size={15} /> 새로고침
            </button>
            <button
              className="button secondary icon-only"
              type="button"
              onClick={() => setShowHelp(true)}
              aria-label="키보드 단축키 보기"
              title="키보드 단축키 (?)"
            >
              <Keyboard size={15} />
            </button>
          </div>
        </header>
        <section className="review-list-panel" aria-label="검수 항목 목록">
          <div className="review-list-toolbar">
            <div className="toolbar-row">
              <label className="sr-only" htmlFor="review-search">검색</label>
              <input
                id="review-search"
                type="search"
                placeholder="대회명 검색..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="toolbar-row filter-row">
              <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="상태 필터">
                <option value="all">전체 상태</option>
                <option value="pending_review">검수대기</option>
                <option value="approved">승인</option>
                <option value="rejected">반려</option>
              </select>
              <select value={diffFilter} onChange={e => setDiffFilter(e.target.value)} aria-label="구분 필터">
                <option value="all">전체 구분</option>
                <option value="new">신규</option>
                <option value="changed">변경</option>
              </select>
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} aria-label="소스 필터">
                <option value="all">전체 소스</option>
                {(queue?.sources || []).map(src => (
                  <option key={src.key} value={src.key}>{src.label} ({src.counts?.pending_review ?? 0})</option>
                ))}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="정렬">
                <option value="date">최신순</option>
                <option value="confidence">신뢰도 낮은순</option>
              </select>
            </div>
            {queue?.sources && queue.sources.length > 1 && (
              <div className="toolbar-row source-counts" aria-label="소스별 검수 대기 건수">
                {queue.sources.map(src => (
                  <span key={src.key} className="source-count-badge">
                    <span className={`chip chip-source chip-source-${src.key}`}>{src.label}</span>
                    <span className="count">{src.counts?.pending_review ?? 0}건 대기</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="review-items" role="listbox" aria-label="검수 항목">
            {isEmpty && (
              <div className="review-detail-empty" style={{ padding: "48px 16px" }}>
                <Inbox size={40} />
                <h3>큐가 비어 있습니다</h3>
                <p>자동 수집 배치가 아직 초안을 만들지 않았습니다.</p>
                {queue?.generatedAt && (
                  <p style={{ fontSize: "var(--text-xs)" }}>마지막 수집: {new Date(queue.generatedAt).toLocaleString("ko-KR")}</p>
                )}
              </div>
            )}
            {items.map(item => {
              const warnings = (item.warnings || []).filter(w => w.level === "required");
              return (
                <div
                  key={item.id}
                  className={`review-item ${selectedId === item.id ? "is-selected" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                  role="option"
                  aria-selected={selectedId === item.id}
                  tabIndex={0}
                >
                  <input
                    type="checkbox"
                    className="review-item-check"
                    checked={checkedIds.has(item.id)}
                    onChange={() => toggleCheck(item.id)}
                    onClick={e => e.stopPropagation()}
                    aria-label={`${item.draft?.name || item.id} 선택`}
                  />
                  <div className="review-item-body">
                    <div className="review-item-header">
                      <span className="review-item-name">{item.draft?.name || item.sourceTitle || item.id}</span>
                      <SourceBadge source={item._source} />
                      <StatusChip status={item.status} />
                      <DiffBadge kind={item.diffKind} />
                    </div>
                    <div className="review-item-meta">
                      <span className="chip chip-confidence">{Math.round((item.confidence || 0) * 100)}%</span>
                      {item.draft?.startAt && <span>{item.draft.startAt.slice(0, 10)}</span>}
                      {item.publishedAt && <span>게시 {item.publishedAt.slice(0, 10)}</span>}
                      {warnings.length > 0 && (
                        <span className="review-item-warnings">
                          <AlertTriangle size={12} /> {warnings.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {checkedIds.size > 0 && (
            <div className="review-bulk-bar" aria-live="polite">
              <strong>{checkedIds.size}건 선택</strong>
              <button className="button sm" type="button" onClick={() => handleBulkStatus("approved")}>
                <Check size={14} /> 승인
              </button>
              <button className="button sm danger" type="button" onClick={() => handleBulkStatus("rejected")}>
                <X size={14} /> 반려
              </button>
              <button className="button sm secondary" type="button" onClick={handlePreview}>
                미리보기
              </button>
              <button className="button sm" type="button" onClick={() => setCheckedIds(new Set())} style={{ marginLeft: "auto" }}>
                선택 해제
              </button>
            </div>
          )}
        </section>

        <main className="review-detail-panel" aria-label="검수 상세">
          {selectedItem ? (
            <ReviewDetail
              item={selectedItem}
              onStatusChange={handleStatusChange}
              onItemEdit={handleItemEdit}
              onToast={onToast}
            />
          ) : (
            <div className="review-detail-empty">
              <Inbox size={48} />
              <h3>항목을 선택하세요</h3>
              <p>좌측 목록에서 항목을 선택하면 상세 내용이 여기에 표시됩니다. <kbd>j</kbd>/<kbd>k</kbd>로 이동, <kbd>?</kbd>로 단축키 보기.</p>
            </div>
          )}
        </main>
      </div>

      {previewData && (
        <ReviewPreviewModal
          preview={previewData}
          onClose={() => setPreviewData(null)}
          onApplied={() => { setPreviewData(null); setCheckedIds(new Set()); loadQueue(); }}
          onToast={onToast}
        />
      )}

      {showHelp && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowHelp(false)}>
          <div className="kbd-help" role="dialog" aria-modal="true" aria-label="키보드 단축키" onClick={e => e.stopPropagation()}>
            <h2>키보드 단축키</h2>
            <div className="kbd-row"><span>다음 항목</span><kbd>j</kbd></div>
            <div className="kbd-row"><span>이전 항목</span><kbd>k</kbd></div>
            <div className="kbd-row"><span>승인</span><kbd>a</kbd></div>
            <div className="kbd-row"><span>반려</span><kbd>r</kbd></div>
            <div className="kbd-row"><span>편집 포커스</span><kbd>e</kbd></div>
            <div className="kbd-row"><span>이 도움말 토글</span><kbd>?</kbd></div>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "var(--sp-3)" }}>
              입력 필드에 포커스 중에는 단축키가 동작하지 않습니다.
            </p>
            <button className="button secondary" onClick={() => setShowHelp(false)} type="button" style={{ marginTop: "var(--sp-3)" }}>닫기</button>
          </div>
        </div>
      )}
    </>
  );
}
