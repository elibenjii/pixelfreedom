type ProcessLogProps = {
  lines: string[];
};

export default function ProcessLog({ lines }: ProcessLogProps) {
  if (lines.length === 0) return null;
  return <pre className="wm-log">{lines.join("\n")}</pre>;
}
