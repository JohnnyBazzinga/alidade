// The budget of Req 13.15 (design D35.4): at 390 × 664 and 375 × 667 CSS px the rows of the docked
// screen that do not flex, plus the image's floor, fit the viewport, in every state that shows the
// image and with a refusal at the cap of the bar's text part. jsdom does no layout, so the heights
// are summed from the styles the components set (paddings, gaps, minimum heights, line heights) and,
// for text, the lines it wraps to at 0.63 em a character, as Vigia's `sight-first-screen.test.tsx`
// does. "Details" and "Other ways to set north" are allowed below the fold and are not counted;
// any other row of the middle part must be classified here, so that a row added to the screen
// without being counted fails this test. The real pixels are Device check 11.

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SimulatorScript } from '@alidade/sensors';
import { DOCKED_BAR_TEXT_MAX_SHARE, DOCKED_IMAGE_MIN_HEIGHT_PX } from '../defaults';
import type { Session } from '../math/session/session';
import { fakeObserver } from '../test-support/fake-observe';
import {
  PARAMETERS,
  fixtureScript,
  liveSession,
  run,
  sessionInState,
} from '../test-support/session-fixtures';
import { wrappedLines } from '../test-support/wrapped-lines';
import { SightingScreen } from './SightingScreen';

/** The home indicator's inset on an iPhone with Safari's toolbars hidden, in CSS px. */
const SAFE_AREA_INSET_PX = 34;

const px = (v: string): number => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

function relativeScript(): SimulatorScript {
  return fixtureScript({
    frame: { kind: 'relative', zeroRad: 2, resets: [] },
    heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
  });
}

/** A row the caller gives, sized as Vigia sizes it: a 48 px control and an 8 px gap. */
const ROW = { minHeight: 48, margin: '0 0 8px' } as const;

function total(session: Session, widthPx: number, heightPx: number) {
  const { container } = render(
    <SightingScreen
      session={session}
      parameters={PARAMETERS}
      onRequestPermission={vi.fn()}
      onAction={vi.fn()}
      sourceSize={{ widthSourcePx: 720, heightSourcePx: 1280 }}
      fit="cover"
      calibration={null}
      tapSigmaPx={Number.NaN}
      observe={fakeObserver({ widthPx, heightPx }).observe}
      renderImage={() => <div />}
      layout="docked"
      top={<div data-row="top" style={ROW} />}
      aim={<div data-row="aim" style={ROW} />}
    />,
  );
  const screen = container.querySelector('[data-testid="sighting-screen"]') as HTMLElement;
  const parts: Record<string, number> = {};
  const add = (name: string, value: number) => (parts[name] = (parts[name] ?? 0) + value);

  const textHeight = (el: HTMLElement, innerWidthPx: number): number => {
    const font = px(el.style.fontSize);
    const line = Number(el.style.lineHeight);
    if (!(line > 0)) throw new Error(`no line height set on ${el.outerHTML.slice(0, 80)}`);
    const padding = px(el.style.paddingLeft) + px(el.style.paddingRight);
    return (
      wrappedLines(el.textContent ?? '', innerWidthPx - padding, font) * font * line +
      px(el.style.paddingTop) +
      px(el.style.paddingBottom)
    );
  };

  const middle = screen.querySelector('[data-part="middle"]') as HTMLElement;
  for (const child of middle.children) {
    const el = child as HTMLElement;
    if (el.dataset.row === 'aim') add('aim', px(el.style.minHeight) + px(el.style.marginBottom));
    else if (el.dataset.part === 'image-box') add('image', px(el.style.minHeight));
    else if (el.dataset.testid === 'readout') {
      let h = px(el.style.paddingTop) + px(el.style.paddingBottom);
      for (const p of el.querySelectorAll<HTMLElement>(':scope > p')) {
        const numeral = p.querySelector<HTMLElement>('span');
        const font = Math.max(
          px(el.style.fontSize),
          numeral === null ? 0 : px(numeral.style.fontSize),
        );
        h +=
          wrappedLines(
            p.textContent ?? '',
            widthPx - px(el.style.paddingLeft) - px(el.style.paddingRight),
            px(el.style.fontSize),
          ) *
          font *
          Number(el.style.lineHeight);
      }
      add('readout', h);
    } else if (el.dataset.part === 'hint' || el.dataset.part === 'intro') {
      add('hint', textHeight(el, widthPx));
    } else if (el.dataset.testid === 'limits-note') add('limits', textHeight(el, widthPx));
    else if (el.dataset.part === 'details') add('details (below the fold)', 0);
    else if (el.tagName === 'BUTTON') add('other ways (below the fold)', 0);
    else throw new Error(`a row of the middle part is not counted: ${el.outerHTML.slice(0, 100)}`);
  }
  const top = screen.firstElementChild as HTMLElement;
  if (top.dataset.row === 'top') add('top', px(top.style.minHeight) + px(top.style.marginBottom));

  const bar = screen.lastElementChild as HTMLElement;
  const gap = px(bar.style.gap);
  let barHeight = px(bar.style.paddingTop) + SAFE_AREA_INSET_PX + gap; // the padding: gap + inset
  const textPart = bar.querySelector<HTMLElement>('[data-part="bar-text"]');
  const controlsPart = bar.querySelector<HTMLElement>('[data-part="bar-controls"]');
  const rows: HTMLElement[][] = [];
  if (controlsPart !== null) {
    const buttons = [...controlsPart.querySelectorAll<HTMLElement>('button')];
    for (const b of buttons.filter((b) => b.dataset.primary === 'true')) rows.push([b]);
    const others = buttons.filter((b) => b.dataset.primary !== 'true');
    if (others.length > 0) rows.push(others);
  }
  const pieces: number[] = [];
  if (textPart !== null) {
    const cap = (px(textPart.style.maxHeight) / 100) * heightPx;
    // A refusal can be as long as its cap: the worst case, but never more than the cap.
    const starting = textPart.querySelector<HTMLElement>('[data-part="hint"]');
    pieces.push(
      textPart.textContent === 'Starting the motion sensors.' && starting !== null
        ? textHeight(starting, widthPx)
        : cap,
    );
  }
  for (const row of rows) pieces.push(Math.max(...row.map((b) => px(b.style.height))));
  barHeight += pieces.reduce((a, b) => a + b, 0) + gap * Math.max(0, pieces.length - 1);
  add('bar', barHeight);
  const sum = Object.values(parts).reduce((a, b) => a + b, 0);
  return { sum, parts };
}

function sessions() {
  const relative = liveSession('bearing', relativeScript());
  const absolute = liveSession('bearing');
  const refusedAbsolute = run(absolute.session, [
    { kind: 'freeze', timeUtcMs: absolute.endUtcMs },
    { kind: 'unfreeze', timeUtcMs: absolute.endUtcMs },
    { kind: 'capture', timeUtcMs: absolute.endUtcMs },
  ]).session;
  const frozenRelative = run(relative.session, [
    { kind: 'freeze', timeUtcMs: relative.endUtcMs },
    { kind: 'capture', timeUtcMs: relative.endUtcMs },
  ]).session;
  const frozenAbsolute = run(absolute.session, [
    { kind: 'freeze', timeUtcMs: absolute.endUtcMs },
    { kind: 'unfreeze', timeUtcMs: absolute.endUtcMs },
    { kind: 'freeze', timeUtcMs: absolute.endUtcMs },
    { kind: 'again', timeUtcMs: absolute.endUtcMs },
  ]).session;
  return [
    ['permission', sessionInState('permission', 'bearing').session],
    ['starting', sessionInState('starting', 'bearing').session],
    ['live, north set (Absolute frame)', absolute.session],
    ['live, north needed (Relative frame)', relative.session],
    ['live with a refusal at the cap', refusedAbsolute],
    ['frozen with the north prompt and a refusal at the cap', frozenRelative],
    ['frozen with a refusal at the cap', frozenAbsolute],
    ['frozen', sessionInState('frozen', 'bearing').session],
  ] as const;
}

describe('the docked budget (Req 13.15, D35.4)', () => {
  for (const [widthPx, heightPx] of [
    [390, 664],
    [375, 667],
  ] as const) {
    for (const [name, session] of sessions()) {
      it(`${name} fits ${widthPx} × ${heightPx}`, () => {
        const { sum, parts } = total(session, widthPx, heightPx);
        expect(sum, JSON.stringify(parts)).toBeLessThanOrEqual(heightPx);
      });
    }
  }

  it('counts the image at its floor and the bar’s text at the cap, so a taller refusal is not a taller bar', () => {
    const { parts } = total(sessionInState('frozen', 'bearing').session, 390, 664);
    expect(parts.image).toBe(DOCKED_IMAGE_MIN_HEIGHT_PX);
    expect(DOCKED_BAR_TEXT_MAX_SHARE * 664).toBeCloseTo(132.8, 5);
  });
});
