import type { ImageMetadata } from "../../lib/metadata";
import type { C2paState } from "../../lib/c2pa";

type MetadataPanelProps = {
  metadata: ImageMetadata | null;
  c2pa: C2paState;
  onRetryC2pa: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function MetadataPanel({ metadata, c2pa, onRetryC2pa }: MetadataPanelProps) {
  if (!metadata) return null;

  const fileRows: [string, string][] = [
    ["File", metadata.fileName],
    ["Size", formatBytes(metadata.fileSize)],
    ["Type", metadata.mimeType],
    ["Dimensions", `${metadata.width} × ${metadata.height}`],
  ];

  const store = c2pa.status === "done" ? c2pa.store : null;
  const activeManifest = store?.active_manifest ? store.manifests?.[store.active_manifest] : null;

  return (
    <div className="wm-meta">
      <details>
        <summary>File</summary>
        <dl>
          {fileRows.map(([label, value]) => (
            <div className="wm-meta-row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </details>

      <details>
        <summary>EXIF ({metadata.exif.length})</summary>
        {metadata.exif.length === 0 ? (
          <p className="wm-meta-empty">No EXIF data found.</p>
        ) : (
          <dl>
            {metadata.exif.map(([label, value]) => (
              <div className="wm-meta-row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </details>

      <details open={!!store}>
        <summary>
          Content Credentials (C2PA)
          {c2pa.status === "loading" && ": checking..."}
          {c2pa.status === "error" && ": could not check"}
          {c2pa.status === "done" && !store && ": none"}
        </summary>
        {c2pa.status === "loading" && <p className="wm-meta-empty">Checking for a manifest...</p>}
        {c2pa.status === "error" && (
          <p className="wm-meta-empty">
            Could not check this file for a C2PA manifest.{" "}
            <button type="button" className="wm-meta-retry" onClick={onRetryC2pa}>
              Retry
            </button>
          </p>
        )}
        {c2pa.status === "done" && !store && (
          <p className="wm-meta-empty">No C2PA manifest found in this file.</p>
        )}
        {store && (
          <>
            <p className="wm-meta-warning">
              This file carries a Content Credentials manifest, often used to declare AI
              generation and edit history. Processing strips it.
            </p>
            <dl>
              {store.validation_state && (
                <div className="wm-meta-row">
                  <dt>Validation</dt>
                  <dd>{store.validation_state}</dd>
                </div>
              )}
              {activeManifest?.title && (
                <div className="wm-meta-row">
                  <dt>Title</dt>
                  <dd>{activeManifest.title}</dd>
                </div>
              )}
              {activeManifest?.claim_generator && (
                <div className="wm-meta-row">
                  <dt>Claim generator</dt>
                  <dd>{activeManifest.claim_generator}</dd>
                </div>
              )}
              {activeManifest?.signature_info?.issuer && (
                <div className="wm-meta-row">
                  <dt>Signed by</dt>
                  <dd>
                    {[activeManifest.signature_info.common_name, activeManifest.signature_info.issuer]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </div>
              )}
              {activeManifest?.signature_info?.time && (
                <div className="wm-meta-row">
                  <dt>Signed at</dt>
                  <dd>{activeManifest.signature_info.time}</dd>
                </div>
              )}
              {!!activeManifest?.ingredients?.length && (
                <div className="wm-meta-row">
                  <dt>Ingredients</dt>
                  <dd>
                    {activeManifest.ingredients
                      .map((ing) => ing.title ?? ing.instance_id ?? "unnamed")
                      .join(", ")}
                  </dd>
                </div>
              )}
              {!!activeManifest?.assertions?.length && (
                <div className="wm-meta-row">
                  <dt>Assertions</dt>
                  <dd>{activeManifest.assertions.map((a) => a.label).join(", ")}</dd>
                </div>
              )}
            </dl>
            <details className="wm-meta-raw">
              <summary>Raw manifest JSON</summary>
              <pre>{JSON.stringify(store, null, 2)}</pre>
            </details>
          </>
        )}
      </details>
    </div>
  );
}
