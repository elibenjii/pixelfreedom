type OutputSizeBarProps = {
  /** The crop selection's pixel size — the ceiling for the output (no upscaling). */
  cropWidth: number;
  cropHeight: number;
  /** The exported pixel size (crop × scale) — shown in, and edited by, the W/H inputs. */
  outWidth: number;
  outHeight: number;
  /** Output scale relative to the crop (1 = exported at the crop's own size). */
  scale: number;
  onOutWidth: (px: number) => void;
  onOutHeight: (px: number) => void;
  onScale: (factor: number) => void;
};

const SCALES = [1, 0.75, 0.5, 0.25];

/**
 * The always-visible "what size do I get" control, sitting directly under the
 * crop stage. Crop sets the shape; this sets the exact pixels. Output can't
 * exceed the selection — we never upscale — so the W/H inputs cap at the crop.
 */
export default function OutputSizeBar({
  cropWidth,
  cropHeight,
  outWidth,
  outHeight,
  scale,
  onOutWidth,
  onOutHeight,
  onScale,
}: OutputSizeBarProps) {
  const full = scale >= 1;
  return (
    <div className="wm-outsize">
      <div className="wm-outsize-lead">
        <span className="wm-outsize-label">Output size</span>
        <span className="wm-opt">optional</span>
      </div>

      <div className="wm-resize">
        <label className="wm-dim">
          <span>W</span>
          <input
            type="number"
            min={1}
            max={cropWidth}
            value={outWidth}
            onChange={(e) => onOutWidth(Number(e.target.value))}
          />
        </label>
        <span className="wm-resize-px">×</span>
        <label className="wm-dim">
          <span>H</span>
          <input
            type="number"
            min={1}
            max={cropHeight}
            value={outHeight}
            onChange={(e) => onOutHeight(Number(e.target.value))}
          />
        </label>
        <span className="wm-resize-px">px</span>
      </div>

      <div className="wm-chips wm-scales">
        {SCALES.map((factor) => (
          <button
            key={factor}
            type="button"
            className={`wm-chip${factor === scale ? " is-active" : ""}`}
            onClick={() => onScale(factor)}
          >
            {factor * 100}%
          </button>
        ))}
      </div>

      <span className="wm-outsize-note">
        {full
          ? `full ${cropWidth} × ${cropHeight} selection`
          : `${Math.round(scale * 100)}% of ${cropWidth} × ${cropHeight} · never upscales`}
      </span>
    </div>
  );
}
