import { ExternalLink, FileText } from "lucide-react";

const EXTERNAL = [
  {
    title: "Guidelines for Human-AI Interaction",
    detail: "AI 결과의 기대치, 근거, 수정·거부·확정 흐름을 설계한 CHI 2019 연구",
    url: "https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/"
  },
  {
    title: "W3C PROV-O",
    detail: "원본·추출·수정 결과 사이의 출처 관계를 기록하기 위한 표준",
    url: "https://www.w3.org/TR/prov-o/"
  },
  {
    title: "GitHub Repository Contents API",
    detail: "파일 갱신·커밋 시 버전 충돌과 쓰기 권한을 다루는 공식 문서",
    url: "https://docs.github.com/en/rest/repos/contents"
  }
];

export function ReferenceDocs({ sources = [] }) {
  return (
    <div className="docs-layout">
      <section>
        <div className="panel-title">
          <h2>저장소 근거</h2>
          <span>현재 활성 계약에서 읽음</span>
        </div>
        <div className="docs-list">
          {sources.map((source) => (
            <article key={source.path}>
              <FileText size={18} />
              <div>
                <strong>{source.title}</strong>
                <p>{source.detail}</p>
                <code>{source.path}</code>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section>
        <div className="panel-title">
          <h2>연구·표준 근거</h2>
          <span>설계 원칙</span>
        </div>
        <div className="docs-list">
          {EXTERNAL.map((source) => (
            <article key={source.url}>
              <FileText size={18} />
              <div>
                <strong>{source.title}</strong>
                <p>{source.detail}</p>
                <a href={source.url} target="_blank" rel="noreferrer">
                  원문 보기 <ExternalLink size={13} />
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
