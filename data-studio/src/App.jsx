import { Eye, LoaderCircle, Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "./components/ConfirmModal";
import { EvidencePanel } from "./components/EvidencePanel";
import { MatchEditor } from "./components/MatchEditor";
import { NoticeWorkspace } from "./components/NoticeWorkspace";
import { ReferenceDocs } from "./components/ReferenceDocs";
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
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
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
        ? "대회 JSON 만들기"
        : active === "venue"
          ? "장소 JSON 만들기"
          : active === "notice"
            ? "공지사항 JSON 관리"
            : active === "docs"
              ? "근거 문서"
              : active === "history"
                ? "변경 이력"
                : "작업함",
    [active]
  );

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
            {state?.health?.clean ? "저장소 준비됨" : "저장소 변경 확인 필요"}
          </div>
        </header>

        {showEditor ? (
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
          <section className="inbox-summary">
            <h2>현재 활성 데이터</h2>
            <div>
              <span><strong>{state?.counts?.matches || 0}</strong> 대회</span>
              <span><strong>{state?.counts?.venues || 0}</strong> 장소</span>
              <span><strong>{state?.counts?.notices || 0}</strong> 공지</span>
            </div>
          </section>
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
