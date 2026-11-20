// The map's attribution, read clearly (task 31 continued; Req 15.2 as amended on 2026-11-20). The
// tile provider's policy asks for an attribution shown clearly; with `compact: false` the map
// library's control keeps its half-transparent white strip and takes the page's text colour, which
// on this skeleton's dark pages is pale text on a pale strip. This style gives it the map's dark ink
// on the map's light ink (an opaque strip, `theme.ts` holds the pair to 7:1), links in the same
// colour and underlined, and a size and line height of its own, so that the height of the strip is
// this module's number and the fit can keep it clear (`ATTRIBUTION_STRIP_PX`).
//
// The rules are scoped to a class that `MapView` puts on its map container, and are marked
// `!important` because the library's stylesheet, which the app imports, comes after or before ours
// in an order this module does not control. Pure text: no URL, no import.

import { MAP_DARK, MAP_LIGHT } from './map-style';

/** The text and the links of the attribution: the map's dark ink. */
export const ATTRIBUTION_TEXT = MAP_DARK;
/** The strip under them: the map's light ink, opaque. */
export const ATTRIBUTION_BACKGROUND = MAP_LIGHT;
/** The library's own size (`.maplibregl-map` sets 12px/20px), now set here. */
export const ATTRIBUTION_FONT_PX = 12;
export const ATTRIBUTION_LINE_HEIGHT_PX = 20;
export const ATTRIBUTION_PADDING_Y_PX = 2;
/**
 * The lines the fit keeps clear. One line holds an attribution such as "© OpenStreetMap
 * contributors" and the library's own "MapLibre" at 320 CSS px; two leave room for a longer one.
 */
export const ATTRIBUTION_RESERVED_LINES = 2;
/** The height of the strip that the fit keeps clear at the bottom of the map: 44 CSS px. */
export const ATTRIBUTION_STRIP_PX =
  ATTRIBUTION_RESERVED_LINES * ATTRIBUTION_LINE_HEIGHT_PX + 2 * ATTRIBUTION_PADDING_Y_PX;

const SCOPE = /^[a-z][a-z0-9-]*$/;

/**
 * The stylesheet of the attribution inside the element with class `scope`. Throws on a scope that
 * is not a plain class name: it is a constant of the caller, and a wrong one is a programmer error.
 */
export function attributionCss(scope: string): string {
  if (!SCOPE.test(scope)) throw new Error(`attributionCss: not a class name: ${scope}`);
  const strip = `.${scope} .maplibregl-ctrl.maplibregl-ctrl-attrib`;
  return [
    `${strip} {`,
    `  color: ${ATTRIBUTION_TEXT} !important;`,
    `  background-color: ${ATTRIBUTION_BACKGROUND} !important;`,
    '  opacity: 1 !important;',
    `  font-size: ${ATTRIBUTION_FONT_PX}px !important;`,
    `  line-height: ${ATTRIBUTION_LINE_HEIGHT_PX}px !important;`,
    `  padding: ${ATTRIBUTION_PADDING_Y_PX}px 6px !important;`,
    '}',
    `${strip} a {`,
    `  color: ${ATTRIBUTION_TEXT} !important;`,
    '  text-decoration: underline !important;',
    '}',
    '',
  ].join('\n');
}
