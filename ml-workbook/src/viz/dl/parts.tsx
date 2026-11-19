// Small drawing pieces shared by the deep-learning figures.
import { usePlane, type P2 } from '../kit';

/** Many small dots in world coordinates (cheaper than <Point> and without labels). */
export function Dots({ pts, r = 3.4, color, stroke = true }: { pts: { at: P2; color?: string }[]; r?: number; color?: string; stroke?: boolean }) {
  const { sx, sy } = usePlane();
  return (
    <g className={stroke ? 'dl-dots' : undefined}>
      {pts.map((p, i) => (
        <circle key={i} cx={sx(p.at[0])} cy={sy(p.at[1])} r={r} style={{ fill: p.color ?? color ?? 'var(--fg)' }} />
      ))}
    </g>
  );
}
