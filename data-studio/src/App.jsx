import { Eye, LoaderCircle, Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "./components/ConfirmModal";
import { DataBrowser } from "./components/DataBrowser";
import { EvidencePanel } from "./components/EvidencePanel";
import { MatchEditor } from "./components/MatchEditor";
import { NoticeWorkspace } from "./components/NoticeWorkspace";
import { ReferenceDocs } from "./components/ReferenceDocs";
import { RepositoryPanel } from "./components/RepositoryPanel";
import { Sidebar } from "./components/Sidebar";
import { SourceImporter } from "./components/SourceImporter";
import { ValidationRail } from "./components/ValidationRail";
import { VenueEditor } from "./components/VenueEditor";
import { EMPTY_MATCH, EMPTY_VENUE } from "./data/defaults";
import { api } from "./lib/api";

const INITIAL_CHECKS = [
  { id: "schema", label: "13개 필드", detail: "미리보기에서 검사", status: "idle" },
  { id: "url", label: "상세 URL 원문 일치", detail: "원본 상세 주소 필요", status: "idle" },
  { id: "venue", label: "장소 데이터 연결", detail: "활성 venue.json과 비교", status: "idle" },
  { id: "duplicate", label: "중복 일정", detail: "URL·대회명·시작일 비교", status: "idle" },
  { id: "push", label: "푸시 안전 가드", detail: "3건 이상 자동 차단", status: "idle" }
];

export default function App() {
  const [active, setActive] = useState("match");
  const [state, setState] = useState(null);
  const [matchDraft, setMatchDraft] = useState(EMPTY_MATCH);
  const [venueDraft, setVenueDraft] = useState(EMPTY_VENUE);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [evidence, setEvidence] = useState([]);
  const [fieldEvidence, setFieldEvidence] = useState({});
  const [checks, setChecks] = useState(INITIAL_CHECKS);
  const [preview, setPreview] = useState(null);
  const [dataView, setDataView] = useState("editor");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [repositoryBusy, setRepositoryBusy] = useState(false);
  const [toast, setToast] = useState("");

  const loadState = async () => {
    try {
      const payload = await api.state();
      setState(payload);
      if (!evidence.length) setEvidence(payload.defaultEvidence);
    } catch (error) {
      setToast(error.message);
    }
  };

  useEffect(() => {
    loadState();
  }, []);

  const title = useMemo(
    () =>
      active === "match"
        ? dataView === "current"
          ? "현재 대회 JSON"
          : "대회 JSON 만들기"
        : active === "venue"
          ? dataView === "current"
            ? "현재 장소 JSON"
            : "장소 JSON 만들기"
          : active === "notice"
            ? "공지사항 JSON 관리"
            : active === "docs"
              ? "근거 문서"
              : active === "history"
                ? "변경 이력"
                : "저장소 상태",
    [active, dataView]
  );

  async function refreshRepository() {
    setRepositoryBusy(true);
    setToast("");
    try {
      const health = await api.repository();
      setState((current) => current ? { ...current, health } : current);
      setToast("저장소 상태를 다시 확인했습니다.");
    } catch (error) {
      setToast(error.message);
    } finally {
      setRepositoryBusy(false);
    }
  }

  async function commitPush(payload) {
    setRepositoryBusy(true);
    setToast("");
    try {
      const result = await api.commitPush(payload);
      setToast(
        result.pushed
          ? `완료: ${result.commit} · origin/${result.branch} 푸시 성공`
          : `완료: ${result.commit} · 원격과 이미 동기화됨`
      );
      await loadState();
    } catch (error) {
      setToast(error.message);
    } finally {
      setRepositoryBusy(false);
    }
  }

  async function analyze(sourceType) {
    setLoading(true);
    setToast("");
    try {
      const payload = await api.analyze({
        mode: active,
        sourceType,
        url: sourceUrl,
        text: sourceText
      });
      if (active === "venue") setVenueDraft(payload.draft);
      else setMatchDraft(payload.draft);
      setEvidence(payload.evidence);
      setFieldEvidence(payload.fieldEvidence || {});
      setChecks(payload.checks || INITIAL_CHECKS);
      if (payload.notice) setToast(payload.notice);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function makePreview() {
    setLoading(true);
    setToast("");
    try {
      const payload = await api.preview({
        mode: active,
        action: "create",
        draft: active === "venue" ? venueDraft : matchDraft,
        source: { url: sourceUrl, evidence }
      });
      setChecks(payload.checks);
      setPreview(payload);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function applyChange(payload) {
    setApplying(true);
    try {
      const result = await api.apply(payload);
      setPreview(null);
      setToast(`완료: ${result.commit} · origin/${result.branch} 푸시 성공`);
      await loadState();
    } catch (error) {
      setToast(error.message);
    } finally {
      setApplying(false);
    }
  }

  const showEditor = active === "match" || active === "venue";
  const healthLabel = !state?.health
    ? "저장소 확인 중"
    : state.health.behind
      ? `원격 변경 ${state.health.behind}개 확인 필요`
      : !state.health.clean
        ? `커밋 필요 ${state.health.changedFiles?.length || 0}건`
        : state.health.ahead
          ? `푸시 필요 ${state.health.ahead}개`
          : "원격과 동기화";

  return (
    <div className="app-shell">
      <Sidebar active={active} onChange={setActive} health={state?.health} />
      <main>
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p>
              {state?.manifest?.basePath || "/ak/v1"} · dataVersion{" "}
              {state?.manifest?.dataVersion || "확인 중"}
            </p>
          </div>
          <div className="top-health">
            <ShieldCheck size={17} />
            {healthLabel}
          </div>
        </header>

        {showEditor ? (
          <>
            <div className="view-switch" aria-label="JSON 작업 화면">
              <button
                className={dataView === "editor" ? "is-active" : ""}
                type="button"
                onClick={() => setDataView("editor")}
              >
                새 항목 만들기
              </button>
              <button
                className={dataView === "current" ? "is-active" : ""}
                type="button"
                onClick={() => setDataView("current")}
              >
                현재 JSON 보기
              </button>
            </div>
            {dataView === "current" ? (
              <DataBrowser
                key={active}
                type={active}
                items={
                  active === "match"
                    ? state?.datasets?.matches
                    : state?.datasets?.venues
                }
                path={
                  active === "match"
                    ? state?.datasets?.matchPath
                    : state?.datasets?.venuePath
                }
              />
            ) : (
              <>
                <SourceImporter
                  url={sourceUrl}
                  text={sourceText}
                  onUrl={setSourceUrl}
                  onText={setSourceText}
                  onAnalyze={analyze}
                  loading={loading}
                />
                <div className="workspace-grid">
                  <EvidencePanel evidence={evidence} />
                  {active === "match" ? (
                    <MatchEditor
                      draft={matchDraft}
                      onChange={setMatchDraft}
                      fieldEvidence={fieldEvidence}
                    />
                  ) : (
                    <VenueEditor draft={venueDraft} onChange={setVenueDraft} />
                  )}
                  <ValidationRail checks={checks} health={state?.health} />
                </div>
                <footer className="action-bar">
                  <div>
                    <strong>파일 쓰기 전 마지막 단계</strong>
                    <span>미리보기는 저장소를 변경하지 않습니다.</span>
                  </div>
                  <div>
                    <button
                      className="button secondary"
                      onClick={() => {
                        localStorage.setItem(
                          `dalti-draft-${active}`,
                          JSON.stringify(active === "venue" ? venueDraft : matchDraft)
                        );
                        setToast("초안을 이 브라우저에 저장했습니다.");
                      }}
                      type="button"
                    >
                      <Save size={17} /> 초안 저장
                    </button>
                    <button
                      className="button primary"
                      onClick={makePreview}
                      disabled={loading}
                      type="button"
                    >
                      {loading ? (
                        <LoaderCircle className="spin" size={17} />
                      ) : (
                        <Eye size={17} />
                      )}
                      변경 미리보기
                    </button>
                  </div>
                </footer>
              </>
            )}
          </>
        ) : active === "notice" ? (
          <NoticeWorkspace
            notices={state?.notices || []}
            manifest={state?.manifest}
          />
        ) : active === "docs" ? (
          <ReferenceDocs sources={state?.references || []} />
        ) : active === "history" ? (
          <section className="history-list">
            {(state?.history || []).map((item) => (
              <article key={item.hash}>
                <code>{item.hash}</code>
                <strong>{item.subject}</strong>
                <span>{item.date}</span>
              </article>
            ))}
          </section>
        ) : (
          <RepositoryPanel
            health={state?.health}
            busy={repositoryBusy}
            onRefresh={refreshRepository}
            onCommitPush={commitPush}
          />
        )}
      </main>
      {preview ? (
        <ConfirmModal
          preview={preview}
          onClose={() => setPreview(null)}
          onApply={applyChange}
          applying={applying}
        />
      ) : null}
      {toast ? (
        <div className="toast" role="status" onClick={() => setToast("")}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
