// P-10.10 and P-15.9 (design §11; Req 10.3, 10.10, 15.1, 15.4, 15.9): the store over the fakes of
// every Adapter. A code read from the page's address is held in the Inbox and goes nowhere else;
// over any sequence of the screens' acts, no code, observer position or azimuth reaches the
// Network gate, a URL, the console or the title, and a code reaches the Transport or the Clipboard
// only by a Share or a Copy of the sequence, and only the code of the Sighting shared.

import type { Position } from '@alidade/core';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupCode, stripCode } from '../math/code/alphabet';
import { buildSightingLink } from '../math/code/code-link';
import { decodeSighting, encodeSighting } from '../math/code/sighting-code';
import { toDeg } from '../math/degrees';
import { emergencyText } from '../math/fix/emergency-text';
import { incidentMode } from '../math/incident/ids';
import { OVERLAYS } from '../overlays';
import { contextOf } from '../overlays/shared/components/OverlayPanel';
import { windRequestUrl } from '../math/network/request-boxes';
import { cappedRuns } from '../test-support/fast-check-setup';
import { createFakeEnvironment } from '../test-support/fake-environment';
import { pageAddress, sightingArb } from '../test-support/generators';
import { bearingOf, PARAMETERS } from '../test-support/incident-fixtures';
import { checkProperty, checkPropertyAsync, ErrorTracker } from '../test-support/property-report';
import {
  CODE_POOL_SIZE,
  damage,
  poolCode,
  storeSteps,
  type StoreStep,
} from '../test-support/store-steps';
import { createVigiaStore, type VigiaStore } from './store';

/** A run of the code: this many consecutive symbols of it. */
const RUN_SYMBOLS = 8;

/** Every run of `RUN_SYMBOLS` symbols of the code. */
function runsOf(code: string): string[] {
  const runs: string[] = [];
  for (let i = 0; i + RUN_SYMBOLS <= code.length; i += 1) runs.push(code.slice(i, i + RUN_SYMBOLS));
  return runs;
}

/** True when `text`, with its hyphens and whitespace taken out, holds a run of the code. */
function holdsRun(text: string, code: string): boolean {
  const bare = stripCode(text);
  return runsOf(code).some((run) => bare.includes(run) || text.includes(run));
}

/** True when `text`, with its hyphens and whitespace taken out, holds the whole code. */
function holdsCode(text: string, code: string): boolean {
  return stripCode(text).includes(code) || text.includes(code);
}

/** The forms in which a Sighting's observer position or azimuth could be written. */
function numberForms(code: string): string[] {
  const decoded = decodeSighting(code, PARAMETERS);
  if (!decoded.ok) return [];
  const b = decoded.value.bearing;
  const forms: string[] = [];
  for (const valueRad of [b.observer.latRad, b.observer.lonRad, b.azimuthRad]) {
    forms.push(String(valueRad));
    const valueDeg = toDeg(valueRad);
    if (valueDeg.ok) forms.push(Math.abs(valueDeg.value).toFixed(3), String(valueDeg.value));
  }
  return forms;
}

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

function spyOnConsole(): { readonly calls: string[]; restore(): void } {
  const calls: string[] = [];
  const spies = CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      calls.push(args.map((a) => String(a)).join(' '));
    }),
  );
  return {
    calls,
    restore: () => {
      for (const spy of spies) spy.mockRestore();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// P-10.10 (Req 10.3, 10.10). Generators: `pageAddress` (https hosts of 1 to 5 labels, 0 to 4 path
// segments, an optional query and fragment; or http://localhost with an optional port) and
// `sightingArb` (a Core-valid Sighting inside the code's ranges, one in four of a simulated smoke).
// A link longer than 160 characters cannot be made: that case is discarded (it is
// `link_too_long`, an example of code-link.test.ts) and the discards are reported.
describe('P-10.10: a link opened is read into the Inbox and goes nowhere (Req 10.3, 10.10)', () => {
  it('leaves the address without the fragment, calls no gate, and holds the code only in the Inbox', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-10.10',
      fc.property(pageAddress(), sightingArb(), (address, sighting) => {
        const parameters = PARAMETERS;
        const code = encodeSighting(sighting);
        if (!code.ok) throw new Error(`encode failed: ${code.reason}`);
        const link = buildSightingLink(address, code.value, parameters);
        fc.pre(link.ok);
        if (!link.ok) return;
        const fake = createFakeEnvironment({ href: link.value });
        const console = spyOnConsole();
        try {
          const store = createVigiaStore(fake.environment);
          store.start();
          const base = link.value.slice(0, link.value.indexOf('#'));
          const urls = fake.page.history.calls.map((c) => c.url ?? '');
          expect(urls.at(-1)).toBe(base);
          expect(fake.page.location.href).toBe(base);
          expect(fake.gate.calls).toEqual([]);
          expect(fake.sent).toEqual([]);
          expect(fake.navigator.written).toEqual([]);
          expect(fake.navigator.shared).toEqual([]);
          const adapterArguments = [
            ...urls,
            ...fake.storage.calls,
            ...[...fake.storage.items.values()],
            ...console.calls,
          ];
          for (const argument of adapterArguments)
            expect(holdsRun(argument, code.value)).toBe(false);
          const inbox = store.getSnapshot().inbox;
          expect(inbox.map((i) => i.code)).toEqual([code.value]);
          const decoded = decodeSighting(code.value, parameters);
          expect(decoded.ok && inbox[0]?.sighting).toEqual(decoded.ok ? decoded.value : null);
          store.stop();
        } finally {
          console.restore();
        }
      }),
      tracker,
      { numRuns: cappedRuns(2000) },
    );
  });
});

/** What the run is allowed to have put in each record, step by step. */
interface Allowed {
  /** One entry for each clipboard write: the code shared, or `null` for the Emergency text. */
  readonly written: (string | null)[];
  readonly shared: string[];
  readonly sent: string[];
  /** The URL of each request the user's acts on the Overlay switches may have made, in order. */
  readonly requests: string[];
}

const ADDRESS = 'https://app.example.test/';

/**
 * The place a wind request is for: the Fix, or with none the middle of the observers (the sum of
 * their unit vectors, written here again so that the test does not rest on the code it checks).
 */
function windAnchor(context: { fix: Position | null; observers: readonly Position[] }): Position {
  if (context.fix !== null) return context.fix;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of context.observers) {
    x += Math.cos(p.latRad) * Math.cos(p.lonRad);
    y += Math.cos(p.latRad) * Math.sin(p.lonRad);
    z += Math.sin(p.latRad);
  }
  return { latRad: Math.atan2(z, Math.hypot(x, y)), lonRad: Math.atan2(y, x) };
}

async function run(steps: readonly StoreStep[]) {
  const fake = createFakeEnvironment({ href: ADDRESS });
  const { environment } = fake;
  const titleBefore = document.title;
  let store: VigiaStore = createVigiaStore(environment);
  store.start();
  const known = new Set<string>();
  for (let n = 0; n < CODE_POOL_SIZE; n += 1) known.add(poolCode(n));
  const allowed: Allowed = { written: [], shared: [], sent: [], requests: [] };
  // The Overlays of the registry (none in the cut project), told of the open smoke after every step
  // as the Map screen tells them: only a switch or a Refresh may ask for data.
  const overlayDeps = {
    gate: environment.gate,
    clock: environment.clock,
    parameters: environment.parameters,
    mode: environment.mode,
  };
  const overlays = OVERLAYS.map((definition) => definition.create(overlayDeps));
  const overlayContext = () => contextOf(store.getSnapshot().open, overlayDeps);
  const entries = () => store.getSnapshot().state.incidents.flatMap((i) => i.entries);

  for (const step of steps) {
    switch (step.kind) {
      case 'capture': {
        const bearing = bearingOf(200 + step.bearing, {
          id: `bearing-${step.bearing}`,
          timeUtcMs: environment.clock() - 1000,
        });
        store.capture(bearing, step.answer);
        break;
      }
      case 'paste':
      case 'link':
      case 'deliver': {
        const code = step.damaged ? damage(poolCode(step.code)) : poolCode(step.code);
        if (step.kind === 'paste') store.paste(code);
        else if (step.kind === 'deliver') fake.transport.receive(code);
        else {
          fake.page.location.setRaw(`${ADDRESS}#${code}`, `#${code}`);
          fake.page.events.dispatch();
        }
        break;
      }
      case 'add':
      case 'ignore': {
        const inbox = store.getSnapshot().inbox;
        const item = inbox[step.pick % Math.max(1, inbox.length)];
        if (item === undefined) break;
        if (step.kind === 'add') store.addFromInbox(item.code, step.join);
        else store.ignore(item.code);
        break;
      }
      case 'joinSame': {
        const inbox = store.getSnapshot().inbox;
        const item = inbox[step.pick % Math.max(1, inbox.length)];
        if (item !== undefined) store.joinFromInbox(item.code);
        break;
      }
      case 'hide':
      case 'show':
      case 'delete': {
        const all = entries();
        const entry = all[step.pick % Math.max(1, all.length)];
        if (entry === undefined) break;
        const sightingId = entry.sighting.sightingId;
        store.dispatch(
          step.kind === 'delete'
            ? { kind: 'deleteSighting', sightingId }
            : { kind: step.kind, sightingId },
        );
        break;
      }
      case 'share': {
        const all = entries();
        const entry = all[step.pick % Math.max(1, all.length)];
        if (entry === undefined) break;
        const { code } = entry;
        const id = entry.sighting.sightingId;
        // The Share sheet offers no link, QR or share sheet for a simulated smoke.
        const outward = incidentMode(entry.sighting.incidentId) === 'device';
        const link = buildSightingLink(environment.page.address(), code, environment.parameters);
        if (step.how === 'text') {
          allowed.written.push(code);
          const r = await environment.clipboard.copyText(groupCode(code));
          if (r.ok) store.markShared(id, 'text');
        } else if (step.how === 'transport') {
          allowed.sent.push(code);
          await environment.transport.send(code);
        } else if (outward && link.ok) {
          if (step.how === 'link') {
            allowed.written.push(code);
            const r = await environment.clipboard.copyText(link.value);
            if (r.ok) store.markShared(id, 'link');
          } else if (step.how === 'system_share') {
            allowed.shared.push(code);
            const r = await environment.clipboard.shareLink(link.value);
            if (r.ok) store.markShared(id, 'system_share');
          } else {
            const matrix = environment.qr.qrMatrix(link.value);
            if (matrix.ok) store.markShared(id, 'qr');
          }
        }
        break;
      }
      case 'copyEmergency': {
        const snapshot = store.getSnapshot();
        const assessment = snapshot.open?.assessment;
        if (assessment === undefined || !assessment.ok) break;
        const text = emergencyText(
          {
            assessment: assessment.value,
            nowUtcMs: environment.clock(),
            mode: environment.mode,
            ownPosition: snapshot.ownPosition,
            includeOwnPosition: step.includeOwnPosition,
          },
          environment.parameters,
        );
        if (!text.ok) break;
        allowed.written.push(null);
        await environment.clipboard.copyText(text.value);
        break;
      }
      case 'wind': {
        const context = overlayContext();
        for (const overlay of overlays) {
          overlay.update(context);
          const wasOn = overlay.getState().enabled;
          if (step.how === 'off') overlay.setEnabled(false);
          else if (step.how === 'on') overlay.setEnabled(true);
          else overlay.refresh();
          // A request is expected for a switch that turns the Overlay on and for a Refresh while
          // it is on, when there is a smoke to ask about.
          const asks = step.how === 'on' ? !wasOn : step.how === 'refresh' && wasOn;
          if (asks && context.observers.length > 0) {
            const url = windRequestUrl(windAnchor(context), environment.parameters);
            if (url.ok) allowed.requests.push(url.value);
          }
        }
        break;
      }
      case 'deleteAll':
        store.dispatch({ kind: 'deleteAll' });
        break;
      case 'expire':
        fake.timer.advance(step.jumpMs);
        break;
      case 'reload':
        store.stop();
        store = createVigiaStore(environment);
        store.start();
        break;
    }
    for (const entry of entries()) known.add(entry.code);
    for (const item of store.getSnapshot().inbox) known.add(item.code);
    // Whatever the step was, the Overlays are told the new smoke: and that asks for nothing.
    for (const overlay of overlays) overlay.update(overlayContext());
  }
  store.stop();
  return { fake, allowed, known, titleBefore };
}

// P-15.9 (Req 15.1, 15.4, 15.9). Generator: `storeSteps` (test-support/store-steps.ts states its
// domain: 0 to 200 steps of captures, pastes, links, Transport deliveries, Inbox answers, hide,
// show, delete, Shares by each presentation, Copies of the Emergency text, deleteAll, the clock
// moving and reloads). The fakes: a recording Network gate, the manual Transport with every send
// recorded, the fake Clipboard, the fake Storage, the fake page with its history, and spies on the
// console. The wind Overlay's switch joins the steps in task 17.5.
describe('P-15.9: what leaves through which channel (Req 15.1, 15.4, 15.9)', () => {
  it('no code, position or azimuth in the gate, a URL, the console or the title; codes only by a Share or a Copy', async () => {
    const tracker = new ErrorTracker();
    let sequencesThatAsked = 0;
    await checkPropertyAsync(
      'P-15.9',
      fc.asyncProperty(storeSteps(), async (steps) => {
        const console = spyOnConsole();
        try {
          const { fake, allowed, known, titleBefore } = await run(steps);
          const codes = [...known];
          const forms = codes.flatMap(numberForms);
          const urls = fake.page.history.calls.map((c) => c.url ?? '');
          for (const text of [...fake.gate.calls, ...urls, ...console.calls, document.title]) {
            for (const code of codes) expect(holdsRun(text, code)).toBe(false);
          }
          // The one position that may be in a request is the rounded point of the wind request: each
          // gate call is exactly the Host list's URL for it (below), so the observers' own numbers
          // are looked for everywhere else.
          for (const text of [...urls, ...console.calls, document.title]) {
            for (const form of forms) expect(text.includes(form)).toBe(false);
          }
          expect(document.title).toBe(titleBefore);
          // The gate was asked for the wind exactly by the sequence's switches and Refreshes, each
          // with the one rounded point and nothing else (Req 13.2, 13.7, 15.9).
          expect(fake.gate.calls).toEqual(allowed.requests);
          if (allowed.requests.length > 0) sequencesThatAsked += 1;
          // The Transport carried exactly the codes of the sequence's Shares through it.
          expect(fake.sent).toEqual(allowed.sent);
          // The Clipboard: each record of a Share holds the code of its Sighting and no other
          // whole code (two codes of one Bearing taken twice share long runs, so the oracle
          // compares whole codes: the counterexample of seed 1160607519 below); the Emergency
          // text holds no run of any code.
          expect(fake.navigator.written).toHaveLength(allowed.written.length);
          fake.navigator.written.forEach((text, i) => {
            const own = allowed.written[i] ?? null;
            if (own === null) {
              for (const code of codes) expect(holdsRun(text, code)).toBe(false);
              return;
            }
            expect(holdsCode(text, own)).toBe(true);
            for (const code of codes) if (code !== own) expect(holdsCode(text, code)).toBe(false);
          });
          expect(fake.navigator.shared).toHaveLength(allowed.shared.length);
          fake.navigator.shared.forEach((text, i) => {
            const own = allowed.shared[i] ?? '';
            expect(holdsCode(text, own)).toBe(true);
            for (const code of codes) if (code !== own) expect(holdsCode(text, code)).toBe(false);
          });
        } finally {
          console.restore();
        }
      }),
      tracker,
      { numRuns: cappedRuns(1000) },
    );
    // The generator reaches the Overlay's requests (it would be vacuous otherwise); in the cut
    // project there is no Overlay and none is asked.
    if (OVERLAYS.length > 0) expect(sequencesThatAsked).toBeGreaterThan(0);
    else expect(sequencesThatAsked).toBe(0);
  });
});

describe('P-15.9 examples', () => {
  // The counterexample of the first run (seed 1160607519, path 2:4:8:8:10:8:7:6:5:5): the same
  // Bearing captured twice gives two codes that differ in the Sighting id only. The link of the
  // first holds the first code whole, and the second one only in part.
  it('the same Bearing captured twice, the first shared by link: only its own whole code', async () => {
    const { fake, allowed, known } = await run([
      { kind: 'capture', bearing: 0, answer: 'new' },
      { kind: 'capture', bearing: 0, answer: 'same' },
      { kind: 'share', pick: 0, how: 'link' },
    ]);
    const own = allowed.written[0] ?? '';
    const record = fake.navigator.written[0] ?? '';
    expect(record).toBe(`${ADDRESS}#${own}`);
    const others = [...known].filter((c) => c !== own);
    expect(others.some((c) => holdsRun(record, c))).toBe(true);
    expect(others.some((c) => holdsCode(record, c))).toBe(false);
  });

  it('a Share by text puts that code, and only that code, on the clipboard', async () => {
    const { fake, allowed } = await run([
      { kind: 'capture', bearing: 1, answer: 'new' },
      { kind: 'capture', bearing: 2, answer: 'same' },
      { kind: 'share', pick: 0, how: 'text' },
    ]);
    expect(allowed.written).toHaveLength(1);
    expect(fake.navigator.written).toHaveLength(1);
    expect(fake.navigator.written[0]).toBe(groupCode(allowed.written[0] ?? ''));
  });
});
