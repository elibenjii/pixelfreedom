import cvModule from "@techstark/opencv-js";
import resize from "@jsquash/resize";
import { ImageMagick, initializeImageMagick } from "@imagemagick/magick-wasm";
import magickWasmUrl from "@imagemagick/magick-wasm/magick.wasm?url";

let magickReady: Promise<void> | null = null;
function ensureImageMagick(): Promise<void> {
  if (!magickReady) {
    magickReady = initializeImageMagick(
      new URL(magickWasmUrl, import.meta.url),
    );
  }
  return magickReady;
}

export async function applyStealthTransform(
  original: ImageData,
  onLog: (message: string) => void = () => {},
): Promise<ImageData> {
  // Resize image (+1px)
  onLog("Resizing image (+1px)...");
  const resized = await resize(original, {
    width: original.width + 1,
    height: original.height + 1,
  });

  // Load OpenCV runtime
  onLog("Loading OpenCV runtime...");
  const cv = await new Promise<typeof cvModule>((resolve) => {
    if (cvModule instanceof Promise) return resolve(cvModule);
    cvModule.onRuntimeInitialized = () => resolve(cvModule);
  });
  onLog("OpenCV ready.");

  // Convert to OpenCV matrix
  const srcMat = cv.matFromImageData(resized);

  // Apply affine warp
  onLog("Applying affine warp...");
  const dstMat = new cv.Mat();
  const M = cv.matFromArray(
    2,
    3,
    cv.CV_64FC1,
    [1.001, -0.001, -0.5, -0.001, 1.001, -0.5],
  );

  const dsize = new cv.Size(srcMat.cols, srcMat.rows);
  cv.warpAffine(srcMat, dstMat, M, dsize);

  // Apply Gaussian blur
  onLog("Applying Gaussian blur...");
  const ksize = new cv.Size(3, 3);
  cv.GaussianBlur(dstMat, dstMat, ksize, 0);

  // Inject noise and color perturbation
  onLog("Injecting noise and color perturbation...");
  const pixels = new Uint8ClampedArray(dstMat.data);
  for (let i = 0; i < pixels.length; i += 4) {
    const noise = (Math.random() - 0.5) * 6;
    pixels[i] += noise + (Math.random() - 0.5) * 4;
    pixels[i + 1] += noise + (Math.random() - 0.5) * 4;
    pixels[i + 2] += noise + (Math.random() - 0.5) * 4;
  }
  const result = new ImageData(pixels, dstMat.cols, dstMat.rows);

  srcMat.delete();
  dstMat.delete();
  M.delete();

  // Strip metadata with ImageMagick
  onLog("Stripping metadata with ImageMagick...");
  await ensureImageMagick();

  const canvas = document.createElement("canvas");
  canvas.width = result.width;
  canvas.height = result.height;
  canvas.getContext("2d")!.putImageData(result, 0, 0);

  const stripped = await ImageMagick.readFromCanvas(canvas, async (image) => {
    image.strip();
    return new Promise<ImageData>((resolve) => {
      const outCanvas = document.createElement("canvas");
      outCanvas.width = canvas.width;
      outCanvas.height = canvas.height;
      image.writeToCanvas(outCanvas);
      resolve(
        outCanvas
          .getContext("2d")!
          .getImageData(0, 0, outCanvas.width, outCanvas.height),
      );
    });
  });
  onLog("Metadata stripped.");

  return stripped;
}
