import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extract, type Rect } from "../lib/crop";
import {
  applyEdits,
  centeredRectForAspect,
  fullRect,
  snapRect,
} from "../lib/edit";
import { loadOrientedImageData } from "../lib/orientation";
import { applyStealthTransform } from "../lib/transform";
import { readImageMetadata, type ImageMetadata } from "../lib/metadata";
import {
  preloadC2pa,
  readC2paManifestStore,
  type C2paState,
} from "../lib/c2pa";
import { encode as encodeWebP } from "@jsquash/webp";
import { encode as encodeJpeg } from "@jsquash/jpeg";
import Dropzone from "./homepage/Dropzone";
import CropStage from "./homepage/CropStage";
import AspectChips, { type AspectPreset } from "./homepage/AspectChips";
import OutputSizeBar from "./homepage/OutputSizeBar";
import FormatPanel, {
  FORMAT_LABELS,
  type OutputFormat,
  type SizeMode,
  type SourceFormat,
} from "./homepage/FormatPanel";
import ActionBar from "./homepage/ActionBar";
import ProcessLog from "./homepage/ProcessLog";
import MetadataPanel from "./homepage/MetadataPanel";

// Preload only in the browser — during Astro's server-side prerender the
// WASM asset URL is a root-relative path that fetch() can't parse in Node.
if (typeof window !== "undefined") preloadC2pa();

/** Resolve a preset into a concrete aspect ratio for the current image. */
function presetRatio(
  preset: AspectPreset,
  width: number,
  height: number,
): number | null {
  if (preset.ratio === "original") return width / height;
  return preset.ratio;
}

/** A pre-"Apply crop" snapshot: the image and the selection that was applied. */
type UndoEntry = { image: ImageData; crop: Rect };

/** Undo history is capped so stacked full-size snapshots can't exhaust memory. */
const UNDO_DEPTH = 8;

/**
 * Highest-quality encode that fits within `targetBytes`, found by binary
 * search over the 1–100 quality range (at most ~7 encodes). When even
 * quality 1 is too big, that smallest possible file is returned anyway.
 */
async function encodeToFit(
  encode: (quality: number) => Promise<ArrayBuffer>,
  targetBytes: number,
): Promise<{ buffer: ArrayBuffer; quality: number }> {
  let lo = 1;
  let hi = 100;
  let best: { buffer: ArrayBuffer; quality: number } | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const buffer = await encode(mid);
    if (buffer.byteLength <= targetBytes) {
      best = { buffer, quality: mid };
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best ?? { buffer: await encode(1), quality: 1 };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Encode `data` in the given format and return only its byte size. */
async function encodedSize(
  data: ImageData,
  format: SourceFormat,
  quality: number,
): Promise<number> {
  if (format === "png") {
    const canvas = document.createElement("canvas");
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext("2d")!.putImageData(data, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
        "image/png",
      ),
    );
    return blob.size;
  }
  const buffer =
    format === "webp"
      ? await encodeWebP(data, { quality })
      : await encodeJpeg(data, { quality });
  return buffer.byteLength;
}

type FreedomPixelProps = {
  /**
   * Fired whenever an image is loaded (true) or cleared (false). The website
   * ignores it; the extension uses it to widen the sidebar into a comfortable
   * editing surface while a photo is open, then snap back when idle.
   */
  onEditingChange?: (editing: boolean) => void;
};

export default function FreedomPixel({
  onEditingChange,
}: FreedomPixelProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalRef = useRef<ImageData | null>(null);
  // The image edits currently act on. Starts as the original; "Apply crop"
  // bakes the selection in and replaces it. Reset restores the original.
  const workingRef = useRef<ImageData | null>(null);
  const resultRef = useRef<ImageData | null>(null);
  const currentFileRef = useRef<File | null>(null);
  const c2paRequestId = useRef(0);
  // Snapshots taken before each "Apply crop", newest last.
  const historyRef = useRef<UndoEntry[]>([]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [source, setSource] = useState<ImageData | null>(null);
  // Object URL rendering `source` for the crop stage's <img>.
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  const [aspectId, setAspectId] = useState("free");
  const [aspect, setAspect] = useState<number | null>(null);
  const [portrait, setPortrait] = useState(false);
  // Output scale relative to the crop; the exported size is crop × scale.
  const [scale, setScale] = useState(1);
  // Set right after a crop is baked in, cleared as soon as the user re-adjusts.
  const [appliedNote, setAppliedNote] = useState<string | null>(null);
  // Mirrors historyRef so the Undo button can render; the stack lives in the ref.
  const [canUndo, setCanUndo] = useState(false);

  const [processed, setProcessed] = useState(false);
  const [transforming, setTransforming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<OutputFormat>("original");
  const [quality, setQuality] = useState(85);
  const [sizeMode, setSizeMode] = useState<SizeMode>("quality");
  const [targetKB, setTargetKB] = useState(500);
  // What the last export actually produced, e.g. "487 KB at quality 78".
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [c2pa, setC2pa] = useState<C2paState>({ status: "loading" });
  // A live "≈ file size" for the current settings, and whether one is computing.
  const [sizeEstimate, setSizeEstimate] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);

  const addLog = useCallback((message: string) => {
    console.log("[transform]", message);
    setLog((prev) => [...prev, message]);
  }, []);

  const paint = useCallback((data: ImageData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext("2d")?.putImageData(data, 0, 0);
  }, []);

  const checkC2pa = useCallback((file: File) => {
    const requestId = ++c2paRequestId.current;
    setC2pa({ status: "loading" });
    readC2paManifestStore(file).then(
      (store) => {
        if (c2paRequestId.current === requestId)
          setC2pa({ status: "done", store });
      },
      (err) => {
        console.warn("Could not read C2PA manifest", err);
        if (c2paRequestId.current === requestId) setC2pa({ status: "error" });
      },
    );
  }, []);

  const retryC2pa = useCallback(() => {
    if (currentFileRef.current) checkC2pa(currentFileRef.current);
  }, [checkC2pa]);

  const updateCrop = useCallback((rect: Rect) => {
    setCrop(rect);
    setAppliedNote(null);
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      setError(null);
      setProcessed(false);
      setMetadata(null);
      setAppliedNote(null);
      resultRef.current = null;
      historyRef.current = [];
      setCanUndo(false);
      setExportNote(null);
      currentFileRef.current = file;
      checkC2pa(file);
      try {
        const data = await loadOrientedImageData(file);
        originalRef.current = data;
        workingRef.current = data;
        setSource(data);
        setFileName(file.name);
        setAspectId("free");
        setAspect(null);
        setPortrait(false);
        setCrop(fullRect(data.width, data.height));
        setScale(1);
        setMetadata(
          await readImageMetadata(file, {
            width: data.width,
            height: data.height,
          }),
        );
      } catch {
        setError("Could not read that file. Try a PNG, JPEG, or WebP.");
      }
    },
    [checkC2pa],
  );

  // Remove the current photo and return to the empty dropzone.
  const clearFile = useCallback(() => {
    c2paRequestId.current++; // invalidate any in-flight C2PA check
    originalRef.current = null;
    workingRef.current = null;
    resultRef.current = null;
    currentFileRef.current = null;
    historyRef.current = [];
    setFileName(null);
    setSource(null);
    setSourceUrl(null);
    setCrop({ x: 0, y: 0, w: 1, h: 1 });
    setAspectId("free");
    setAspect(null);
    setPortrait(false);
    setScale(1);
    setAppliedNote(null);
    setCanUndo(false);
    setProcessed(false);
    setError(null);
    setExportNote(null);
    setMetadata(null);
    setC2pa({ status: "loading" });
    setLog([]);
  }, []);

  const selectAspect = useCallback(
    (preset: AspectPreset) => {
      const image = workingRef.current;
      if (!image) return;
      setAspectId(preset.id);
      setPortrait(false);
      const ratio = presetRatio(preset, image.width, image.height);
      setAspect(ratio);
      if (ratio) {
        updateCrop(
          snapRect(
            centeredRectForAspect(image.width, image.height, ratio),
            image.width,
            image.height,
          ),
        );
      }
    },
    [updateCrop],
  );

  const swapAspect = useCallback(() => {
    const image = workingRef.current;
    if (!image || !aspect) return;
    const next = 1 / aspect;
    setAspect(next);
    setPortrait((p) => !p);
    updateCrop(
      snapRect(
        centeredRectForAspect(image.width, image.height, next),
        image.width,
        image.height,
      ),
    );
  }, [aspect, updateCrop]);

  // Bake the current selection into the working image and reset the box to the
  // new full frame — the crop is "validated" and subsequent edits build on it.
  const applyCrop = useCallback(() => {
    const image = workingRef.current;
    if (!image) return;
    const rect = snapRect(crop, image.width, image.height);
    const isFull =
      rect.x === 0 &&
      rect.y === 0 &&
      rect.w === image.width &&
      rect.h === image.height;
    if (isFull) return;
    const cropped = extract(image, rect);
    historyRef.current.push({ image, crop: rect });
    if (historyRef.current.length > UNDO_DEPTH) historyRef.current.shift();
    setCanUndo(true);
    workingRef.current = cropped;
    setSource(cropped);
    setError(null);
    setAspectId("free");
    setAspect(null);
    setPortrait(false);
    setCrop(fullRect(cropped.width, cropped.height));
    setScale(1);
    setAppliedNote(`Cropped to ${cropped.width} × ${cropped.height} px`);
  }, [crop]);

  // Revert the last "Apply crop", restoring the selection it baked in so the
  // user can adjust and re-apply it.
  const undo = useCallback(() => {
    const entry = historyRef.current.pop();
    if (!entry) return;
    setCanUndo(historyRef.current.length > 0);
    workingRef.current = entry.image;
    resultRef.current = null;
    setError(null);
    setAppliedNote(null);
    setSource(entry.image);
    setAspectId("free");
    setAspect(null);
    setPortrait(false);
    setCrop(entry.crop);
    setScale(1);
  }, []);

  // Clear any locked aspect preset — used when the selection resets to the
  // whole image.
  const dropAspectLock = useCallback(() => {
    setAspectId("free");
    setAspect(null);
    setPortrait(false);
  }, []);

  // Back to "whole image selected" — the same state as right after loading.
  const selectFull = useCallback(() => {
    const image = workingRef.current;
    if (!image) return;
    dropAspectLock();
    updateCrop(fullRect(image.width, image.height));
  }, [dropAspectLock, updateCrop]);

  // The W/H inputs set the exported pixel size. Both derive the same uniform
  // scale from one dimension, so the output always keeps the crop's
  // proportions — the crop box owns the aspect ratio. Capped at 100%: no
  // upscaling.
  const onOutWidth = useCallback(
    (value: number) => {
      const px = Math.max(1, Math.round(value) || 1);
      setScale(Math.min(1, Math.max(1 / crop.w, px / crop.w)));
    },
    [crop.w],
  );

  const onOutHeight = useCallback(
    (value: number) => {
      const px = Math.max(1, Math.round(value) || 1);
      setScale(Math.min(1, Math.max(1 / crop.h, px / crop.h)));
    },
    [crop.h],
  );

  const outW = Math.max(1, Math.round(crop.w * scale));
  const outH = Math.max(1, Math.round(crop.h * scale));

  // The format "Same as original" resolves to, derived from the file's MIME type.
  const sourceFormat: SourceFormat = useMemo(() => {
    const mime = metadata?.mimeType;
    if (mime === "image/jpeg") return "jpeg";
    if (mime === "image/png") return "png";
    return "webp";
  }, [metadata]);

  // The format the output is actually encoded in.
  const resolvedFormat: SourceFormat =
    format === "original" ? sourceFormat : format;

  // Live "≈ file size" for the current settings. Debounced, and computed on the
  // cropped+resized image *before* the cleaning pass (which adds a little), so
  // it's cheap and clearly an estimate. "Max file size" mode needs none — the
  // budget itself is the answer — so we skip encoding there.
  const skipEstimate = sizeMode === "size" && resolvedFormat !== "png";
  useEffect(() => {
    if (!fileName || processed || transforming || skipEstimate) {
      setEstimating(false);
      return;
    }
    const image = workingRef.current;
    if (!image) return;
    let cancelled = false;
    setEstimating(true);
    const timer = setTimeout(async () => {
      try {
        const edited = await applyEdits(image, crop, outW, outH);
        const bytes = await encodedSize(edited, resolvedFormat, quality);
        if (!cancelled) setSizeEstimate(bytes);
      } catch {
        if (!cancelled) setSizeEstimate(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    fileName,
    processed,
    transforming,
    skipEstimate,
    source,
    crop,
    outW,
    outH,
    resolvedFormat,
    quality,
  ]);

  const currentOutput = useCallback(async (): Promise<ImageData | null> => {
    if (resultRef.current) return resultRef.current;
    const image = workingRef.current;
    if (!image) return null;
    return applyEdits(image, crop, outW, outH);
  }, [crop, outW, outH]);

  // Encode the current output in the chosen format and save it. In "size"
  // mode the quality is picked automatically to fit the file-size budget.
  const download = useCallback(async () => {
    const data = await currentOutput();
    if (!data) return;
    const base = `cleaned-${(fileName ?? "image").replace(/\.[^.]+$/, "")}`;

    setExporting(true);
    try {
      let blob: Blob;
      let ext: string;
      let note: string;
      if (resolvedFormat === "png") {
        const canvas = document.createElement("canvas");
        canvas.width = data.width;
        canvas.height = data.height;
        canvas.getContext("2d")!.putImageData(data, 0, 0);
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
            "image/png",
          ),
        );
        ext = "png";
        note = `${formatBytes(blob.size)} PNG`;
      } else {
        const encode =
          resolvedFormat === "webp"
            ? (q: number) => encodeWebP(data, { quality: q })
            : (q: number) => encodeJpeg(data, { quality: q });
        const mime = resolvedFormat === "webp" ? "image/webp" : "image/jpeg";
        ext = resolvedFormat === "webp" ? "webp" : "jpg";
        if (sizeMode === "size") {
          const target = targetKB * 1024;
          const fit = await encodeToFit(encode, target);
          blob = new Blob([fit.buffer], { type: mime });
          note =
            blob.size > target
              ? `${formatBytes(blob.size)} (${targetKB} KB was out of reach even at quality 1)`
              : `${formatBytes(blob.size)} at quality ${fit.quality}`;
        } else {
          blob = new Blob([await encode(quality)], { type: mime });
          note = `${formatBytes(blob.size)} at quality ${quality}`;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNote(note);
    } finally {
      setExporting(false);
    }
  }, [currentOutput, fileName, resolvedFormat, quality, sizeMode, targetKB]);

  // The one-shot pipeline: crop → resize → stealth transform → download.
  const process = useCallback(async () => {
    const image = workingRef.current;
    if (!image) return;

    setTransforming(true);
    setError(null);
    setLog([]);
    try {
      addLog(`Cropping to ${crop.w}×${crop.h}…`);
      addLog(`Resizing to ${outW}×${outH}…`);
      const edited = await applyEdits(image, crop, outW, outH);
      const result = await applyStealthTransform(edited, addLog);
      addLog("Painting result…");
      resultRef.current = result;
      paint(result);
      setProcessed(true);
      addLog("Downloading…");
      await download();
      addLog("Done.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(`Error: ${message}`);
      setError(message || "Failed to process image");
    } finally {
      setTransforming(false);
    }
  }, [crop, outW, outH, addLog, paint, download]);

  // Return to the crop view after a result was produced, keeping the working
  // image and selection. Clear the cached result so re-editing takes effect.
  const backToEditing = useCallback(() => {
    resultRef.current = null;
    setProcessed(false);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    const image = originalRef.current;
    if (!image) return;
    workingRef.current = image;
    resultRef.current = null;
    historyRef.current = [];
    setCanUndo(false);
    setExportNote(null);
    setProcessed(false);
    setError(null);
    setAppliedNote(null);
    setSource(image);
    setAspectId("free");
    setAspect(null);
    setPortrait(false);
    setCrop(fullRect(image.width, image.height));
    setScale(1);
  }, []);

  // Render the working ImageData to an object URL for the crop stage. Done
  // here so CropStage's props stay small — see the note on CropStageProps.
  useEffect(() => {
    if (!source) return;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext("2d")?.putImageData(source, 0, 0);
    let objectUrl: string | null = null;
    let cancelled = false;
    canvas.toBlob((blob) => {
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSourceUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file?.type.startsWith("image/")) void loadFile(file);
    };
    // The extension's web-drop resolves images dragged off a page to a File
    // and delivers it here (a synthetic DragEvent can't carry dataTransfer).
    const webdropFile = (e: Event) => {
      const file = (e as CustomEvent<File>).detail;
      if (file?.type.startsWith("image/")) void loadFile(file);
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", drop);
    window.addEventListener("wm-webdrop-file", webdropFile);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", drop);
      window.removeEventListener("wm-webdrop-file", webdropFile);
    };
  }, [loadFile]);

  // Signal the host (extension sidebar) so it can widen while a photo is open.
  useEffect(() => {
    onEditingChange?.(!!(fileName && source));
  }, [fileName, source, onEditingChange]);

  const cropInfo = useMemo(() => `${crop.w} × ${crop.h} px`, [crop.w, crop.h]);

  const isFullCrop =
    !source ||
    (crop.x === 0 &&
      crop.y === 0 &&
      crop.w === source.width &&
      crop.h === source.height);
  const canApplyCrop = !!fileName && !processed && !transforming && !isFullCrop;

  // Live "what will happen" summary for the action bar: only the edits the
  // user actually made, always ending with the output format.
  const pipelineSteps = useMemo(() => {
    const steps: string[] = [];
    if (!isFullCrop) steps.push(`Crop ${crop.w} × ${crop.h}`);
    if (scale < 1) steps.push(`Resize ${outW} × ${outH}`);
    steps.push(
      format === "original"
        ? `${FORMAT_LABELS[resolvedFormat]} (original)`
        : FORMAT_LABELS[resolvedFormat],
    );
    return steps;
  }, [isFullCrop, crop.w, crop.h, scale, outW, outH, format, resolvedFormat]);

  // The "≈ 480 KB" hint on the download button (or "≤ 500 KB" in budget mode).
  const estimateLabel = useMemo(() => {
    if (skipEstimate) return `≤ ${targetKB} KB`;
    if (sizeEstimate != null) return `≈ ${formatBytes(sizeEstimate)}`;
    if (estimating) return "≈ …";
    return null;
  }, [skipEstimate, targetKB, sizeEstimate, estimating]);

  // False only when nothing is touched: full-frame crop, 100% scale, original format.
  const edited = pipelineSteps.length > 1 || format !== "original";

  // Enter validates the current crop, unless the user is typing in a field.
  useEffect(() => {
    if (!canApplyCrop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) return;
      e.preventDefault();
      applyCrop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canApplyCrop, applyCrop]);

  // Ctrl/Cmd+Z reverts the last applied crop, unless the user is typing.
  useEffect(() => {
    if (!canUndo || processed || transforming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "z" || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey)
        return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canUndo, processed, transforming, undo]);

  // Escape cancels the current crop selection.
  useEffect(() => {
    if (isFullCrop || processed || transforming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      e.preventDefault();
      selectFull();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullCrop, processed, transforming, selectFull]);

  return (
    <div className={`wm ${fileName && source ? "wm-has-file" : ""}`}>
      {(!fileName || !source) && (
        <>
          <div className="wm-steps">
            <span className="wm-step-item">
              <span className="wm-step-num">1</span> Drop a photo
            </span>
            <span className="wm-step-arrow" aria-hidden="true">
              →
            </span>
            <span className="wm-step-item">
              <span className="wm-step-num">2</span> Change only what you need
            </span>
            <span className="wm-step-arrow" aria-hidden="true">
              →
            </span>
            <span className="wm-step-item">
              <span className="wm-step-num">3</span> Download, it comes out
              cleaned
            </span>
          </div>
          <Dropzone
            fileName={fileName}
            onFile={(file) => void loadFile(file)}
          />
          {error && <p className="wm-error">{error}</p>}
        </>
      )}

      {fileName && source && (
        <div className="wm-layout">
          <div className="wm-main-panel">
            <Dropzone
              fileName={fileName}
              onFile={(file) => void loadFile(file)}
              onRemove={clearFile}
            />

            {error && (
              <p className="wm-error" style={{ marginTop: "1rem" }}>
                {error}
              </p>
            )}

            <div className="wm-stage">
              {processed ? (
                <canvas ref={canvasRef} />
              ) : (
                sourceUrl && (
                  <CropStage
                    url={sourceUrl}
                    width={source.width}
                    height={source.height}
                    crop={crop}
                    aspect={aspect}
                    onCropChange={updateCrop}
                    showHint={isFullCrop}
                  />
                )
              )}
              {!processed && (
                <div className="wm-stage-bar">
                  <div className="wm-stage-status">
                    <p className="wm-stage-info">
                      {appliedNote ? (
                        <span className="wm-applied">✓ {appliedNote}</span>
                      ) : isFullCrop ? (
                        "Full image, no crop"
                      ) : (
                        `Selection: ${cropInfo}`
                      )}
                    </p>
                    <button
                      type="button"
                      className="wm-btn wm-btn-sm wm-btn-ghost"
                      onClick={undo}
                      disabled={!canUndo || transforming}
                      title="Undo the last crop (Ctrl+Z)"
                    >
                      ↩ Undo
                    </button>
                  </div>
                  <div className="wm-stage-toolbar">
                    <AspectChips
                      value={aspectId}
                      portrait={portrait}
                      onSelect={selectAspect}
                      onSwap={swapAspect}
                    />
                    <div className="wm-stage-actions">
                      <button
                        type="button"
                        className="wm-btn wm-btn-sm wm-btn-ghost"
                        onClick={selectFull}
                        disabled={isFullCrop}
                        title="Cancel crop selection (Esc)"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="wm-btn wm-btn-sm wm-btn-accent"
                        onClick={applyCrop}
                        disabled={isFullCrop}
                        title="Apply the crop (Enter)"
                      >
                        Apply crop <kbd>⏎</kbd>
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {processed && <p className="wm-stage-info">Cleaned result</p>}
            </div>

            {!processed && (
              <OutputSizeBar
                cropWidth={crop.w}
                cropHeight={crop.h}
                outWidth={outW}
                outHeight={outH}
                scale={scale}
                onOutWidth={onOutWidth}
                onOutHeight={onOutHeight}
                onScale={setScale}
              />
            )}

            <MetadataPanel
              metadata={metadata}
              c2pa={c2pa}
              onRetryC2pa={retryC2pa}
            />
          </div>

          <div className="wm-sidebar">
            {!processed && (
              <div className="wm-controls">
                <section className="wm-sec">
                  <header className="wm-sec-head">Format</header>
                  <FormatPanel
                    format={format}
                    sourceFormat={sourceFormat}
                    quality={quality}
                    sizeMode={sizeMode}
                    targetKB={targetKB}
                    onFormat={setFormat}
                    onQuality={setQuality}
                    onSizeMode={setSizeMode}
                    onTargetKB={setTargetKB}
                  />
                </section>
              </div>
            )}

            <ActionBar
              processed={processed}
              transforming={transforming}
              exporting={exporting}
              exportNote={exportNote}
              steps={pipelineSteps}
              edited={edited}
              resolvedLabel={FORMAT_LABELS[resolvedFormat]}
              outWidth={outW}
              outHeight={outH}
              estimateLabel={estimateLabel}
              onProcess={() => void process()}
              onReset={reset}
              onDownload={() => void download()}
              onBack={backToEditing}
            />

            {(transforming || error) && log.length > 0 && (
              <ProcessLog lines={log} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
