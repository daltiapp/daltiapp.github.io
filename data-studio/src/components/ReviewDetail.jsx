import { useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { MATCH_FIELDS } from "../data/defaults";

const SOURCE_LABELS = { title: "제목", detail: "상세", application: "접수", manual: "수동", board: "게시판" };

function SourceBadge({ source }) {
  if (!source) return null;
  const cls = `badge-${source}`;
  return <span className={`badge-source ${cls}`}>{SOURCE_LABELS[source] || source}</span>;
}

function ConfidenceBadge({ value }) {
  if (value == null) return null;
  const pct = typeof value === "number" ? Math.round(value * 100) : value;
  return <span className="chip chip-confidence">{pct}%</span>;
}

export function ReviewDetail({ item, onStatusChange, onItemEdit, onToast }) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(field, currentValue) {
    setEditingField(field);
    setEditValue(Array.isArray(currentValue) ? currentValue.join(", ") : String(currentValue || ""));
  }

  function commitEdit(field) {
    if (editingField !== field) return;
    const fieldDef = MATCH_FIELDS.find(f => f[0] === field);
    let value = editValue;
    if (fieldDef && fieldDef[2] === "list") {
      value = editValue.split(",").map(s => s.trim()).filter(Boolean);
    }
    onItemEdit(item.id, { [field]: value });
    setEditingField(null);
    setEditValue("");
  }

  function cancelEdit() {
    setEditingField(null);
    setEditValue("");
  }

  const requiredWarnings = (item.warnings || []).filter(w => w.level === "required");
  const warnFields = new Set(requiredWarnings.map(w => w.field));

  return (
    <div>
      {/* Source card */}
      <div className="review-source-card">
        <h4>원본 근거</h4>
        {item._source && (
          <div className="review-source-origin" style={{ marginBottom: "var(--sp-2)" }}>
            <span className={`chip chip-source chip-source-${item._source.key}`}>{item._source.label}</span>
          </div>
        )}
        <div className="review-source-title">{item.sourceTitle || "제목 없음"}</div>
        <div className="review-source-meta">
          {item.publishedAt && <span>게시일: {new Date(item.publishedAt).toLocaleDateString("ko-KR")}</span>}
          {item.collectedAt && <span>수집일: {new Date(item.collectedAt).toLocaleDateString("ko-KR")}</span>}
          {item.sourceUrl && (
            <a href={item.sourceUrl} target="_blank" rel="noreferrer">
              원문 보기 <ExternalLink size={11} />
            </a>
          )}
        </div>
        {item.images && item.images.length > 0 && (
          <div className="review-source-images">
            {item.images.map((img, i) => (
              <a key={i} href={img} target="_blank" rel="noreferrer">
                <img src={img} alt={`수집 이미지 ${i + 1}`} loading="lazy" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Warnings */}
      {requiredWarnings.length > 0 && (
        <div style={{ marginBottom: "var(--sp-4)" }}>
          {requiredWarnings.map((w, i) => (
            <div key={i} className="push-note" style={{ background: "var(--red-soft)", color: "var(--red-text)", marginBottom: "var(--sp-2)" }}>
              ⚠️ {w.field}: {w.message}
            </div>
          ))}
        </div>
      )}

      {/* Draft fields grid */}
      <div className="review-fields">
        {MATCH_FIELDS.map(([field, label, type]) => {
          const value = item.draft?.[field];
          const evidence = item.fieldEvidence?.[field];
          const isWarn = warnFields.has(field);
          const isLowConfidence = evidence && typeof evidence.confidence === "number" && evidence.confidence < 0.7;
          const isEditing = editingField === field;

          let fieldClass = "review-field";
          if (isWarn) fieldClass += " field-required";
          else if (isLowConfidence) fieldClass += " field-highlight";

          return (
            <div key={field} className={fieldClass}>
              <div className="review-field-header">
                <span className="review-field-label">{label}</span>
                <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                  {evidence && <SourceBadge source={evidence.source} />}
                  {evidence && <ConfidenceBadge value={evidence.confidence} />}
                </span>
              </div>
              <div className="review-field-value">
                {isEditing ? (
                  <span style={{ display: "flex", gap: "4px" }}>
                    {type === "list" ? (
                      <input
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") commitEdit(field); if (e.key === "Escape") cancelEdit(); }}
                        placeholder="콤마로 구분"
                        autoFocus
                      />
                    ) : (
                      <input
                        type={type === "datetime-local" ? "datetime-local" : "text"}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") commitEdit(field); if (e.key === "Escape") cancelEdit(); }}
                        autoFocus
                      />
                    )}
                    <button className="icon-button" onClick={() => commitEdit(field)} aria-label="저장" type="button">
                      <Check size={14} />
                    </button>
                    <button className="icon-button" onClick={cancelEdit} aria-label="취소" type="button">
                      <X size={14} />
                    </button>
                  </span>
                ) : (
                  <span
                    onClick={() => startEdit(field, value)}
                    style={{ cursor: "pointer", minHeight: "20px", display: "block" }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter") startEdit(field, value); }}
                    aria-label={`${label} 편집`}
                  >
                    {Array.isArray(value) ? (value.length ? value.join(", ") : "—") : (value || "—")}
                  </span>
                )}
              </div>
              {evidence?.raw && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "4px" }}>
                  원문: {evidence.raw}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="review-detail-actions">
        <button
          className="button primary"
          type="button"
          onClick={() => onStatusChange(item.id, "approved")}
          disabled={requiredWarnings.length > 0}
        >
          <Check size={16} /> 승인
        </button>
        <button
          className="button danger"
          type="button"
          onClick={() => onStatusChange(item.id, "rejected")}
        >
          <X size={16} /> 반려
        </button>
        {item.status !== "pending_review" && (
          <button
            className="button secondary"
            type="button"
            onClick={() => onStatusChange(item.id, "pending_review")}
          >
            검수대기로 되돌리기
          </button>
        )}
        <p className="review-detail-actions-note">
          {requiredWarnings.length > 0
            ? `필수 수정 ${requiredWarnings.length}건을 채우면 승인할 수 있습니다.`
            : "승인 후 반영 미리보기에서 커밋·푸시합니다."}
        </p>
      </div>
    </div>
  );
}
