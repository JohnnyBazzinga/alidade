// The reviewer's Sight screen, live, fits a phone's first screen (task group 13, B; Vigia's
// `sight-first-screen.test.tsx`). After Start, Freeze must be reachable without scrolling: the
// banner, the bar, the title, the image, the readout and the control bar, with the primary-action
// row under the scrolling part, together no taller than the screen. jsdom does no layout, so the
// heights are summed from what the components set; the real pixels are the lead's check.

import { describe, expect, it } from 'vitest';
import { mountSimulation } from '../../test-support/simulation-driver';
import { wrappedLines } from '../../test-support/wrapped-lines';

const px = (value: string): number => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};
const vertical = (el: HTMLElement): number =>
  px(el.style.paddingTop) +
  px(el.style.paddingBottom) +
  px(el.style.borderTopWidth) +
  px(el.style.borderBottomWidth);

function clampHeight(value: string, heightPx: number): number {
  const m = /^clamp\((\d+)px, (\d+)svh, (\d+)px\)$/.exec(value);
  if (m === null) throw new Error(`not a clamp of px and svh: ${value}`);
  const [low, share, high] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return Math.min(high, Math.max(low, (share / 100) * heightPx));
}

async function liveSightScreen() {
  const m = mountSimulation();
  await m.settle();
  await m.click('Sight the Sun');
  await m.press('start');
  await m.ticks(20);
  const state = m.q.getByTestId('sighting-screen').dataset.state;
  if (state !== 'live') throw new Error(`not live: ${state}`);
  return m;
}
type Mounted = Awaited<ReturnType<typeof liveSightScreen>>;

/** The height from the top of the page to the bottom of the control bar, plus the primary row below the scroll. */
function heights(m: Mounted, widthPx: number, heightPx: number) {
  const parts: Record<string, number> = {};
  const banner = m.getByTestId('simulation-banner');
  const font = px(banner.style.fontSize);
  parts.banner =
    wrappedLines(banner.textContent ?? '', widthPx - px(banner.style.paddingLeft) * 2, font) *
      font *
      Number(banner.style.lineHeight) +
    vertical(banner);
  const bar = m.getByTestId('phone-bar');
  const row = bar.querySelector<HTMLElement>('[data-part="bar-row"]') as HTMLElement;
  parts.bar =
    Math.max(
      ...[...row.querySelectorAll<HTMLElement>('select, button')].map((c) => px(c.style.minHeight)),
    ) + vertical(bar);

  const main = m.getByTestId('app-main');
  parts.mainPadding = px(main.style.paddingTop);
  const mainInner = widthPx - px(main.style.paddingLeft) - px(main.style.paddingRight);

  const section = m.getByTestId('sight-screen');
  const gap = px(section.style.gap);
  const title = section.querySelector('h1') as HTMLElement;
  parts.title = px(title.style.fontSize) * Number(title.style.lineHeight) + gap;

  // Everything the screen puts before the image, in the simulation: nothing but the title.
  const imageBox = m.getByTestId('image-surface').parentElement as HTMLElement;
  const before = [...section.children].indexOf(
    imageBox.closest('[data-testid="simulator-panel"]')?.parentElement ?? imageBox,
  );
  parts.beforeImage = before <= 1 ? 0 : -1;
  parts.image = clampHeight(imageBox.style.height, heightPx);

  const readout = m.getByTestId('readout');
  const lineHeight = Number(readout.style.lineHeight);
  const readoutFont = px(readout.style.fontSize);
  const spacing = Number.parseFloat(readout.style.letterSpacing) || 0;
  const readoutInner = mainInner - px(readout.style.paddingLeft) - px(readout.style.paddingRight);
  let readoutHeight = vertical(readout);
  for (const p of readout.querySelectorAll<HTMLElement>('p')) {
    const numeral = p.querySelector<HTMLElement>('span');
    const f = Math.max(readoutFont, numeral === null ? 0 : px(numeral.style.fontSize));
    readoutHeight +=
      wrappedLines(p.textContent ?? '', readoutInner, readoutFont + spacing) * f * lineHeight;
  }
  parts.readout = readoutHeight;

  const controlBar = m.getByTestId('control-bar');
  const barGap = px(controlBar.style.gap);
  const buttons = [...controlBar.querySelectorAll<HTMLElement>('button')];
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

  // The row under the scrolling part holds Done: it takes its height from the screen.
  const primary = m.getByTestId('primary-action');
  const primaryButton = primary.querySelector('button') as HTMLElement;
  parts.primaryRow = px(primaryButton.style.minHeight) + vertical(primary);

  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total };
}

describe('the reviewer’s Sight screen, live, on a phone’s first screen (task group 13, B)', () => {
  it('has nothing between the readout and the control bar, and the image and the readout before them', async () => {
    const m = await liveSightScreen();
    expect(m.getByTestId('control-bar').previousElementSibling).toBe(m.getByTestId('readout'));
    expect(m.getByTestId('readout').previousElementSibling).toBe(
      m.getByTestId('image-surface').parentElement,
    );
  });

  it('shows the app’s one chooser: the panel has no scene chooser of its own', async () => {
    const m = await liveSightScreen();
    expect(
      m.q.queryByLabelText('Scene', { selector: '[data-testid="simulator-panel"] *' }),
    ).toBeNull();
    expect(m.q.getAllByLabelText('Scene')).toHaveLength(1);
    expect(m.q.queryByText(/A good day, sight 1/)).toBeNull();
  });

  it('puts the image before the guidance and the Calibration line, which come after the control bar', async () => {
    const m = await liveSightScreen();
    const bar = m.getByTestId('control-bar');
    const guidance = m.getByTestId('guidance');
    expect(bar.compareDocumentPosition(guidance) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(
      bar.compareDocumentPosition(m.getByTestId('calibration-line')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it('fits Freeze inside 844 CSS px at 390 wide, with the primary row counted', async () => {
    const m = await liveSightScreen();
    const { parts, total } = heights(m, 390, 844);
    expect(parts.beforeImage).toBe(0);
    expect(total, JSON.stringify(parts)).toBeLessThanOrEqual(844);
  });
});
