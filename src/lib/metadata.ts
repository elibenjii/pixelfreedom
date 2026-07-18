import exifr from "exifr";

export type ImageMetadata = {
	fileName: string;
	fileSize: number;
	mimeType: string;
	width: number;
	height: number;
	exif: [string, string][];
};

function formatExifValue(value: unknown): string | null {
	if (value == null) return null;
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value.toLocaleString();
	}
	if (value instanceof Uint8Array || value instanceof ArrayBuffer) return null;
	if (typeof value === "string") return value.length > 300 ? null : value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) {
		const rendered = value.map(formatExifValue).filter((v): v is string => v != null);
		return rendered.length ? rendered.join(", ") : null;
	}
	if (typeof value === "object") {
		try {
			const json = JSON.stringify(value);
			return json.length > 300 ? null : json;
		} catch {
			return null;
		}
	}
	return null;
}

async function readExifTags(file: File): Promise<[string, string][]> {
	try {
		const tags = await exifr.parse(file);
		if (!tags) return [];
		const rows: [string, string][] = [];
		for (const [key, raw] of Object.entries(tags)) {
			const value = formatExifValue(raw);
			if (value !== null) rows.push([key, value]);
		}
		return rows.sort(([a], [b]) => a.localeCompare(b));
	} catch (err) {
		console.warn("Could not parse EXIF metadata", err);
		return [];
	}
}

/** Reads file-level and EXIF metadata for display; never throws. */
export async function readImageMetadata(
	file: File,
	dimensions: { width: number; height: number },
): Promise<ImageMetadata> {
	const exif = await readExifTags(file);

	return {
		fileName: file.name,
		fileSize: file.size,
		mimeType: file.type || "unknown",
		width: dimensions.width,
		height: dimensions.height,
		exif,
	};
}
