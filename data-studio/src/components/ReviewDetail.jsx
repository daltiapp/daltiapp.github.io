import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, CloudUpload, ExternalLink, Image as ImageIcon, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { MATCH_FIELDS, REVIEW_MATCH_FIELDS, matchDraftSchemaPass } from "../data/defaults";
import { api } from "../lib/api";

const SOURCE_LABELS = {
  title: "제목",
  detail: "상세",
  application: "신청 페이지",
  manual: "수동",
  board: "게시판",
  codex_image: "이미지"
};
const FIELD_LABELS = Object.fromEntries(MATCH_FIELDS.map(([field, label]) => [field, label]));

function fieldValue(value) {
  return Array.isArray(value) ? value.join(", ") : String(value || "");
}

function comparisonValue(value) {
  if (Array.isArray(value)) return value.join(" · ") || "없음";
  return String(value || "없음");
}

function imageSource(item, index) {
  const cached = (item.imageEvidence || []).find(image => image.imageIndex === index);
  if (cached?.cacheKey) return api.kauCacheUrl(cached.cacheKey);
  return item.images?.[index - 1] || "";
}

function EvidenceLabel({ evidence }) {
  if (!evidence) return <span className="draft-evidence is-missing">확인 필요</span>;
  const source = SOURCE_LABELS[evidence.source] || evidence.source;
  return <span className="draft-evidence">{evidence.imageIndex ? `이미지 ${evidence.imageIndex}` : source}</span>;
}

export function ReviewDetail({ item, onStatusChange, onItemEdit, onUploadImages, uploadingImages = false }) {
  const [selectedImage, setSelectedImage] = useState(1);
  const [values, setValues] = useState(() => structuredClone(item.draft || {}));

  useEffect(() => {
    setValues(structuredClone(item.draft || {}));
    setSelectedImage(1);
  }, [item.id, item.fingerprint]);

  const images = useMemo(() => {
    const count = Math.max(item.images?.length || 0, item.imageEvidence?.length || 0);
    return Array.from({ length: count }, (_, index) => ({
      index: index + 1,
      src: imageSource(item, index + 1)
    })).filter(image => image.src);
  }, [item]);
  const selectedSource = images.find(image => image.index === selectedImage)?.src || images[0]?.src || "";
  const driveImageCount = Array.isArray(item.detailImages) ? item.detailImages.length : 0;
  const requiresDriveImages = item._source?.key === "kau"
    && item.sourceClassification?.isAgilityCompetition === true;
  const canUploadImages = requiresDriveImages && images.length > 0;
  const requiredWarnings = (item.warnings || []).filter(warning => warning.level === "required");
  const warningFields = new Set(requiredWarnings.map(warning => warning.field));
  const automation = item.automation || {};
  const comparison = item.comparison || {};
  const differences = comparison.differences || [];
  const autoPositive = ["auto_ready", "applied"].includes(automation.state);
  const checks = automation.checks?.length
    ? automation.checks
    : comparison.ruleChecks?.length
      ? [
          { id: "schema", pass: matchDraftSchemaPass(item.draft), label: "13필드 + 선택 필드 통과" },
          ...comparison.ruleChecks
        ]
    : [
        { id: "schema", pass: matchDraftSchemaPass(item.draft), label: "13필드 + 선택 필드 통과" },
        { id: "url", pass: Boolean(item.draft?.url), label: "상세 URL 일치" },
        { id: "duplicate", pass: item._sync?.syncStatus !== "applied", label: "중복 없음" },
        { id: "venue", pass: Boolean(item.draft?.location), label: "장소 연결" }
      ];

  function updateValue(field, type, rawValue) {
    const value = type === "list"
      ? rawValue.split(",").map(part => part.trim()).filter(Boolean)
      : rawValue;
    setValues(current => ({ ...current, [field]: value }));
  }

  function commitField(field) {
    if (JSON.stringify(values[field]) === JSON.stringify(item.draft?.[field])) return;
    onItemEdit(item.id, { [field]: values[field] });
  }

  return (
    <>
      <section className="review-evidence-panel" aria-label="원본 증거">
        <div className="panel-heading-row">
          <h2>원본 증거</h2>
          <div className="panel-heading-actions">
            {canUploadImages && (
              <button
                className="source-open-button drive-upload-button"
                type="button"
                disabled={uploadingImages}
                onClick={() => onUploadImages?.(item.id)}
              >
                {uploadingImages ? <LoaderCircle className="spin" size={14} /> : <CloudUpload size={14} />}
                {driveImageCount ? `Drive ${driveImageCount}장` : "Drive 업로드"}
              </button>
            )}
            {item.sourceUrl && (
              <a className="source-open-button" href={item.sourceUrl} target="_blank" rel="noreferrer">
                원문 열기 <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
        <h3 className="evidence-title">{item.sourceTitle || item.draft?.name || "제목 없음"}</h3>
        <p className="evidence-date">
          게시일: {item.publishedAt ? new Date(item.publishedAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "확인 필요"}
        </p>
        <div className={`source-classification ${item.sourceClassification?.isAgilityCompetition ? "is-pass" : "is-warn"}`}>
          {item.sourceClassification?.isAgilityCompetition ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
          {item.sourceClassification?.reason || "어질리티 대회 분류 근거를 다시 확인해야 합니다."}
        </div>
        {requiresDriveImages && (
          <div className={`source-classification ${driveImageCount ? "is-pass" : "is-warn"}`}>
            <CloudUpload size={15} />
            {driveImageCount
              ? `Gmail Drive 공개 이미지 ${driveImageCount}장 준비됨`
              : "Drive 업로드 후에만 일정 JSON에 반영할 수 있습니다."}
          </div>
        )}

        <div className="poster-stage">
          {selectedSource ? (
            <img src={selectedSource} alt={`${item.sourceTitle || "대회"} 게시물 이미지 ${selectedImage}`} />
          ) : (
            <div className="poster-empty">
              <ImageIcon size={42} />
              <strong>본문 이미지 없음</strong>
              <span>제목 근거만으로 자동반영하지 않습니다.</span>
            </div>
          )}
        </div>

        {images.length > 0 && (
          <div className="poster-thumbnails" aria-label="게시물 이미지 목록">
            {images.map(image => (
              <button
                key={image.index}
                className={selectedImage === image.index ? "is-active" : ""}
                type="button"
                onClick={() => setSelectedImage(image.index)}
              >
                <img src={image.src} alt="" />
                <span>이미지 {image.index}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="review-editor-panel" aria-label="일정 JSON 초안">
        <div className="panel-heading-row editor-heading">
          <h2>일정 JSON 초안</h2>
          <span>자동 추출 근거</span>
        </div>

        {item.diffKind === "changed" && (
          <div className="comparison-card">
            <div className="comparison-heading">
              <TriangleAlert size={17} />
              <div>
                <h3>기존 일정 변경 — 사용자 확인 필수</h3>
                <p>같은 상세 URL의 활성 JSON과 달라진 필드입니다.</p>
              </div>
            </div>
            {differences.length ? (
              <div className="comparison-table">
                {differences.map(difference => (
                  <div className="comparison-row" key={difference.field}>
                    <strong>{FIELD_LABELS[difference.field] || difference.field}</strong>
                    <span><small>기존</small>{comparisonValue(difference.before)}</span>
                    <span><small>수집</small>{comparisonValue(difference.after)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="comparison-empty">현재 초안과 활성 JSON의 필드 차이를 다시 계산해 주세요.</p>}
          </div>
        )}

        <div className="draft-table">
          <div className="draft-table-head"><span>필드</span><span>값</span><span>근거</span></div>
          {REVIEW_MATCH_FIELDS.map(([field, label, type]) => {
            const value = values[field];
            const warning = warningFields.has(field);
            const evidence = item.fieldEvidence?.[field];
            return (
              <label className={`draft-row ${warning ? "is-warning" : ""}`} key={field}>
                <span className="draft-label">{label}</span>
                <span className="draft-control">
                  <input
                    type={type === "datetime-local" ? "datetime-local" : "text"}
                    value={fieldValue(value)}
                    placeholder={type === "list" ? "쉼표로 구분" : "선택 또는 입력..."}
                    onChange={event => updateValue(field, type, event.target.value)}
                    onBlur={() => commitField(field)}
                    onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
                  />
                </span>
                <EvidenceLabel evidence={evidence} />
              </label>
            );
          })}
        </div>

        <div className="validation-card">
          <h3>검증 요약</h3>
          <div className="validation-pills">
            {checks.map(check => (
              <span className={check.pass ? "is-pass" : "is-warn"} key={check.id}>
                {check.pass ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
                {check.label}
              </span>
            ))}
          </div>
        </div>

        <div className={`automation-card ${autoPositive ? "is-positive" : "is-review"}`}>
          {autoPositive ? <Check size={25} /> : <TriangleAlert size={25} />}
          <div>
            <strong>{autoPositive ? "자동 반영 조건 충족" : "운영자 확인 필요"}</strong>
            <p>
              {autoPositive
                ? "새 URL 1건 · 필수 경고 없음 · 앱 푸시 없음"
                : (automation.reasons || requiredWarnings.map(warning => warning.message)).join(" · ") || "필드 근거를 확인해 주세요."}
            </p>
          </div>
        </div>

        <div className="editor-actions">
          <button className="button secondary" type="button" onClick={() => onStatusChange(item.id, "rejected")}>
            <X size={16} /> 반려
          </button>
          <button
            className="button primary"
            type="button"
            disabled={requiredWarnings.length > 0 || (requiresDriveImages && driveImageCount === 0) || uploadingImages}
            onClick={() => onStatusChange(item.id, "approved")}
          >
            <Check size={16} /> 검수 승인
          </button>
        </div>
      </section>
    </>
  );
}
