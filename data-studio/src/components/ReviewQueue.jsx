import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronRight, Circle, Inbox, LoaderCircle, RefreshCw, RotateCw, X } from "lucide-react";
import { ReviewDetail } from "./ReviewDetail";
import { ReviewPreviewModal } from "./ReviewPreviewModal";
import { api } from "../lib/api";

const STATUS_LABELS = { pending_review: "확인 필요", approved: "처리 완료", rejected: "반려" };

function itemAutomationLabel(item) {
  if (item.automation?.state === "applied") return { tone: "green", text: "자동 반영 완료", icon: CheckCircle2 };
  if (item.automation?.state === "auto_ready") return { tone: "green", text: "자동 반영 가능", icon: CheckCircle2 };
  if (item.diffKind === "changed") return { tone: "red", text: "기존 일정 변경", icon: RotateCw };
  const warningCount = (item.warnings || []).filter(warning => warning.level === "required").length;
  if (warningCount) return { tone: "amber", text: `필수 확인 ${warningCount}`, icon: AlertTriangle };
  return { tone: "gray", text: STATUS_LABELS[item.status] || item.status, icon: Circle };
}

function Pipeline({ job }) {
  const stages = ["게시판 확인", "이미지 캐시", "Codex 판독", "규칙 검증", "반영"];
  const activeIndex = job?.status === "running"
    ? Math.min(4, Math.floor((job.progress || 0) / 20))
    : job?.status === "completed" ? 4 : 0;
  return (
    <div className="review-pipeline" aria-label="자동 수집 진행 단계">
      {stages.map((stage, index) => (
        <span className={index === activeIndex ? "is-active" : index < activeIndex ? "is-done" : ""} key={stage}>
          <i />{stage}{index < stages.length - 1 && <ChevronRight size={15} />}
        </span>
      ))}
    </div>
  );
}

export function ReviewQueue({ onToast, health, onNavigate }) {
  const [queue, setQueue] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [previewData, setPreviewData] = useState(null);

  const loadQueue = useCallback(async () => {
    const data = await api.reviewQueue();
    setQueue(data);
    return data;
  }, []);

  const loadJob = useCallback(async () => {
    const data = await api.kauJob();
    setJob(data);
    return data;
  }, []);

  const loadAll = useCallback(async () => {
    try {
      await Promise.all([loadQueue(), loadJob()]);
    } catch (error) {
      onToast(error.message);
    } finally {
      setLoading(false);
    }
  }, [loadJob, loadQueue, onToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (job?.status !== "running") return undefined;
    const timer = window.setInterval(async () => {
      try {
        const next = await loadJob();
        if (next.status !== "running") await loadQueue();
      } catch (error) {
        onToast(error.message);
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job?.status, loadJob, loadQueue, onToast]);

  const items = useMemo(() => {
    const all = queue?.items || [];
    if (filter === "needs") return all.filter(item => item.status === "pending_review");
    if (filter === "done") return all.filter(item => item.status !== "pending_review");
    return all;
  }, [queue, filter]);

  const selectedItem = useMemo(
    () => (queue?.items || []).find(item => item.id === selectedId) || null,
    [queue, selectedId]
  );

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null);
      return;
    }
    if (!items.some(item => item.id === selectedId)) setSelectedId(items[0].id);
  }, [items, selectedId]);

  async function refreshKau() {
    try {
      const next = await api.kauRefresh();
      setJob(next);
      onToast(next.status === "running" ? "KAU 새 게시물 확인을 시작했습니다." : next.message);
    } catch (error) {
      onToast(error.message);
    }
  }

  async function handleStatusChange(id, status, note) {
    try {
      await api.reviewStatus({ id, status, note });
      await loadQueue();
      onToast(`${STATUS_LABELS[status]} 처리했습니다.`);
    } catch (error) {
      onToast(error.message);
    }
  }

  async function handleItemEdit(id, draft) {
    try {
      await api.reviewItem({ id, draft });
      await loadQueue();
      onToast("수정 내용을 검수 큐에 저장했습니다.");
    } catch (error) {
      onToast(error.message);
    }
  }

  async function handlePreview() {
    const chosen = checkedIds.size ? [...checkedIds] : selectedItem ? [selectedItem.id] : [];
    const ids = chosen.filter(id => (queue?.items || []).some(item => item.id === id && item.status === "approved"));
    if (!ids.length) {
      onToast("검수 승인된 항목을 선택해 주세요.");
      return;
    }
    try {
      setPreviewData(await api.reviewPreview({ ids }));
    } catch (error) {
      onToast(error.message);
    }
  }

  function toggleCheck(id) {
    setCheckedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const lastChecked = job?.finishedAt || job?.startedAt || queue?.generatedAt;
  const branchLabel = health?.branch || "main";
  const syncLabel = health?.behind ? `원격 ${health.behind}개 뒤처짐` : health?.ahead ? `푸시 ${health.ahead}개 대기` : "원격 동기화";

  if (loading) return <div className="review-loading"><LoaderCircle className="spin" /> 검수 화면을 준비하고 있습니다.</div>;

  return (
    <>
      <div className="review-layout">
        <header className="review-topbar">
          <div className="studio-brand">Dalti Data Studio</div>
          <div className="repo-state"><strong>{branchLabel}</strong> · {syncLabel}</div>
          <div className="last-checked">
            마지막 확인: {lastChecked ? new Date(lastChecked).toLocaleString("ko-KR") : "아직 없음"}
            <button type="button" onClick={loadAll} aria-label="화면 새로고침"><RefreshCw size={16} /></button>
          </div>
          <button className="manual-tools" type="button" onClick={() => onNavigate?.("match")}>수동 데이터</button>
          <button className="refresh-posts" type="button" onClick={refreshKau} disabled={job?.status === "running"}>
            {job?.status === "running" ? <LoaderCircle className="spin" size={19} /> : <RefreshCw size={19} />}
            새 게시물 확인
          </button>
        </header>

        <Pipeline job={job} />

        <section className="review-list-panel" aria-label="검수 큐">
          <div className="queue-tabs">
            <h1>검수 큐</h1>
            <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")} type="button">전체</button>
            <button className={filter === "needs" ? "is-active" : ""} onClick={() => setFilter("needs")} type="button">확인 필요</button>
            <button className={filter === "done" ? "is-active" : ""} onClick={() => setFilter("done")} type="button">처리 완료</button>
          </div>
          <div className="queue-items" role="listbox">
            {!items.length && (
              <div className="queue-empty"><Inbox size={36} /><strong>표시할 항목이 없습니다</strong><span>새 게시물을 확인하면 여기에 초안이 나타납니다.</span></div>
            )}
            {items.map(item => {
              const automation = itemAutomationLabel(item);
              const StatusIcon = automation.icon;
              return (
                <article
                  className={`queue-item ${selectedId === item.id ? "is-selected" : ""}`}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  role="option"
                  aria-selected={selectedId === item.id}
                >
                  <div className="queue-item-topline">
                    <span>{item._source?.label || "한국어질리티연합"}</span>
                    <strong className={`tone-${automation.tone}`}>{automation.text}</strong>
                  </div>
                  <h2>{item.draft?.name || item.sourceTitle || item.id}</h2>
                  <div className="queue-item-bottomline">
                    <time>{item.publishedAt ? new Date(item.publishedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "게시일 확인 필요"}</time>
                    <StatusIcon className={`tone-${automation.tone}`} size={28} />
                  </div>
                  {item.status === "approved" && (
                    <input
                      aria-label="반영 대상 선택"
                      type="checkbox"
                      checked={checkedIds.has(item.id)}
                      onChange={() => toggleCheck(item.id)}
                      onClick={event => event.stopPropagation()}
                    />
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {selectedItem ? (
          <ReviewDetail item={selectedItem} onStatusChange={handleStatusChange} onItemEdit={handleItemEdit} />
        ) : (
          <>
            <section className="review-evidence-panel empty-panel"><Inbox size={44} /><strong>검수할 항목을 선택하세요</strong></section>
            <section className="review-editor-panel empty-panel"><span>13필드 초안과 검증 결과가 여기에 표시됩니다.</span></section>
          </>
        )}

        <footer className="review-activity">
          <strong>최근 활동</strong>
          <span className={job?.status === "failed" ? "is-error" : ""}>
            <i /> {job?.message || "수집 작업 대기 중"}
          </span>
          <span><i /> 후보 {job?.candidateCount || 0}건</span>
          <span><i /> 자동 반영 {job?.autoAppliedCount || 0}건</span>
          <button type="button" onClick={handlePreview} disabled={!selectedItem || selectedItem.status !== "approved"}>반영 미리보기</button>
        </footer>
      </div>

      {previewData && (
        <ReviewPreviewModal
          preview={previewData}
          onClose={() => setPreviewData(null)}
          onApplied={() => { setPreviewData(null); setCheckedIds(new Set()); loadAll(); }}
          onToast={onToast}
        />
      )}
    </>
  );
}
