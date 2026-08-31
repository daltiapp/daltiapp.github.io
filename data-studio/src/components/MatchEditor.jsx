import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { EVENT_TYPES, MATCH_FIELDS, MATCH_OPTIONAL_KEYS } from "../data/defaults";

function toInputDate(value) {
  return value ? value.slice(0, 16) : "";
}

function SourceHint({ field, fieldEvidence }) {
  const evidence = fieldEvidence?.[field];
  return (
    <span className={`source-hint ${evidence?.confidence || "low"}`}>
      {evidence ? (
        <>
          <CheckCircle2 size={13} />
          {evidence.label} · {evidence.confidence === "high" ? "높음" : "검토"}
        </>
      ) : (
        <>
          <AlertTriangle size={13} />
          근거 확인 필요
        </>
      )}
    </span>
  );
}

export function MatchEditor({ draft, onChange, fieldEvidence }) {
  const update = (field, value) => {
    const next = { ...draft };
    const emptyOptional = MATCH_OPTIONAL_KEYS.includes(field)
      && (Array.isArray(value) ? value.length === 0 : String(value || "").trim() === "");
    if (emptyOptional) delete next[field];
    else next[field] = value;
    onChange(next);
  };
  return (
    <section className="editor-panel" aria-labelledby="draft-title">
      <div className="panel-title">
        <h2 id="draft-title">분석 초안</h2>
        <span>값은 직접 편집할 수 있습니다</span>
      </div>
      <div className="field-table">
        {MATCH_FIELDS.map(([field, label, type]) => {
          const value = draft[field];
          return (
            <div className="field-row" key={field}>
              <label htmlFor={`field-${field}`}>{label}</label>
              <div className="field-control">
                {type === "select" ? (
                  <select
                    id={`field-${field}`}
                    value={value || EVENT_TYPES[0]}
                    onChange={(event) => update(field, event.target.value)}
                  >
                    {EVENT_TYPES.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : type === "select-status" ? (
                  <select
                    id={`field-${field}`}
                    value={value || "detail_ready"}
                    onChange={(event) => update(field, event.target.value)}
                  >
                    <option value="detail_ready">detail_ready</option>
                    <option value="detail_pending">detail_pending</option>
                  </select>
                ) : (
                  <input
                    id={`field-${field}`}
                    type={type === "list" ? "text" : type}
                    value={
                      type === "list"
                        ? (Array.isArray(value) ? value : []).join(", ")
                        : type === "datetime-local"
                          ? toInputDate(value)
                          : value || ""
                    }
                    onChange={(event) =>
                      update(
                        field,
                        type === "list"
                          ? event.target.value
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean)
                          : event.target.value
                      )
                    }
                    placeholder={
                      type === "list" ? "쉼표로 여러 값을 구분" : undefined
                    }
                  />
                )}
              </div>
              <SourceHint field={field} fieldEvidence={fieldEvidence} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
