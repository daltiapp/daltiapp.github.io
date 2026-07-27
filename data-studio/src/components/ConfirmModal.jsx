import {
  AlertCircle,
  CheckCircle2,
  FileJson2,
  GitCommitHorizontal,
  LoaderCircle,
  X
} from "lucide-react";
import { useState } from "react";

export function ConfirmModal({ preview, onClose, onApply, applying }) {
  const [confirmedDiff, setConfirmedDiff] = useState(false);
  const [confirmedPush, setConfirmedPush] = useState(false);
  const [subject, setSubject] = useState(preview.commit.subject);
  const [body, setBody] = useState(preview.commit.body);
  const enabled = confirmedDiff && confirmedPush && !applying;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <header className="modal-head">
          <div>
            <h2 id="confirm-title">변경을 확정할까요?</h2>
            <p>확정 전에는 파일과 Git 기록이 변경되지 않습니다.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </header>

        <div className="modal-grid">
          <div className="diff-column">
            <h3>변경될 파일 ({preview.files.length})</h3>
            <div className="file-list">
              {preview.files.map((file) => (
                <span key={file}>
                  <FileJson2 size={15} /> {file}
                </span>
              ))}
            </div>
            <h3>변경 내용 미리보기</h3>
            <div className="diff-view">
              <div>
                <strong>현재 (main)</strong>
                <pre>{preview.before}</pre>
              </div>
              <div>
                <strong>변경 후</strong>
                <pre>{preview.after}</pre>
              </div>
            </div>
          </div>

          <div className="confirm-column">
            <section className="summary-box">
              <h3>근거와 검증</h3>
              {preview.checks.map((check) => (
                <div className="summary-check" key={check.id}>
                  {check.status === "pass" ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <AlertCircle size={17} />
                  )}
                  <span>{check.label}</span>
                </div>
              ))}
            </section>
            <div className="push-note">
              이 작업은 앱 푸시를 실행하지 않습니다.
            </div>
            <section className="commit-form">
              <h3>커밋 메시지 · 한글(English)</h3>
              <label>
                제목
                <input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label>
                내용
                <textarea value={body} onChange={(e) => setBody(e.target.value)} />
              </label>
            </section>
            <label className="confirm-check">
              <input
                type="checkbox"
                checked={confirmedDiff}
                onChange={(e) => setConfirmedDiff(e.target.checked)}
              />
              위 변경 내용을 직접 확인했습니다.
            </label>
            <label className="confirm-check">
              <input
                type="checkbox"
                checked={confirmedPush}
                onChange={(e) => setConfirmedPush(e.target.checked)}
              />
              현재 브랜치 {preview.branch}에 커밋 후 origin/{preview.branch}로
              푸시합니다.
            </label>
          </div>
        </div>
        <footer className="modal-actions">
          <button className="button secondary" onClick={onClose} type="button">
            초안으로 돌아가기
          </button>
          <button
            className="button primary"
            disabled={!enabled}
            onClick={() =>
              onApply({
                previewId: preview.previewId,
                confirmedDiff,
                confirmedPush,
                subject,
                body
              })
            }
            type="button"
          >
            {applying ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <GitCommitHorizontal size={17} />
            )}
            확정 · 커밋 및 푸시
          </button>
        </footer>
      </section>
    </div>
  );
}
