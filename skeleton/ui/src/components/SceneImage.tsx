// The Scene image (Req 16.5, 16.6, design D11): the drawing that replaces the camera image in the
// Simulator. It draws the horizon, each visible Target with its label and the Sun as a disc, and
// no text that gives a direction (the Simulator panel shows those, Req 17.7). It takes the pose it
// is given: while frozen the parent passes the projection read at the Freeze.

import type { ImageLayout } from '../math/image-layout';
import type { ProjectedScene } from '../math/scene/project-scene';
import { COLOURS, BODY_FONT_STACK, SIZES } from './theme';

export interface SceneImageProps {
  readonly projected: ProjectedScene | null;
  readonly layout: ImageLayout | null;
}

const SKY = '#26394A';
const SUN = '#F6E7A8';
const TARGET = COLOURS.ink;

export function SceneImage({ projected, layout }: SceneImageProps) {
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
          fill={SKY}
        />
      )}
      {projected?.horizon != null && (
        <line
          data-part="horizon"
          x1={projected.horizon.a.xPx}
          y1={projected.horizon.a.yPx}
          x2={projected.horizon.b.xPx}
          y2={projected.horizon.b.yPx}
          stroke={COLOURS.mapInk}
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
              <circle cx={t.point.xPx} cy={t.point.yPx} r={Math.max(t.radiusPx, 3)} fill={SUN} />
            ) : (
              <path
                d={`M ${t.point.xPx} ${t.point.yPx - 10} L ${t.point.xPx + 7} ${t.point.yPx + 6} L ${t.point.xPx - 7} ${t.point.yPx + 6} Z`}
                fill={TARGET}
                stroke={COLOURS.outline}
                strokeWidth={1}
              />
            )}
            <text
              x={t.point.xPx + 12}
              y={t.point.yPx + 4}
              fill={TARGET}
              fontFamily={BODY_FONT_STACK}
              fontSize={SIZES.labelPx}
              stroke={COLOURS.outline}
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
