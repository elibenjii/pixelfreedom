export type OutputFormat = "original" | "webp" | "jpeg" | "png";

/** The format the loaded source file decodes as — "original" resolves to this. */
export type SourceFormat = "webp" | "jpeg" | "png";

/** How the lossy encoder is driven: a fixed quality, or a file-size budget. */
export type SizeMode = "quality" | "size";

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  original: "Same as original",
  webp: "WebP",
  jpeg: "JPEG",
  png: "PNG",
};

const FORMATS: OutputFormat[] = ["original", "webp", "jpeg", "png"];

const QUALITY_PRESETS: { label: string; value: number }[] = [
  { label: "Smaller · 70", value: 70 },
  { label: "Balanced · 85", value: 85 },
  { label: "Best · 95", value: 95 },
];

type FormatPanelProps = {
  format: OutputFormat;
  /** What the "Same as original" choice resolves to for the loaded file. */
  sourceFormat: SourceFormat;
  quality: number;
  sizeMode: SizeMode;
  targetKB: number;
  onFormat: (format: OutputFormat) => void;
  onQuality: (value: number) => void;
  onSizeMode: (mode: SizeMode) => void;
  onTargetKB: (kb: number) => void;
};

export default function FormatPanel({
  format,
  sourceFormat,
  quality,
  sizeMode,
  targetKB,
  onFormat,
  onQuality,
  onSizeMode,
  onTargetKB,
}: FormatPanelProps) {
  // The format the output will actually be encoded in — drives which
  // controls are relevant (PNG is lossless and has no quality parameter).
  const effective = format === "original" ? sourceFormat : format;

  return (
    <div className="wm-field">
      <div className="wm-chips wm-chips-formats">
        {FORMATS.map((f) => (
          <button
            key={f}
            type="button"
            className={`wm-chip${f === format ? " is-active" : ""}`}
            onClick={() => onFormat(f)}
          >
            {f === "original"
              ? `Same as original (${FORMAT_LABELS[sourceFormat]})`
              : FORMAT_LABELS[f]}
          </button>
        ))}
      </div>

      {effective === "png" ? (
        <p className="wm-note">
          <strong>PNG is always lossless</strong>, there’s no quality % to set.
        </p>
      ) : (
        <>
          <div className="wm-chips wm-mode">
            <button
              type="button"
              className={`wm-chip${sizeMode === "quality" ? " is-active" : ""}`}
              onClick={() => onSizeMode("quality")}
            >
              Quality
            </button>
            <button
              type="button"
              className={`wm-chip${sizeMode === "size" ? " is-active" : ""}`}
              onClick={() => onSizeMode("size")}
              title="Pick the best quality that fits within a file-size budget"
            >
              Max file size
            </button>
          </div>

          {sizeMode === "quality" ? (
            <>
              <div className="wm-quality">
                <label>
                  Quality: <strong>{quality}%</strong>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={quality}
                    onChange={(e) => onQuality(Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="wm-chips wm-presets">
                {QUALITY_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`wm-chip${preset.value === quality ? " is-active" : ""}`}
                    onClick={() => onQuality(preset.value)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="wm-resize">
              <label className="wm-dim">
                <span>≤</span>
                <input
                  type="number"
                  min={1}
                  value={targetKB}
                  onChange={(e) => onTargetKB(Math.max(1, Math.round(Number(e.target.value) || 0)))}
                />
              </label>
              <span className="wm-resize-px">KB</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
