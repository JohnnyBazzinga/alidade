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

import { describe, expect, it } from 'vitest';
import { mountDeviceSight } from '../../test-support/device-sight';
import { mountSimulation } from '../../test-support/simulation-driver';

const ADVANCE_EM = 0.63;

const px = (value: string): number => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/** The lines `text` wraps to in `widthPx` at `fontPx` (greedy, at spaces; a long word breaks). */
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
  const top = screen.firstElementChild as HTMLElement;
  const back = top.querySelector('button') as HTMLElement;
  add('top (Back)', px(back.style.minHeight) + vertical(top));
  const middle = screen.querySelector('[data-part="middle"]') as HTMLElement;
  for (const child of middle.children) {
    const el = child as HTMLElement;
    if (el.dataset.testid === 'guidance') {
      const summary = el.querySelector('summary') as HTMLElement;
      add('aim', Math.max(px(summary.style.minHeight), 0) + vertical(el));
    } else if (el.dataset.part === 'image-box') add('image', px(el.style.minHeight));
    else if (el.dataset.testid === 'readout') {
      let h = vertical(el);
      for (const p of el.querySelectorAll<HTMLElement>(':scope > p')) {
        const numeral = p.querySelector<HTMLElement>('span');
        const font = Math.max(
          px(el.style.fontSize),
          numeral === null ? 0 : px(numeral.style.fontSize),
        );
        h +=
          wrapped(p.textContent ?? '', widthPx - 16, px(el.style.fontSize)) *
          font *
          Number(el.style.lineHeight);
      }
      add('readout', h);
    } else if (el.dataset.part === 'hint' || el.dataset.part === 'intro')
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
  const buttons = [...bar.querySelectorAll<HTMLElement>('[data-part="bar-controls"] button')];
  for (const b of buttons.filter((b) => b.dataset.primary === 'true'))
    pieces.push(px(b.style.height));
  const others = buttons.filter((b) => b.dataset.primary !== 'true');
  if (others.length > 0) pieces.push(Math.max(...others.map((b) => px(b.style.height))));
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

  it('is one column: Back, the middle part, the bar last', async () => {
    const m = mountDeviceSight({});
    await m.settle();
    const screen = m.getByTestId('sighting-screen');
    expect((screen.firstElementChild as HTMLElement).querySelector('button')?.textContent).toBe(
      'Back',
    );
    expect(screen.children[1]?.getAttribute('data-part')).toBe('middle');
    expect(screen.lastElementChild?.getAttribute('data-testid')).toBe('control-bar');
    expect(screen.style.height).toBe('100dvh');
  });
});
