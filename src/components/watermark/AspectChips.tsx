export type AspectPreset = {
  id: string;
  label: string;
  /** width / height, or null for a free-form crop, or "original" to compute it. */
  ratio: number | null | "original";
};

export const ASPECT_PRESETS: AspectPreset[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "original", label: "Original", ratio: "original" },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
];

type AspectChipsProps = {
  value: string;
  portrait: boolean;
  onSelect: (preset: AspectPreset) => void;
  onSwap: () => void;
};

export default function AspectChips({ value, portrait, onSelect, onSwap }: AspectChipsProps) {
  const active = ASPECT_PRESETS.find((p) => p.id === value);
  const canSwap = active !== undefined && active.ratio !== null && active.id !== "1:1";

  return (
    <div className="wm-chips" role="group" aria-label="Crop aspect ratio">
      {ASPECT_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={`wm-chip${preset.id === value ? " is-active" : ""}`}
          aria-pressed={preset.id === value}
          onClick={() => onSelect(preset)}
        >
          {preset.label}
        </button>
      ))}
      <button
        type="button"
        className="wm-chip wm-chip-icon"
        onClick={onSwap}
        disabled={!canSwap}
        title="Swap orientation"
        aria-label="Swap crop orientation"
      >
        {portrait ? "↕" : "↔"}
      </button>
    </div>
  );
}
