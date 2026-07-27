import { BookOpenText, ExternalLink, FileJson2, Link2 } from "lucide-react";

export function EvidencePanel({ evidence = [] }) {
  const icons = [Link2, FileJson2, BookOpenText];
  return (
    <aside className="evidence-panel">
      <div className="panel-title">
        <h2>근거 {evidence.length || 3}개</h2>
        <span>필드별 출처 추적</span>
      </div>
      <div className="evidence-list">
        {evidence.map((item, index) => {
          const Icon = icons[index] || BookOpenText;
          return (
            <article className="evidence-item" key={`${item.label}-${index}`}>
              <Icon size={17} />
              <div>
                <strong>{item.label}</strong>
                <p>{item.value}</p>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer">
                    원본 열기 <ExternalLink size={13} />
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      <div className="evidence-note">
        분석값은 초안입니다. 원문과 다른 필드는 직접 수정하고 확정 전 검사를
        다시 실행하세요.
      </div>
    </aside>
  );
}
