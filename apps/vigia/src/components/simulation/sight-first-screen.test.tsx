// The reviewer's Sight screen, live, fits a phone's first screen (skeleton-ui task 30.4,
// 2026-11-20). On a phone held up at smoke, Freeze must be reachable without scrolling: the banner,
// the bar of the phone in hand, Back, the panel's scene chooser, the image, the readout and the
// control bar together must be no taller than the screen.
//
// jsdom does no layout, so the heights are summed from what the components set: fixed heights
// (the image, the selects, the buttons), paddings, gaps, borders, and for text the lines it wraps
// to times its line height. A text's lines are counted by greedy word wrap at an advance of 0.63
// em a character (monospace, about 0.6 measured, with 5 % margin) plus the letter spacing a
// component sets. The real pixels are the lead's check in a browser.

import { describe, expect, it } from 'vitest';
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

describe('the reviewer’s Sight screen, live, on a phone’s first screen (task 30.4)', () => {
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

  it('does not fit 667 CSS px at 375 wide; the smallest height that fits is stated', async () => {
    const m = await liveSightScreen();
    const small = heightToTheBar(m, 375, 667);
    expect(small.total, JSON.stringify(small.parts)).toBeGreaterThan(667);
    // Above the image the parts take the same at any height; the image is 28 % of it, at least
    // 200 px. The smallest height that holds everything to the bottom of the bar:
    let smallest = 0;
    for (let h = 600; h <= 1200; h += 1) {
      if (heightToTheBar(m, 375, h).total <= h) {
        smallest = h;
        break;
      }
    }
    expect(smallest).toBe(SMALLEST_HEIGHT_AT_375_PX);
    // Without the image's floor of 200 px, 667 px would leave this much for it:
    const withoutImage = small.total - small.parts.image;
    expect(667 - withoutImage).toBeLessThan(200);
  });
});

/**
 * The smallest viewport height, at 375 CSS px wide, that holds the live Sight screen of the
 * reviewer down to the bottom of the control bar (measured by the arithmetic above).
 */
const SMALLEST_HEIGHT_AT_375_PX = 810;
