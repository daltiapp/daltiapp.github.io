import { Globe2, Instagram, LoaderCircle, TextCursorInput } from "lucide-react";

export function SourceImporter({
  url,
  text,
  onUrl,
  onText,
  onAnalyze,
  loading
}) {
  return (
    <section className="source-importer" aria-labelledby="source-title">
      <div className="section-heading">
        <div>
          <h2 id="source-title">원본 가져오기</h2>
          <p>사이트·공개 Instagram·복사한 본문을 근거로 초안을 만듭니다.</p>
        </div>
      </div>
      <div className="source-row">
        <label className="sr-only" htmlFor="source-url">
          원본 URL
        </label>
        <input
          id="source-url"
          value={url}
          onChange={(event) => onUrl(event.target.value)}
          placeholder="https:// 원본 상세 페이지 또는 Instagram 게시물"
          type="url"
        />
        <button
          className="button secondary"
          onClick={() => onAnalyze("site")}
          disabled={loading || !url}
          type="button"
        >
          <Globe2 size={17} />
          사이트 분석
        </button>
        <button
          className="button secondary accent-border"
          onClick={() => onAnalyze("instagram")}
          disabled={loading || !url}
          type="button"
        >
          <Instagram size={17} />
          Instagram 분석
        </button>
      </div>
      <details className="paste-panel" open={Boolean(text)}>
        <summary>
          <TextCursorInput size={16} />
          텍스트 붙여넣기
        </summary>
        <textarea
          value={text}
          onChange={(event) => onText(event.target.value)}
          placeholder="이미지 OCR 결과나 게시글 본문을 붙여넣으세요. 원문 URL과 함께 남기면 근거가 보존됩니다."
        />
        <button
          className="button secondary"
          onClick={() => onAnalyze("text")}
          disabled={loading || !text.trim()}
          type="button"
        >
          {loading ? <LoaderCircle className="spin" size={17} /> : null}
          붙여넣은 내용 분석
        </button>
      </details>
    </section>
  );
}
