// The Sources of an Overlay, once it is on (Req 13.1): the name, the attribution and the terms.
// The terms are text: the app sets no `href` that leaves the page (Req 11.1).

import { LOOK } from '../../../components/look';
import type { OverlaySource } from '../math/overlay-types';

export function SourcesList({ sources }: { readonly sources: readonly OverlaySource[] }) {
  return (
    <ul style={{ ...LOOK.stack, margin: 0, paddingLeft: 20 }}>
      {sources.map((source) => (
        <li key={source.name} style={LOOK.dim}>
          {source.name}. {source.attribution}. Terms: {source.termsUrl}
        </li>
      ))}
    </ul>
  );
}
