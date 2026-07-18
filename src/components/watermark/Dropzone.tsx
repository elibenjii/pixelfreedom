type DropzoneProps = {
  fileName: string | null;
  onFile: (file: File) => void;
  /** When set, a ✕ appears on the file row to clear the photo entirely. */
  onRemove?: () => void;
};

export default function Dropzone({ fileName, onFile, onRemove }: DropzoneProps) {
  return (
    <label className="wm-drop">
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      {fileName ? (
        <>
          <span style={{ fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
          <span className="wm-drop-actions">
            <span className="wm-drop-change">Change file</span>
            {onRemove && (
              <button
                type="button"
                className="wm-drop-remove"
                title="Remove photo"
                aria-label="Remove photo"
                onClick={(e) => {
                  // Sits inside the <label>; don't let the click open the picker.
                  e.preventDefault();
                  e.stopPropagation();
                  onRemove();
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </span>
        </>
      ) : (
        <>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: '0.75rem' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span style={{ fontWeight: 500, fontSize: '1.0625rem' }}>Choose a photo or drop one here</span>
          <span style={{ fontSize: '0.8125rem', opacity: 0.5, marginTop: '0.25rem' }}>Supports PNG, JPEG, and WebP</span>
        </>
      )}
    </label>
  );
}
