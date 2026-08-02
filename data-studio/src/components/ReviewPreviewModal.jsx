import { useState } from "react";
import { FileJson2, GitCommitHorizontal, LoaderCircle, X } from "lucide-react";
import { api } from "../lib/api";

export function ReviewPreviewModal({ preview, onClose, onApplied, onToast }) {
  const [confirmedDiff, setConfirmedDiff] = useState(false);
  const [confirmedPush, setConfirmedPush] = useState(false);
  const [subject, setSubject] = useState("검수 큐 반영(Apply review queue items)");
  const [body, setBody] = useState("검수 승인된 항목을 활성 match.json에 반영(Apply approved review queue items to active match.json)");
  const [applying, setApplying] = useState(false);

  const enabled = confirmedDiff && confirmedPush && !applying;

  async function handleApply() {
    setApplying(true);
    try {
      const result = await api.reviewApply({
        previewId: preview.previewId,
        confirmedDiff,
        confirmedPush,
        subject,
        body
      });
      onToast(`반영 완료: ${result.commit} · origin/${result.branch}`);
      onApplied();
    } catch (error) {
      onToast(error.message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-preview-title"
      >
        <header className="modal-head">
          <div>
            <h2 id="review-preview-title">검수 큐 반영 미리보기</h2>
            <p>{preview.itemCount}건의 승인된 항목을 활성 match.json에 반영합니다.</p>
            {preview.sources && preview.sources.length > 1 && (
              <div className="preview-sources-summary">
                {preview.sources.map(src => (
                  <span key={src.key} className="source-count-badge">
                    <span className={`chip chip-source chip-source-${src.key}`}>{src.label}</span>
                    <span className="count">{src.count}건</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="닫기" type="button">
            <X size={20} />
          </button>
        </header>

        <div className="modal-grid">
          <div className="diff-column">
            <h3>변경될 파일 ({preview.files.length})</h3>
            <div className="file-list">
              {preview.files.map(file => (
                <span key={file}><FileJson2 size={15} /> {file}</span>
              ))}
            </div>

            <h3>변경 항목</h3>
            {(preview.changes || []).map((change, i) => (
              <div key={i} style={{ marginBottom: "var(--sp-3)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "4px" }}>
                  <span className={`chip ${change.type === "add" ? "chip-new" : "chip-changed"}`}>
                    {change.type === "add" ? "추가" : "수정"}
                  </span>
                  {change.source && (
                    <span className={`chip chip-source chip-source-${change.source.key}`}>{change.source.label}</span>
                  )}
                  <strong style={{ fontSize: "var(--text-sm)" }}>{change.after?.name || change.id}</strong>
                </div>
                {change.type === "update" && change.before && (
                  <div className="diff-view">
                    <div>
                      <strong>현재</strong>
                      <pre>{JSON.stringify(change.before, null, 2)}</pre>
                    </div>
                    <div>
                      <strong>변경 후</strong>
                      <pre>{JSON.stringify(change.after, null, 2)}</pre>
                    </div>
                  </div>
                )}
                {change.type === "add" && (
                  <pre style={{ fontSize: "11px", fontFamily: "var(--font-mono)", background: "var(--green-soft)", padding: "var(--sp-3)", borderRadius: "var(--radius-sm)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {JSON.stringify(change.after, null, 2)}
                  </pre>
                )}
              </div>
            ))}

            <h3>Manifest 업데이트</h3>
            <div className="diff-view">
              <div>
                <strong>현재</strong>
                <pre>{JSON.stringify(preview.manifestBefore, null, 2)}</pre>
              </div>
              <div>
                <strong>변경 후</strong>
                <pre>{JSON.stringify(preview.manifestAfter, null, 2)}</pre>
              </div>
            </div>
          </div>

          <div className="confirm-column">
            <div className="push-note">이 작업은 앱 푸시를 실행하지 않습니다.</div>

            <section className="commit-form">
              <h3>커밋 메시지 · 한글(English)</h3>
              <label>제목
                <input value={subject} onChange={e => setSubject(e.target.value)} />
              </label>
              <label>내용
                <textarea value={body} onChange={e => setBody(e.target.value)} />
              </label>
            </section>

            <label className="confirm-check">
              <input type="checkbox" checked={confirmedDiff} onChange={e => setConfirmedDiff(e.target.checked)} />
              위 변경 내용을 직접 확인했습니다.
            </label>
            <label className="confirm-check">
              <input type="checkbox" checked={confirmedPush} onChange={e => setConfirmedPush(e.target.checked)} />
              현재 브랜치 {preview.branch}에 커밋 후 origin/{preview.branch}로 푸시합니다.
            </label>
          </div>
        </div>

        <footer className="modal-actions">
          <button className="button secondary" onClick={onClose} type="button">취소</button>
          <button className="button primary" disabled={!enabled} onClick={handleApply} type="button">
            {applying ? <LoaderCircle className="spin" size={17} /> : <GitCommitHorizontal size={17} />}
            확정 · 반영
          </button>
        </footer>
      </section>
    </div>
  );
}
