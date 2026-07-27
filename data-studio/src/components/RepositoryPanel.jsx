import { CheckCircle2, GitCommitHorizontal, RefreshCw, UploadCloud } from "lucide-react";
import { useState } from "react";

export function RepositoryPanel({ health, busy, onRefresh, onCommitPush }) {
  const [subject, setSubject] = useState("데이터 스튜디오 변경 반영 (Update Data Studio)");
  const [body, setBody] = useState("확인된 로컬 변경을 커밋하고 원격 저장소에 반영 (Commit and push verified local changes)");
  const [confirmed, setConfirmed] = useState(false);
  const hasChanges = !health?.clean;
  const needsPush = Number(health?.ahead || 0) > 0;
  const ready = health && !health.behind && (hasChanges || needsPush);

  return (
    <section className="repository-panel">
      <div className="repository-summary">
        <div>
          <span>현재 브랜치</span>
          <strong>{health?.branch || "확인 중"}</strong>
          <small>{health?.head || "-"} · {health?.upstream || "upstream 없음"}</small>
        </div>
        <div>
          <span>로컬 변경</span>
          <strong>{health?.changedFiles?.length || 0}</strong>
          <small>{hasChanges ? "커밋 필요" : "작업 트리 clean"}</small>
        </div>
        <div>
          <span>미푸시 커밋</span>
          <strong>{health?.ahead || 0}</strong>
          <small>{needsPush ? "원격 푸시 필요" : "원격과 동기화"}</small>
        </div>
        <div>
          <span>원격 차이</span>
          <strong>{health?.behind || 0}</strong>
          <small>{health?.behind ? "먼저 최신 코드 반영 필요" : "충돌 없음"}</small>
        </div>
      </div>

      <div className="repository-workspace">
        <div className="repository-files">
          <div className="panel-title">
            <h2>변경 파일</h2>
            <button className="button secondary" type="button" onClick={onRefresh} disabled={busy}>
              <RefreshCw size={15} className={busy ? "spin" : ""} /> 다시 확인
            </button>
          </div>
          {health?.status?.length ? (
            <div className="repository-file-list">
              {health.status.map((line, index) => <code key={`${line}-${index}`}>{line}</code>)}
            </div>
          ) : (
            <div className="repository-clean">
              <CheckCircle2 size={20} />
              <div><strong>로컬 변경이 없습니다.</strong><span>현재 작업 트리는 깨끗합니다.</span></div>
            </div>
          )}
        </div>

        <form
          className="repository-action"
          onSubmit={(event) => {
            event.preventDefault();
            onCommitPush({ subject, body, confirmed });
          }}
        >
          <div>
            <GitCommitHorizontal size={20} />
            <h2>{hasChanges ? "변경 커밋·푸시" : needsPush ? "미푸시 커밋 푸시" : "저장소 동기화 완료"}</h2>
            <p>민감한 키·인증서·환경 파일은 자동 커밋에서 차단됩니다.</p>
          </div>
          {hasChanges ? (
            <>
              <label>커밋 제목<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
              <label>커밋 내용<textarea value={body} onChange={(event) => setBody(event.target.value)} /></label>
            </>
          ) : null}
          <label className="confirm-check">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>변경 파일과 origin/{health?.branch || "현재 브랜치"} 푸시를 확인했습니다.</span>
          </label>
          <button className="button primary" disabled={!ready || !confirmed || busy} type="submit">
            <UploadCloud size={16} />
            {busy ? "처리 중" : hasChanges ? "커밋하고 푸시" : needsPush ? "원격에 푸시" : "동기화 완료"}
          </button>
        </form>
      </div>
      <p className="runtime-log-path">
        실행 로그 <code>~/Library/Logs/DaltiDataStudio/launcher.log</code>
      </p>
    </section>
  );
}
