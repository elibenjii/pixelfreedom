export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Where Gemini stamps its sparkle, measured from real output: centred at
 * (88.5% W, 86.5% H), about 3% of the width across. The box is padded well
 * past the glyph on every side so placement jitter between renders stays
 * covered — the crop only needs the box's inner edge, so generosity here
 * costs little.
 */
export function geminiMarkRect(width: number, height: number): Rect {
	const size = Math.min(width, height) * 0.1;
	return {
		x: width * 0.885 - size / 2,
		y: height * 0.865 - size / 2,
		w: size,
		h: size,
	};
}

/**
 * Largest centred window with the image's aspect ratio that excludes `mark`.
 *
 * The window keeps the image's centre, so it trims the same fraction from
 * opposite edges — the composition stays centred, at the price of shrinking
 * twice as fast toward the mark as an anchored crop would. It shrinks until
 * its edge clears the mark on whichever axis costs less. Returns null when
 * the mark overlaps the centre, where no centred window can exclude it.
 */
export function cropCentered(width: number, height: number, mark: Rect): Rect | null {
	// Surviving fraction of each axis if the window's edge must stop at the
	// mark's near side.
	const sx =
		mark.x + mark.w / 2 < width / 2
			? 1 - (2 * (mark.x + mark.w)) / width
			: (2 * mark.x) / width - 1;
	const sy =
		mark.y + mark.h / 2 < height / 2
			? 1 - (2 * (mark.y + mark.h)) / height
			: (2 * mark.y) / height - 1;
	if (Math.max(sx, sy) <= 0) return null;

	let w: number;
	let h: number;
	if (sx >= sy) {
		w = Math.floor(width * sx);
		h = Math.min(height, Math.round((w * height) / width));
	} else {
		h = Math.floor(height * sy);
		w = Math.min(width, Math.round((h * width) / height));
	}
	if (w < 1 || h < 1) return null;

	// Flooring the offsets keeps the window's far edge at or inside the
	// mark's near side after rounding.
	return { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), w, h };
}

/** Copy of the window's pixels as standalone ImageData. */
export function extract(src: ImageData, win: Rect): ImageData {
	const out = new ImageData(win.w, win.h);
	for (let y = 0; y < win.h; y++) {
		const from = ((win.y + y) * src.width + win.x) * 4;
		out.data.set(src.data.subarray(from, from + win.w * 4), y * win.w * 4);
	}
	return out;
}
