// The Scene image (Req 16.5, 16.6, design D11): the drawing that replaces the camera image in the
// Simulator. It draws the horizon, each visible Target with its label and the Sun as a disc, and
// no text that gives a direction (the Simulator panel shows those, Req 17.7). It takes the pose it
// is given: while frozen the parent passes the projection read at the Freeze.

import type { ImageLayout } from '../math/image-layout';
import type { ProjectedScene } from '../math/scene/project-scene';
import { COLOURS, BODY_FONT_STACK, SIZES } from './theme';
import { useActiveTheme } from './theme/apply-theme';
import { SCENE_COLOURS, type SceneLandscape } from './theme/scene';

export interface SceneImageProps {
  readonly projected: ProjectedScene | null;
  readonly layout: ImageLayout | null;
}

// The image's colours are the same in every theme (theme/scene.ts); the outlines are constant roles.
// Every paint is set in `style`, which resolves `var()`; a presentation attribute does not (Req 22.4).
const SKY = SCENE_COLOURS.sky;
const SUN = SCENE_COLOURS.sun;
const TARGET = SCENE_COLOURS.target;

export function SceneImage({ projected, layout }: SceneImageProps) {
  const landscape = useActiveTheme().scene;
  if (landscape !== null) {
    return <LandscapeScene projected={projected} layout={layout} colours={landscape} />;
  }
  const width = layout?.elementWidthPx ?? 0;
  const height = layout?.elementHeightPx ?? 0;
  return (
    <svg
      data-testid="scene-image"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', background: SKY }}
    >
      {layout !== null && (
        <rect
          data-part="image"
          x={layout.leftPx}
          y={layout.topPx}
          width={layout.displayedWidthPx}
          height={layout.displayedHeightPx}
          style={{ fill: SKY }}
        />
      )}
      {projected?.horizon != null && (
        <line
          data-part="horizon"
          x1={projected.horizon.a.xPx}
          y1={projected.horizon.a.yPx}
          x2={projected.horizon.b.xPx}
          y2={projected.horizon.b.yPx}
          style={{ stroke: COLOURS.mapInk }}
          strokeWidth={2}
        />
      )}
      {projected?.targets.map((t) => {
        if (!t.visible || t.point === null) return null;
        return (
          <g
            key={t.id}
            data-part="target"
            data-target-id={t.id}
            data-kind={t.kind}
            data-x-px={t.point.xPx}
            data-y-px={t.point.yPx}
          >
            {t.kind === 'sun' && t.radiusPx !== null ? (
              <circle
                cx={t.point.xPx}
                cy={t.point.yPx}
                r={Math.max(t.radiusPx, 3)}
                style={{ fill: SUN }}
              />
            ) : (
              <path
                d={`M ${t.point.xPx} ${t.point.yPx - 10} L ${t.point.xPx + 7} ${t.point.yPx + 6} L ${t.point.xPx - 7} ${t.point.yPx + 6} Z`}
                style={{ fill: TARGET, stroke: COLOURS.outline }}
                strokeWidth={1}
              />
            )}
            <text
              x={t.point.xPx + 12}
              y={t.point.yPx + 4}
              fontFamily={BODY_FONT_STACK}
              fontSize={SIZES.labelPx}
              style={{ fill: TARGET, stroke: COLOURS.outline }}
              strokeWidth={0.5}
            >
              {t.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The Scene image as Mira draws it (Req 22.18, D37.14): a light sky over a green ground cut at the
 * horizon, the Sun as a pale disc with its glow, and each Target where the pose puts it: a smoke
 * (a Target whose id begins with `smoke`) as a column of grey puffs over a small flame, any other
 * as a dark triangle; each label in ink over a white halo, to the left, clear of the crosshair's arms (`38` from its
 * centre) and of the plume, which leans to the right. The same projection, the same parts.
 */
function LandscapeScene({
  projected,
  layout,
  colours: c,
}: {
  readonly projected: ProjectedScene | null;
  readonly layout: ImageLayout | null;
  readonly colours: SceneLandscape;
}) {
  const width = layout?.elementWidthPx ?? 0;
  const height = layout?.elementHeightPx ?? 0;
  const h = projected?.horizon ?? null;
  // The ground: below the horizon, from its left end to its right end and down to the image's foot.
  let ground: string | null = null;
  if (h !== null) {
    const [l, r] = h.a.xPx <= h.b.xPx ? [h.a, h.b] : [h.b, h.a];
    ground = `M ${l.xPx} ${l.yPx} L ${r.xPx} ${r.yPx} L ${width} ${r.yPx} L ${width} ${height} L 0 ${height} L 0 ${l.yPx} Z`;
  }
  const label = { fontFamily: BODY_FONT_STACK, fontSize: 13, fontWeight: 600 } as const;
  return (
    <svg
      data-testid="scene-image"
      data-variant="landscape"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', background: c.skyBottom }}
    >
      <defs>
        <linearGradient id="alidade-scene-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: c.skyTop }} />
          <stop offset="1" style={{ stopColor: c.skyBottom }} />
        </linearGradient>
        <linearGradient id="alidade-scene-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: c.groundTop }} />
          <stop offset="1" style={{ stopColor: c.groundBottom }} />
        </linearGradient>
      </defs>
      <rect
        data-part="image"
        x={0}
        y={0}
        width={width}
        height={height}
        style={{ fill: 'url(#alidade-scene-sky)' }}
      />
      {ground !== null && (
        <path data-part="ground" d={ground} style={{ fill: 'url(#alidade-scene-ground)' }} />
      )}
      {h !== null && (
        <line
          data-part="horizon"
          x1={h.a.xPx}
          y1={h.a.yPx}
          x2={h.b.xPx}
          y2={h.b.yPx}
          style={{ stroke: c.horizon, strokeOpacity: 0.7, strokeWidth: 1.5 }}
        />
      )}
      {projected?.targets.map((t) => {
        if (!t.visible || t.point === null) return null;
        const { xPx: x, yPx: y } = t.point;
        const smoke = t.kind === 'landmark' && t.id.startsWith('smoke');
        return (
          <g
            key={t.id}
            data-part="target"
            data-target-id={t.id}
            data-kind={t.kind}
            data-x-px={x}
            data-y-px={y}
          >
            {t.kind === 'sun' && t.radiusPx !== null ? (
              <>
                <circle
                  cx={x}
                  cy={y}
                  r={Math.max(t.radiusPx, 3) * 2.2}
                  style={{ fill: c.sunGlow, fillOpacity: 0.45 }}
                />
                <circle cx={x} cy={y} r={Math.max(t.radiusPx, 3)} style={{ fill: c.sun }} />
              </>
            ) : smoke ? (
              <g data-part="plume">
                <circle cx={x + 2} cy={y - 14} r={7} style={{ fill: c.puffs[0] }} />
                <circle cx={x + 8} cy={y - 30} r={10} style={{ fill: c.puffs[1] }} />
                <circle cx={x + 18} cy={y - 50} r={13} style={{ fill: c.puffs[2] }} />
                <circle
                  cx={x + 30}
                  cy={y - 72}
                  r={15}
                  style={{ fill: c.puffs[2], fillOpacity: 0.8 }}
                />
                <path d={`M ${x - 5} ${y} q 2 -9 5 -12 q 3 4 5 12 z`} style={{ fill: c.flame }} />
              </g>
            ) : (
              <path
                d={`M ${x} ${y - 10} L ${x + 7} ${y + 6} L ${x - 7} ${y + 6} Z`}
                style={{ fill: c.mark }}
              />
            )}
            <text
              x={x - 44}
              y={y + 5}
              textAnchor="end"
              style={{
                ...label,
                fill: c.mark,
                stroke: c.halo,
                strokeWidth: 3,
                paintOrder: 'stroke',
              }}
            >
              {t.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
