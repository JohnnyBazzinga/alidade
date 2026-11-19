// The legend of one Overlay (Req 18.4): each drawing with its Source and the time of its data.

import { clockTextUtc } from '../../../math/civil-time';
import { LOOK } from '../../../components/look';
import type { LegendEntry } from '../math/overlay-types';

export function Legend({ entries }: { readonly entries: readonly LegendEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <ul style={{ ...LOOK.stack, margin: 0, paddingLeft: 20 }}>
      {entries.map((entry) => (
        <li key={`${entry.label}:${entry.sourceName}`} style={LOOK.text}>
          {entry.label} Source: {entry.sourceName}
          {entry.timeUtcMs === null ? '' : `, data of ${clockTextUtc(entry.timeUtcMs)}`}.
        </li>
      ))}
    </ul>
  );
}
