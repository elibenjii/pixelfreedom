import ReactCrop, { type Crop, type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { snapRect } from "../../lib/edit";
import type { Rect } from "../../lib/crop";

type CropStageProps = {
  /**
   * Object URL of the working image. The raw ImageData deliberately stays out
   * of props: React's dev-mode performance instrumentation serializes changed
   * props, and walking megapixel pixel arrays freezes the page for minutes
   * (facebook/react#34770).
   */
  url: string;
  /** The working image's size in source pixels. */
  width: number;
  height: number;
  crop: Rect;
  aspect: number | null;
  onCropChange: (rect: Rect) => void;
  /** Show the "drag to crop" prompt over the image (fades once a box exists). */
  showHint: boolean;
};

/** Source-pixel rectangle → percentage crop for react-image-crop. */
function toPercent(rect: Rect, w: number, h: number): PercentCrop {
  return {
    unit: "%",
    x: (rect.x / w) * 100,
    y: (rect.y / h) * 100,
    width: (rect.w / w) * 100,
    height: (rect.h / h) * 100,
  };
}

/** Percentage crop → whole-pixel rectangle in source coordinates. */
function toRect(crop: PercentCrop, w: number, h: number): Rect {
  return snapRect(
    {
      x: (crop.x / 100) * w,
      y: (crop.y / 100) * h,
      w: (crop.width / 100) * w,
      h: (crop.height / 100) * h,
    },
    w,
    h,
  );
}

export default function CropStage({ url, width, height, crop, aspect, onCropChange, showHint }: CropStageProps) {
  // A full-frame crop means "nothing selected yet" — leave it undefined so the
  // user can drag out a fresh selection on the image (react-image-crop can't
  // draw a new box when an existing one already covers everything).
  const isFull = crop.x === 0 && crop.y === 0 && crop.w === width && crop.h === height;
  const value: Crop | undefined = isFull ? undefined : toPercent(crop, width, height);

  return (
    <div className="wm-crop">
      <ReactCrop
        crop={value}
        aspect={aspect ?? undefined}
        onChange={(_, percent) => onCropChange(toRect(percent, width, height))}
        ruleOfThirds
        keepSelection
        minWidth={16}
        minHeight={16}
      >
        <img src={url} alt="Crop preview" style={{ maxWidth: "100%", display: "block" }} />
      </ReactCrop>
      <div className={`wm-crop-hint${showHint ? "" : " is-hidden"}`} aria-hidden="true">
        Drag to select a crop area
      </div>
    </div>
  );
}
