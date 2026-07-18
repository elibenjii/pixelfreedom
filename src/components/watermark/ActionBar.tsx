import { useState } from "react";

type ActionBarProps = {
  processed: boolean;
  transforming: boolean;
  /** A download is being encoded right now. */
  exporting: boolean;
  /** What the last export produced, e.g. "487 KB at quality 78". */
  exportNote: string | null;
  /** Ordered pipeline steps, last one always the output format. */
  steps: string[];
  /** False when nothing is touched: full-frame crop, 100% scale, original format. */
  edited: boolean;
  /** Display name of the resolved output format, e.g. "WebP". */
  resolvedLabel: string;
  outWidth: number;
  outHeight: number;
  /** Live "≈ 480 KB" / "≤ 500 KB" size hint, or null when none is available. */
  estimateLabel: string | null;
  onProcess: () => void;
  onReset: () => void;
  onDownload: () => void;
  /** Return to the crop view after a result was produced, keeping the edits. */
  onBack: () => void;
};

const CLEANED_TITLE =
  "Every download is re-encoded in your browser: EXIF, metadata and C2PA manifests are stripped, and pixels are subtly altered to blur watermark traces.";

/** A small spinner shown inside a button while work is running. */
function Spinner() {
  return <span className="wm-spinner" aria-hidden="true" />;
}

export default function ActionBar({
  processed,
  transforming,
  exporting,
  exportNote,
  steps,
  edited,
  resolvedLabel,
  outWidth,
  outHeight,
  estimateLabel,
  onProcess,
  onReset,
  onDownload,
  onBack,
}: ActionBarProps) {
  const busy = transforming || exporting;
  const [showInfo, setShowInfo] = useState(false);

  if (processed) {
    return (
      <div className="wm-actions">
        {exportNote && <p className="wm-success">✓ Cleaned &amp; downloaded: {exportNote}</p>}
        <button className="wm-btn wm-btn-primary" onClick={onDownload} disabled={busy}>
          {exporting ? (
            <span className="wm-btn-busy">
              <Spinner /> Encoding…
            </span>
          ) : (
            "Download again"
          )}
        </button>
        <div className="wm-actions-row">
          <button className="wm-btn wm-btn-ghost wm-btn-sm" onClick={onBack} disabled={busy}>
            ← Back to editing
          </button>
          <button className="wm-btn wm-btn-ghost wm-btn-sm" onClick={onReset} disabled={busy}>
            ↺ Start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wm-actions">
      <p className="wm-summary">
        {edited ? (
          <>
            Output: <strong>{steps.join(" → ")}</strong>
            {" · "}
          </>
        ) : (
          <>No visual edits, original size &amp; format · </>
        )}
        <button
          type="button"
          className="wm-cleaned"
          aria-expanded={showInfo}
          onClick={() => setShowInfo((v) => !v)}
        >
          cleaned ⓘ
        </button>
      </p>
      {showInfo && <p className="wm-cleaned-info">{CLEANED_TITLE}</p>}
      <button className="wm-btn wm-btn-primary" onClick={onProcess} disabled={busy}>
        {transforming ? (
          <span className="wm-btn-busy">
            <Spinner /> Working…
          </span>
        ) : (
          <>
            Download {resolvedLabel}
            <small>
              {outWidth} × {outHeight} px
              {estimateLabel ? ` · ${estimateLabel}` : ""}
            </small>
          </>
        )}
      </button>
      <button className="wm-btn wm-btn-ghost wm-btn-sm" onClick={onReset} disabled={busy}>
        ↺ Start over
      </button>
    </div>
  );
}
