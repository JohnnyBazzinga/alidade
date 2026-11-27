// REWRITTEN 2026-11-21 (task 23.2), as a requirement change and not a narrowed test. This file
// targeted 844 CSS px and asserted that 375 × 667 does NOT fit (it fixed the smallest height at 810):
// the first form's arithmetic for a flow layout, which Req 3.10 and skeleton-ui 13.15 replace on a
// phone. The two assertions below that still describe the reviewer's Simulation-mode screen (which
// the amendment leaves in the flow layout) are kept unchanged; the 'does not fit 667' assertion and
// the 810 constant are removed; the device-mode docked screen is checked at the end of
// this file against 390 × 664 and 375 × 667.
//
// (The first form, skeleton-ui task 30.4, 2026-11-20.) On a phone held up at smoke, Freeze must be reachable without scrolling: the banner,
// the bar of the phone in hand, Back, the panel's scene chooser, the image, the readout and the
// control bar together must be no taller than the screen.
//
// jsdom does no layout, so the heights are summed from what the components set: fixed heights
// (the image, the selects, the buttons), paddings, gaps, borders, and for text the lines it wraps
// to times its line height. A text's lines are counted by greedy word wrap at an advance of 0.63
// em a character (monospace, about 0.6 measured, with 5 % margin) plus the letter spacing a
// component sets. The real pixels are the lead's check in a browser.

import {
  applyTheme,
  DIAL_LENS_MAX_PX,
  DIAL_LENS_MIN_PX,
  DIAL_RESERVE_PX,
  instrument,
  mira,
} from '@alidade/ui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountDeviceSight } from '../../test-support/device-sight';
import { mountSimulation } from '../../test-support/simulation-driver';

const ADVANCE_EM = 0.63;

const px = (value: string): number => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/** The lines `text` wraps to in `widthPx` at `fontPx` (greedy, at spaces; a long word breaks). */
/** An icon and its gap (24 + 8, or 24 + 6 inline), counted as words of characters at 0.63 em. */
const ICON_WORD = '\u25AE\u25AE';

/**
 * The aiming row (Req 22.8, task 24.5): the crosshair and the line, then the "How to aim" pill. By
 * the 0.63 em bound they do not share one row at a phone's width, so the summary is two rows: the
 * line (as tall as its icon, 24) and the pill (its padding of 2 and its chevron, 28), 4 apart.
 */
function aimHeight(section: HTMLElement, widthPx: number): number {
  const summary = section.querySelector('summary') as HTMLElement;
  const line = summary.querySelector<HTMLElement>('[data-part="aim-line"]') as HTMLElement;
  const pill = summary.querySelector<HTMLElement>('[data-part="how-to-aim"]') as HTMLElement;
  const font = px(summary.style.fontSize);
  const inner =
    widthPx -
    px(section.style.paddingLeft) -
    px(section.style.paddingRight) -
    px(summary.style.paddingLeft) -
    px(summary.style.paddingRight);
  const lineWidth = 24 + 8 + (line.textContent ?? '').length * 0.63 * font;
  const pillWidth =
    px(pill.style.paddingLeft) +
    px(pill.style.paddingRight) +
    4 +
    24 +
    (pill.textContent ?? '').length * 0.63 * font;
  const lineRow = Math.max(font * Number(summary.style.lineHeight), 24);
  const pillRow =
    Math.max(font * Number(summary.style.lineHeight), 24) +
    px(pill.style.paddingTop) +
    px(pill.style.paddingBottom);
  const rows =
    lineWidth + px(summary.style.columnGap) + pillWidth <= inner
      ? Math.max(lineRow, pillRow)
      : lineRow + px(summary.style.rowGap) + pillRow;
  const summaryHeight = Math.max(
    px(summary.style.minHeight),
    rows + px(summary.style.paddingTop) + px(summary.style.paddingBottom),
  );
  return summaryHeight + px(section.style.paddingTop) + px(section.style.paddingBottom);
}

/** The compact readout's cards (skeleton-ui Req 22.11, D37.10): its top padding and the taller card. */
function readoutHeight(el: HTMLElement, widthPx: number): number {
  const row = el.querySelector<HTMLElement>('[data-part="cards"]');
  if (row === null) throw new Error('the readout has no cards');
  const inner = widthPx - px(el.style.paddingLeft) - px(el.style.paddingRight);
  const cards = [...row.children] as HTMLElement[];
  const cardWidth = (inner - px(row.style.gap) * (cards.length - 1)) / cards.length;
  let tallest = 0;
  for (const card of cards) {
    const text = cardWidth - px(card.style.paddingLeft) - px(card.style.paddingRight);
    const numeral = card.querySelector<HTMLElement>('[data-part="numeral"]');
    let content: number;
    if (numeral !== null) {
      expect(wrapped(numeral.textContent ?? '', text, px(numeral.style.fontSize))).toBe(1);
      const p = numeral.parentElement as HTMLElement;
      content =
        px(numeral.style.fontSize) * Number(numeral.style.lineHeight) + px(p.style.gap) + 25;
    } else {
      const s = card.querySelector<HTMLElement>('[data-part="steadiness"]') as HTMLElement;
      content =
        wrapped(`${ICON_WORD} ${s.textContent ?? ''}`, text, px(s.style.fontSize)) *
        px(s.style.fontSize) *
        Number(s.style.lineHeight);
    }
    tallest = Math.max(tallest, content + px(card.style.paddingTop) + px(card.style.paddingBottom));
  }
  return px(el.style.paddingTop) + tallest;
}

function lines(text: string, widthPx: number, fontPx: number, letterSpacingEm = 0): number {
  const perLine = Math.max(1, Math.floor(widthPx / ((ADVANCE_EM + letterSpacingEm) * fontPx)));
  let count = 1;
  let used = 0;
  for (const word of text.trim().split(/\s+/)) {
    const need = used === 0 ? word.length : used + 1 + word.length;
    if (need <= perLine) {
      used = need;
    } else if (word.length <= perLine) {
      count += 1;
      used = word.length;
    } else {
      count += Math.ceil(word.length / perLine) - (used === 0 ? 1 : 0);
      used = word.length % perLine;
    }
  }
  return count;
}

/** `clamp(Apx, Bsvh, Cpx)` at a viewport `heightPx` tall. */
function clampHeight(value: string, heightPx: number): number {
  const m = /^clamp\((\d+)px, (\d+)svh, (\d+)px\)$/.exec(value);
  if (m === null) throw new Error(`not a clamp of px and svh: ${value}`);
  const [low, share, high] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return Math.min(high, Math.max(low, (share / 100) * heightPx));
}

const vertical = (el: HTMLElement) =>
  px(el.style.paddingTop) +
  px(el.style.paddingBottom) +
  px(el.style.borderTopWidth) +
  px(el.style.borderBottomWidth);

async function liveSightScreen() {
  const m = mountSimulation();
  await m.settle();
  await m.openSight();
  await m.toLive();
  if (m.sightingState() !== 'live') throw new Error(`not live: ${m.sightingState()}`);
  return m;
}

type Mounted = Awaited<ReturnType<typeof liveSightScreen>>;

/** The height from the top of the page to the bottom of the control bar, at `widthPx` × `heightPx`. */
function heightToTheBar(m: Mounted, widthPx: number, heightPx: number) {
  const parts: Record<string, number> = {};

  const banner = m.getByTestId('simulation-banner');
  const bannerFont = px(banner.style.fontSize);
  parts.banner =
    lines(banner.textContent ?? '', widthPx - px(banner.style.paddingLeft) * 2, bannerFont) *
      bannerFont *
      Number(banner.style.lineHeight) +
    vertical(banner);

  const bar = m.getByTestId('phone-in-hand');
  const label = bar.querySelector('label') as HTMLElement;
  const span = label.querySelector('span') as HTMLElement;
  const select = label.querySelector('select') as HTMLSelectElement;
  const labelFont = px(label.style.fontSize);
  const selectFont = px(select.style.fontSize);
  const longest = Math.max(...[...select.options].map((o) => o.text.length));
  // A select is its longest option and about 40 px of arrow and padding.
  const selectWidth = Math.max(px(select.style.minWidth), longest * ADVANCE_EM * selectFont + 40);
  const spanWidth = (span.textContent ?? '').length * ADVANCE_EM * labelFont;
  const inner = widthPx - px(bar.style.paddingLeft) - px(bar.style.paddingRight);
  const oneRow = spanWidth + px(label.style.columnGap) + selectWidth <= inner;
  const selectHeight = px(select.style.minHeight);
  parts.phoneBar =
    (oneRow ? selectHeight : labelFont * Number(label.style.lineHeight) + selectHeight) +
    vertical(bar);

  const main = m.getByTestId('app-main');
  parts.mainPadding = px(main.style.paddingTop);
  const mainInner = widthPx - px(main.style.paddingLeft) - px(main.style.paddingRight);

  const section = m.getByTestId('sight-screen');
  const gap = px(section.style.gap);
  const back = m.getByRole('button', { name: 'Back' });
  parts.back = px(back.style.minHeight) + gap;

  const sceneSelect = m.getByLabelText('Scene') as HTMLSelectElement;
  const sceneLabel = sceneSelect.parentElement as HTMLElement;
  const sceneRow = sceneLabel.parentElement as HTMLElement;
  parts.sceneRow =
    px(sceneLabel.style.fontSize) * Number(sceneLabel.style.lineHeight) +
    px(sceneSelect.style.height) +
    vertical(sceneRow);

  const imageBox = m.getByTestId('image-surface').parentElement as HTMLElement;
  parts.image = clampHeight(imageBox.style.height, heightPx);

  const readout = m.getByTestId('readout');
  const lineHeight = Number(readout.style.lineHeight);
  const readoutFont = px(readout.style.fontSize);
  const spacing = Number.parseFloat(readout.style.letterSpacing) || 0;
  const readoutInner = mainInner - px(readout.style.paddingLeft) - px(readout.style.paddingRight);
  let readoutHeight = vertical(readout);
  for (const p of readout.querySelectorAll<HTMLElement>('p')) {
    const numeral = p.querySelector<HTMLElement>('span');
    const font = Math.max(readoutFont, numeral === null ? 0 : px(numeral.style.fontSize));
    readoutHeight +=
      lines(p.textContent ?? '', readoutInner, readoutFont, spacing) * font * lineHeight;
  }
  parts.readout = readoutHeight;

  const controlBar = m.getByTestId('control-bar');
  const barGap = px(controlBar.style.gap);
  const buttons = [...controlBar.querySelectorAll<HTMLElement>('button')];
  // A primary control fills its row; the others share one row after it.
  const rows = [
    ...buttons.filter((b) => b.dataset.primary === 'true').map((b) => px(b.style.height)),
    ...(buttons.some((b) => b.dataset.primary !== 'true')
      ? [
          Math.max(
            ...buttons.filter((b) => b.dataset.primary !== 'true').map((b) => px(b.style.height)),
          ),
        ]
      : []),
  ];
  parts.controlBar =
    rows.reduce((a, b) => a + b, 0) + barGap * (rows.length - 1) + vertical(controlBar);

  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total };
}

describe('the reviewer’s Sight screen in Simulation mode stays in the flow layout (task 30.4; unchanged by task 23)', () => {
  it('has nothing between the readout and the control bar, and the image and the readout before them', async () => {
    const m = await liveSightScreen();
    const bar = m.getByTestId('control-bar');
    expect(bar.previousElementSibling).toBe(m.getByTestId('readout'));
    expect(m.getByTestId('readout').previousElementSibling).toBe(
      m.getByTestId('image-surface').parentElement,
    );
  });

  it('fits Freeze inside 844 CSS px at 390 wide', async () => {
    const m = await liveSightScreen();
    const { parts, total } = heightToTheBar(m, 390, 844);
    expect(total, JSON.stringify(parts)).toBeLessThanOrEqual(844);
  });
});

// ---- Device mode, docked (Req 3.10, 21.8; skeleton-ui 13.15) -------------------------------------

/** The home indicator's inset with Safari's toolbars hidden, in CSS px. */
const SAFE_AREA_INSET_PX = 34;

/** Greedy wrap at an advance of 0.63 em: an upper bound for the body stack (skeleton-ui Q16). */
function wrapped(text: string, widthPx: number, fontPx: number): number {
  return lines(text, widthPx, fontPx);
}

/** The rows of the docked screen that do not flex, summed from their styles (as UI's budget test). */
function dockedTotal(screen: HTMLElement, widthPx: number, heightPx: number) {
  const parts: Record<string, number> = {};
  const add = (name: string, v: number) => (parts[name] = (parts[name] ?? 0) + v);
  const textHeight = (el: HTMLElement, w: number) => {
    const font = px(el.style.fontSize);
    const line = Number(el.style.lineHeight);
    if (!(line > 0)) throw new Error(`no line height: ${el.outerHTML.slice(0, 90)}`);
    return (
      wrapped(
        el.textContent ?? '',
        w - px(el.style.paddingLeft) - px(el.style.paddingRight),
        font,
      ) *
        font *
        line +
      vertical(el)
    );
  };
  const middle = screen.querySelector('[data-part="middle"]') as HTMLElement;
  // Nothing above the middle part: Back is in the bar, beside the action (task 36).
  expect(screen.firstElementChild).toBe(middle);
  for (const child of middle.children) {
    const el = child as HTMLElement;
    if (el.dataset.testid === 'guidance') add('aim', aimHeight(el, widthPx));
    else if (el.dataset.part === 'image-box') add('image', px(el.style.minHeight));
    else if (el.dataset.testid === 'readout') add('readout', readoutHeight(el, widthPx));
    // Before Start only (Req 22.8): the how-to and tip cards and the idle picture scroll in the
    // middle part; Start is in the docked bar, which the sum below holds.
    else if (
      el.dataset.testid === 'how-to' ||
      el.dataset.testid === 'before-you-sight' ||
      el.dataset.part === 'idle-image'
    )
      add('before Start (scrolls)', 0);
    else if (el.dataset.part === 'hint' || el.dataset.part === 'intro')
      add('hint', textHeight(el, widthPx));
    else if (el.dataset.testid === 'limits-note') add('limits', textHeight(el, widthPx));
    else if (el.dataset.part === 'details' || el.tagName === 'BUTTON') add('below the fold', 0);
    else throw new Error(`a row of the middle part is not counted: ${el.outerHTML.slice(0, 100)}`);
  }
  const bar = screen.lastElementChild as HTMLElement;
  const gap = px(bar.style.gap);
  const pieces: number[] = [];
  const text = bar.querySelector<HTMLElement>('[data-part="bar-text"]');
  if (text !== null) {
    const hint = text.querySelector<HTMLElement>('[data-part="hint"]');
    pieces.push(
      text.textContent === 'Starting the motion sensors.' && hint !== null
        ? textHeight(hint, widthPx)
        : (px(text.style.maxHeight) / 100) * heightPx,
    );
  }
  const tall = (b: HTMLElement) => Math.max(px(b.style.height), px(b.style.minHeight));
  const rows = [...bar.querySelectorAll<HTMLElement>('[data-part="bar-row"]')];
  if (rows.length > 0) {
    // Back's row (one line, no wrap) and any after it, each as tall as its tallest control.
    for (const r of rows) pieces.push(Math.max(...[...r.querySelectorAll('button')].map(tall)));
  } else {
    const buttons = [...bar.querySelectorAll<HTMLElement>('[data-part="bar-controls"] button')];
    for (const b of buttons.filter((b) => b.dataset.primary === 'true')) pieces.push(tall(b));
    const others = buttons.filter((b) => b.dataset.primary !== 'true');
    if (others.length > 0) pieces.push(Math.max(...others.map(tall)));
  }
  add(
    'bar',
    px(bar.style.paddingTop) +
      gap +
      SAFE_AREA_INSET_PX +
      pieces.reduce((a, b) => a + b, 0) +
      gap * Math.max(0, pieces.length - 1),
  );
  return { parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

describe('the Sight screen on a phone is the docked column (Req 3.10, UI 13.15)', () => {
  const sizes = [
    [390, 664],
    [375, 667],
  ] as const;
  // A refusal at the cap of the bar's text part is counted by skeleton-ui's own budget test (its
  // 34.7): on a phone Freeze is not offered while north is needed, so no refusal can be reached here.
  const states = ['permission', 'live', 'live, north needed', 'frozen'] as const;

  for (const [widthPx, heightPx] of sizes) {
    for (const name of states) {
      it(`${name} fits ${widthPx} × ${heightPx}`, async () => {
        const m = mountDeviceSight({
          relative: name.includes('north needed'),
        });
        await m.settle();
        if (name !== 'permission') await m.toLive();
        if (name === 'frozen') await m.press('freeze');
        const screen = m.getByTestId('sighting-screen');
        expect(screen.dataset.layout).toBe('docked');
        const { parts, total } = dockedTotal(screen, widthPx, heightPx);
        expect(total, JSON.stringify(parts)).toBeLessThanOrEqual(heightPx);
      });
    }
  }

  it('is one column: the middle part, then the bar with Back beside Start (task 36)', async () => {
    const m = mountDeviceSight({});
    await m.settle();
    const screen = m.getByTestId('sighting-screen');
    expect(screen.children).toHaveLength(2);
    expect(screen.firstElementChild?.getAttribute('data-part')).toBe('middle');
    const bar = screen.lastElementChild as HTMLElement;
    expect(bar.getAttribute('data-testid')).toBe('control-bar');
    const row = bar.querySelector('[data-part="bar-row"]') as HTMLElement;
    expect([...row.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Back',
      'Start',
    ]);
    expect(screen.style.height).toBe('100dvh');
  });
});

// Mira (Req 22.17, design D26.4): the docked column drawn as the dial. The lens takes the height the
// column leaves, between its bounds, so the sum is of the parts around it, from the numbers the
// skeleton and Vigia write: the aiming row, the lens and its margin, the readout or the hint, the
// north prompt, the tiles, and the bar with the home indicator's inset.
describe('the Sight screen on a phone in Mira fits the screen (Req 3.10, 22.17)', () => {
  beforeEach(() => applyTheme(document.documentElement, mira));
  afterEach(() => {
    applyTheme(document.documentElement, instrument);
    document.documentElement.removeAttribute('style');
  });
  const lens = (widthPx: number, heightPx: number, reservePx: number) =>
    Math.min(widthPx - 40, DIAL_LENS_MAX_PX, Math.max(DIAL_LENS_MIN_PX, heightPx - reservePx));
  const AIM_PX = 16 + 44;
  const READOUT_PX = 12 + 64 + 6 + 12 * 1.4;
  const TILES_PX = 16 + 54;
  const BAR_PX = (rows: readonly number[]) =>
    12 + rows.reduce((a, b) => a + b, 0) + 10 * (rows.length - 1) + 16 + SAFE_AREA_INSET_PX;

  for (const [widthPx, heightPx] of [
    [390, 664],
    [375, 667],
    [390, 844],
  ] as const) {
    it(`live, frozen and north needed fit ${widthPx} × ${heightPx}`, async () => {
      for (const name of ['live', 'live, north needed', 'frozen'] as const) {
        const m = mountDeviceSight({ relative: name.includes('north needed') });
        await m.toLive();
        if (name === 'frozen') await m.press('freeze');
        const screen = m.getByTestId('sighting-screen');
        expect(screen.dataset.variant).toBe('dial');
        const parts: Record<string, number> = { aim: AIM_PX, tiles: TILES_PX };
        if (name === 'frozen') {
          const hint = screen.querySelector<HTMLElement>('[data-part="hint"]') as HTMLElement;
          parts.lens = lens(widthPx, heightPx, DIAL_RESERVE_PX.frozen) + 14;
          parts.hint = 12 + lines(hint.textContent ?? '', widthPx - 40, 22) * 22 * 1.2;
          parts.bar = BAR_PX([62, 54]);
        } else if (name === 'live') {
          parts.lens = lens(widthPx, heightPx, DIAL_RESERVE_PX.live) + 14;
          parts.readout = READOUT_PX;
          parts.bar = BAR_PX([62]);
        } else {
          const prompt = m.getByTestId('yaw-status');
          const headline = prompt.querySelector('[data-part="prompt-headline"]')?.textContent ?? '';
          const rest = prompt.querySelector('[data-part="prompt"]')?.textContent ?? '';
          // Mira's card: padding 12 and 14, the icon of 22 and its gap of 12, 15 and 13.
          const inner = widthPx - 40 - 28 - 34;
          parts.lens = lens(widthPx, heightPx, DIAL_RESERVE_PX.prompt) + 14;
          parts.readout = READOUT_PX;
          parts.prompt =
            12 +
            24 +
            4 +
            lines(headline, inner, 15) * 15 * 1.25 +
            lines(rest, inner, 13) * 13 * 1.45;
          parts.bar = BAR_PX([62]);
        }
        const total = Object.values(parts).reduce((a, b) => a + b, 0);
        expect(total, `${name}: ${JSON.stringify(parts)}`).toBeLessThanOrEqual(heightPx);
        m.unmount();
      }
    });
  }

  it('the lens is as large as the design (350) on a tall phone, and never under its least', () => {
    expect(lens(390, 844, DIAL_RESERVE_PX.live)).toBe(350);
    expect(lens(390, 844, DIAL_RESERVE_PX.frozen)).toBe(350);
    expect(lens(320, 568, DIAL_RESERVE_PX.prompt)).toBe(DIAL_LENS_MIN_PX);
  });
});
