export function VenueEditor({ draft, onChange }) {
  const updateRoot = (field, value) => onChange({ ...draft, [field]: value });
  const updateLocation = (field, value) =>
    onChange({
      ...draft,
      location: { ...draft.location, [field]: value }
    });

  return (
    <section className="editor-panel">
      <div className="panel-title">
        <h2>장소 분석 초안</h2>
        <span>주소와 좌표는 지도 원본으로 재확인</span>
      </div>
      <div className="venue-form">
        <label>
          장소명
          <input
            value={draft.name}
            onChange={(event) => {
              updateRoot("name", event.target.value);
              updateLocation("name", event.target.value);
            }}
          />
        </label>
        <label className="wide">
          주소
          <input
            value={draft.location.address}
            onChange={(event) => updateLocation("address", event.target.value)}
          />
        </label>
        <label>
          위도
          <input
            type="number"
            step="any"
            value={draft.location.latitude}
            onChange={(event) => updateLocation("latitude", event.target.value)}
          />
        </label>
        <label>
          경도
          <input
            type="number"
            step="any"
            value={draft.location.longitude}
            onChange={(event) => updateLocation("longitude", event.target.value)}
          />
        </label>
        <label className="wide">
          사진 URL
          <textarea
            value={draft.photos.join("\n")}
            onChange={(event) =>
              updateRoot(
                "photos",
                event.target.value
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean)
              )
            }
            placeholder="한 줄에 하나씩 입력"
          />
        </label>
      </div>
    </section>
  );
}
