# PixelFreedom

Edit, crop, resize, and convert a photo in one shot, then download a copy that's
been stripped of its metadata and subtly re-rendered so it stays undetectable.

Everything runs **entirely in your browser**. Images are never uploaded; all
processing happens locally with WebAssembly, so your photos never leave your machine.

## Features

- **Crop**: freeform or with aspect presets (1:1, 4:3, 16:9, original, …), portrait/landscape swap, and multi-step undo (`Ctrl/Cmd+Z`).
- **Resize**: set the output by width or height. Proportions are locked to the crop, and it never upscales.
- **Convert**: export as PNG, JPEG, WebP, or keep the original format.
- **Quality / target size**: pick a JPEG/WebP quality, or set a maximum file size and let it find the highest quality that fits (via binary search over the quality range). A live "≈ file size" estimate updates as you tweak settings.
- **Metadata inspector**: see the EXIF tags and [C2PA](https://c2pa.org/) content credentials embedded in the source image before you clean it.
- **Metadata stripping**: the downloaded file has all EXIF, C2PA, and other embedded metadata removed with ImageMagick.
- **Stealth transform**: a subtle pass (a 1px resize, an affine warp, a light Gaussian blur, and per-pixel noise/color perturbation) that changes the pixel data enough to defeat perceptual hashing and provenance matching while staying visually identical.
- **Drag and drop**: drop an image anywhere on the page to load it.

## Install

Requires **Node.js ≥ 22.12**. The examples use [Bun](https://bun.sh/), but npm, pnpm, or yarn work too.

```sh
# clone, then from the project root:
bun install
bun dev        # start the dev server at http://localhost:4321
```

That's it. Open the URL and start dropping in photos.

### Commands

| Command        | Action                                          |
| :------------- | :---------------------------------------------- |
| `bun install`  | Install dependencies                            |
| `bun dev`      | Start the local dev server at `localhost:4321`  |
| `bun build`    | Build the production site to `./dist/`          |
| `bun preview`  | Preview the production build locally            |

## Built with

[Astro](https://astro.build) + [React](https://react.dev), with all image work done
in-browser via WebAssembly: [OpenCV](https://github.com/TechStark/opencv-js),
[ImageMagick](https://github.com/dlemstra/magick-wasm),
[jSquash](https://github.com/jamsinclair/jSquash) (PNG/JPEG/WebP/resize),
[exifr](https://github.com/MikeKovarik/exifr), and
[c2pa-web](https://github.com/contentauth/c2pa-web).
