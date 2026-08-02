import {
  Bell,
  BookOpenText,
  Braces,
  GitBranch,
  Inbox,
  Instagram,
  MapPin,
  ShieldCheck
} from "lucide-react";

const ITEMS = [
  ["review", "검수 큐", Inbox],
  ["instagram", "Instagram", Instagram],
  ["match", "대회 데이터", Braces],
  ["venue", "장소", MapPin],
  ["notice", "공지", Bell],
  ["repository", "저장소", GitBranch],
  ["docs", "문서", BookOpenText]
];

export function Sidebar({ active, onChange, health, pendingCount }) {
  return (
    <aside className="sidebar" aria-label="주요 탐색">
      <div className="brand">
        <span className="brand-mark">D</span>
        <span>Data Studio</span>
      </div>
      <nav aria-label="주요 메뉴">
        {ITEMS.map(([id, label, Icon]) => (
          <button
            className={`nav-item ${active === id ? "is-active" : ""}`}
            key={id}
            onClick={() => onChange(id)}
            type="button"
            aria-current={active === id ? "page" : undefined}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
            {id === "review" && pendingCount > 0 && (
              <span className="nav-badge" aria-label={`검수 대기 ${pendingCount}건`}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <ShieldCheck size={17} />
        <div>
          <strong>{health?.branch || "main"}</strong>
          <span className={health?.clean ? "status-clean" : "status-warn"}>
            {health?.clean ? "원격 동기화" : "로컬 변경 있음"}
          </span>
        </div>
      </div>
    </aside>
  );
}
