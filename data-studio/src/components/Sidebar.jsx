import {
  Bell,
  BookOpenText,
  Braces,
  GitBranch,
  History,
  MapPin,
  ShieldCheck
} from "lucide-react";

const ITEMS = [
  ["inbox", "저장소", GitBranch],
  ["match", "대회 JSON", Braces],
  ["venue", "장소 JSON", MapPin],
  ["notice", "공지사항", Bell],
  ["history", "변경 이력", History],
  ["docs", "근거 문서", BookOpenText]
];

export function Sidebar({ active, onChange, health }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">D</span>
        <span>Dalti Data Studio</span>
      </div>
      <nav aria-label="주요 메뉴">
        {ITEMS.map(([id, label, Icon]) => (
          <button
            className={`nav-item ${active === id ? "is-active" : ""}`}
            key={id}
            onClick={() => onChange(id)}
            type="button"
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <ShieldCheck size={17} />
        <div>
          <strong>{health?.branch || "main"}</strong>
          <span className={health?.clean ? "status-clean" : "status-warn"}>
            {health?.clean ? "변경 없음" : "로컬 변경 확인 필요"}
          </span>
        </div>
      </div>
    </aside>
  );
}
