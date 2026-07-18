import resize from "@jsquash/resize";
import { extract, type Rect } from "./crop";

/** A crop handle: a compass edge/corner, or the interior for moving. */
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

/** Smallest crop the user is allowed to drag to, in source pixels. */
const MIN_SIZE = 16;

/** Clamp `n` into the inclusive range [lo, hi]. */
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The full image as a crop rectangle. */
export function fullRect(width: number, height: number): Rect {
  return { x: 0, y: 0, w: width, h: height };
}

/** Round a rectangle to whole pixels, keeping it inside the image bounds. */
export function snapRect(rect: Rect, width: number, height: number): Rect {
  const x = clamp(Math.round(rect.x), 0, width - 1);
  const y = clamp(Math.round(rect.y), 0, height - 1);
  return {
    x,
    y,
    w: clamp(Math.round(rect.w), 1, width - x),
    h: clamp(Math.round(rect.h), 1, height - y),
  };
}

/**
 * The largest rectangle of the given aspect ratio (w / h) that fits inside the
 * image, centred. Used when the user first locks an aspect ratio so the crop
 * box snaps to something sensible rather than jumping.
 */
export function centeredRectForAspect(width: number, height: number, aspect: number): Rect {
  let w = width;
  let h = w / aspect;
  if (h > height) {
    h = height;
    w = h * aspect;
  }
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/**
 * Apply a drag of `handle` to `start`, with the pointer now at (px, py) in
 * source-pixel coordinates. Keeps the result inside [0,width]×[0,height], no
 * smaller than MIN_SIZE, and — when `aspect` is set — locked to that ratio.
 */
export function dragRect(
  start: Rect,
  handle: Handle,
  px: number,
  py: number,
  dx: number,
  dy: number,
  width: number,
  height: number,
  aspect: number | null,
): Rect {
  if (handle === "move") {
    return {
      x: clamp(start.x + dx, 0, width - start.w),
      y: clamp(start.y + dy, 0, height - start.h),
      w: start.w,
      h: start.h,
    };
  }

  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;

  const movesW = handle.includes("w");
  const movesE = handle.includes("e");
  const movesN = handle.includes("n");
  const movesS = handle.includes("s");

  if (movesW) left = clamp(px, 0, right - MIN_SIZE);
  if (movesE) right = clamp(px, left + MIN_SIZE, width);
  if (movesN) top = clamp(py, 0, bottom - MIN_SIZE);
  if (movesS) bottom = clamp(py, top + MIN_SIZE, height);

  if (aspect) {
    const drivenByX = movesW || movesE;
    let w = right - left;
    let h = bottom - top;

    if (drivenByX && (movesN || movesS)) {
      // Corner drag: width leads, height follows, anchored at the fixed corner.
      h = w / aspect;
      if (movesN) top = bottom - h;
      else bottom = top + h;
      // If the derived edge left the image, re-solve from the height instead.
      if (top < 0 || bottom > height) {
        top = clamp(top, 0, height);
        bottom = clamp(bottom, 0, height);
        h = bottom - top;
        w = h * aspect;
        if (movesW) left = right - w;
        else right = left + w;
      }
    } else if (drivenByX) {
      // Horizontal edge: grow height symmetrically about the centre.
      const cy = (top + bottom) / 2;
      h = w / aspect;
      top = clamp(cy - h / 2, 0, height - h);
      bottom = top + h;
    } else {
      // Vertical edge: grow width symmetrically about the centre.
      const cx = (left + right) / 2;
      w = h * aspect;
      left = clamp(cx - w / 2, 0, width - w);
      right = left + w;
    }
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Resize `data` to exactly (width × height) with high-quality resampling. */
export async function resizeImageData(
  data: ImageData,
  width: number,
  height: number,
): Promise<ImageData> {
  if (width === data.width && height === data.height) return data;
  return resize(data, { width, height });
}

/**
 * Run the geometric edits the user chose: crop to `crop` (in source pixels),
 * then resize to (outW × outH). Either step is skipped when it is a no-op.
 */
export async function applyEdits(
  source: ImageData,
  crop: Rect,
  outW: number,
  outH: number,
): Promise<ImageData> {
  const isFullCrop =
    crop.x === 0 && crop.y === 0 && crop.w === source.width && crop.h === source.height;
  const cropped = isFullCrop ? source : extract(source, crop);
  return resizeImageData(cropped, outW, outH);
}
