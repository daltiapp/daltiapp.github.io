import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ShieldAlert
} from "lucide-react";

export function ValidationRail({ checks = [], health }) {
  return (
    <aside className="validation-rail">
      <div className="panel-title">
        <h2>확정 전 검사</h2>
        <span>실패 시 확정 차단</span>
      </div>
      <div className="check-list">
        {checks.map((check) => {
          const Icon =
            check.status === "pass"
              ? CheckCircle2
              : check.status === "warn"
                ? AlertTriangle
                : Circle;
          return (
            <div className={`check-row ${check.status}`} key={check.id}>
              <Icon size={20} />
              <div>
                <strong>{check.label}</strong>
                <p>{check.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="approval-note">
        <ShieldAlert size={20} />
        <div>
          <strong>사람의 승인 필수</strong>
          <p>초안 저장은 가능하지만 파일 쓰기·Git 작업은 별도 확정 후 실행됩니다.</p>
        </div>
      </div>
      {!health?.clean ? (
        <div className="repo-warning">
          현재 저장소에 로컬 변경이 있어 확정이 차단됩니다.
        </div>
      ) : null}
    </aside>
  );
}
