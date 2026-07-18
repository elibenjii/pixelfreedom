import exifr from "exifr";

/** Reads EXIF orientation and returns the image's pixels normalized to right-side-up. */
export async function loadOrientedImageData(file: File): Promise<ImageData> {
	let orientation = 1;
	try {
		const parsed = await exifr.orientation(file);
		if (typeof parsed === "number") {
			orientation = parsed;
		}
	} catch (err) {
		console.warn("Could not parse EXIF orientation", err);
	}

	const bitmap = await createImageBitmap(file);

	let width = bitmap.width;
	let height = bitmap.height;

	if (orientation >= 5 && orientation <= 8) {
		width = bitmap.height;
		height = bitmap.width;
	}

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) throw new Error("Could not get a 2D context.");

	ctx.save();
	switch (orientation) {
		case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
		case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
		case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
		case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
		case 6: ctx.transform(0, 1, -1, 0, width, 0); break;
		case 7: ctx.transform(0, -1, -1, 0, width, height); break;
		case 8: ctx.transform(0, -1, 1, 0, 0, height); break;
		default: break;
	}
	ctx.drawImage(bitmap, 0, 0);
	ctx.restore();

	bitmap.close();

	return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
