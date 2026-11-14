import './style.css';
import {
  absoluteAlphaDegFromCompass,
  cameraAxisFromRotation,
  candidateBAzimuthRad,
  degToRad,
  radToDeg,
  wrapPi,
} from './orientation';
import type { CameraAxis } from './orientation';
import { sunHorizontalDeg } from './sun';
import type { HorizontalCoordsDeg } from './sun';
import { isCompassEvent } from './types';
import type { DeviceOrientationEventStatic } from './types';

interface Sample {
  timeUtcMs: number;
  azADeg: number;
  azBDeg: number;
  altDeg: number;
  sunAzDeg: number;
  sunAltDeg: number;
  azErrADeg: number;
  azErrBDeg: number;
  altErrDeg: number;
  alphaDeg: number;
  rawAlphaDeg: number | null;
  betaDeg: number;
  gammaDeg: number;
  compassHeadingDeg: number | null;
  compassAccuracyDeg: number | null;
  absoluteFlag: boolean;
  screenOrientationDeg: number | null;
  source: string;
  latDeg: number | null;
  lonDeg: number | null;
  gpsAccuracyM: number | null;
}

interface LiveRead {
  alphaDeg: number;
  rawAlphaDeg: number | null;
  betaDeg: number;
  gammaDeg: number;
  compassHeadingDeg: number | null;
  compassAccuracyDeg: number | null;
  absoluteFlag: boolean;
  screenOrientationDeg: number | null;
  source: string;
  axisA: CameraAxis | null;
  azimuthBRad: number | null;
  sun: HorizontalCoordsDeg | null;
  latDeg: number | null;
  lonDeg: number | null;
  gpsAccuracyM: number | null;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
};

const videoEl = $<HTMLVideoElement>('video');
const startBtn = $<HTMLButtonElement>('startBtn');
const zoomBtn = $<HTMLButtonElement>('zoomBtn');
const captureBtn = $<HTMLButtonElement>('captureBtn');
const toggleBtn = $<HTMLButtonElement>('toggleBtn');
const copyBtn = $<HTMLButtonElement>('copyBtn');
const clearBtn = $<HTMLButtonElement>('clearBtn');
const samplesEl = $<HTMLElement>('samples');
const summaryEl = $<HTMLElement>('summary');
const tableEl = $<HTMLTableElement>('samplesTable');
const toastEl = $<HTMLElement>('toast');

// Fixed readout elements; updated via textContent only (no innerHTML rebuilds).
const hud = {
  gpsBig: $<HTMLElement>('gpsBig'),
  gpsAccBig: $<HTMLSpanElement>('v_gpsAccBig'),
  azA: $<HTMLSpanElement>('v_azA'),
  azB: $<HTMLSpanElement>('v_azB'),
  alt: $<HTMLSpanElement>('v_alt'),
  sunAz: $<HTMLSpanElement>('v_sunAz'),
  sunAlt: $<HTMLSpanElement>('v_sunAlt'),
  errA: $<HTMLSpanElement>('v_errA'),
  errB: $<HTMLSpanElement>('v_errB'),
  errAlt: $<HTMLSpanElement>('v_errAlt'),
  alpha: $<HTMLSpanElement>('v_alpha'),
  source: $<HTMLSpanElement>('v_source'),
  abs: $<HTMLSpanElement>('v_abs'),
  beta: $<HTMLSpanElement>('v_beta'),
  gamma: $<HTMLSpanElement>('v_gamma'),
  rawAlpha: $<HTMLSpanElement>('v_rawAlpha'),
  comp: $<HTMLSpanElement>('v_comp'),
  compAcc: $<HTMLSpanElement>('v_compAcc'),
  lat: $<HTMLSpanElement>('v_lat'),
  lon: $<HTMLSpanElement>('v_lon'),
  gpsAcc: $<HTMLSpanElement>('v_gpsAcc'),
  scr: $<HTMLSpanElement>('v_scr'),
  n: $<HTMLSpanElement>('v_n'),
  videoRes: $<HTMLSpanElement>('v_videoRes'),
  videoFps: $<HTMLSpanElement>('v_videoFps'),
  orientRate: $<HTMLSpanElement>('v_orientRate'),
};

const samples: Sample[] = [];
let haveAbsoluteEvent = false;
let zoom = 1;

// Readout rendering is throttled to ~10 Hz via requestAnimationFrame; live.* is
// updated on every event, so Capture always reads the freshest values.
let rafPending = false;
let renderDirty = false;
let lastRenderMs = 0;

// deviceorientation event-rate measurement (processed events per second).
let orientCount = 0;
let orientRatePerSec = 0;
let orientRateLastMs = 0;

// Actual camera track settings, read once the stream is live.
const videoInfo = { width: 0, height: 0, fps: 0 };

const live: LiveRead = {
  alphaDeg: 0,
  rawAlphaDeg: null,
  betaDeg: 0,
  gammaDeg: 0,
  compassHeadingDeg: null,
  compassAccuracyDeg: null,
  absoluteFlag: false,
  screenOrientationDeg: null,
  source: '—',
  axisA: null,
  azimuthBRad: null,
  sun: null,
  latDeg: null,
  lonDeg: null,
  gpsAccuracyM: null,
};

function fmt(n: number | null | undefined, d = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toFixed(d);
}

function fmtSigned(n: number, d = 2): string {
  if (!Number.isFinite(n)) return '—';
  const s = n.toFixed(d);
  return n > 0 ? `+${s}` : s;
}

function fmtCoord(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return n.toFixed(5);
}

function errClass(x: number): string {
  if (!Number.isFinite(x)) return '';
  const a = Math.abs(x);
  return a <= 2 ? 'err-ok' : a <= 8 ? 'err-warn' : 'err-bad';
}

function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  window.setTimeout(() => toastEl.classList.remove('show'), 1400);
}

// Set a value span's text and its magnitude colour class.
function setErr(el: HTMLSpanElement, deg: number): void {
  el.textContent = fmtSigned(deg);
  el.className = errClass(deg);
}

// Coalesce writes: mark dirty and request one rAF; renderFrame renders at most
// once per 100 ms, rescheduling if it wakes too soon so the final value always
// paints even after events stop.
function scheduleRender(): void {
  renderDirty = true;
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(renderFrame);
}

function renderFrame(now: number): void {
  rafPending = false;

  // deviceorientation event rate, recomputed ~once per second.
  if (orientRateLastMs === 0) {
    orientRateLastMs = now;
    orientCount = 0;
  } else if (now - orientRateLastMs >= 1000) {
    orientRatePerSec = orientCount / ((now - orientRateLastMs) / 1000);
    orientCount = 0;
    orientRateLastMs = now;
  }

  if (!renderDirty) return;
  if (now - lastRenderMs < 100) {
    rafPending = true;
    requestAnimationFrame(renderFrame);
    return;
  }
  renderDirty = false;
  lastRenderMs = now;
  renderHud();
}

function screenOrientationDeg(): number | null {
  const so = (window.screen as unknown as { orientation?: { angle?: number } }).orientation;
  return so && typeof so.angle === 'number' ? so.angle : null;
}

// ---- orientation ----

function handleOrient(e: DeviceOrientationEvent, isAbsoluteEvent: boolean): void {
  if (e.alpha === null || e.beta === null || e.gamma === null) return;

  const beta = e.beta;
  const gamma = e.gamma;
  let alpha: number;
  let source: string;
  let compassHeading: number | null = null;
  let compassAcc: number | null = null;

  if (isCompassEvent(e)) {
    compassHeading = e.webkitCompassHeading;
    compassAcc = e.webkitCompassAccuracy ?? null;
    alpha = absoluteAlphaDegFromCompass(e.webkitCompassHeading);
    source = 'ios-compass';
  } else if (isAbsoluteEvent || e.absolute === true) {
    if (isAbsoluteEvent) haveAbsoluteEvent = true;
    alpha = e.alpha;
    source = 'absolute';
  } else if (haveAbsoluteEvent) {
    return;
  } else {
    alpha = e.alpha;
    source = 'relative';
  }

  orientCount++;
  live.alphaDeg = alpha;
  live.rawAlphaDeg = e.alpha;
  live.betaDeg = beta;
  live.gammaDeg = gamma;
  live.compassHeadingDeg = compassHeading;
  live.compassAccuracyDeg = compassAcc;
  live.absoluteFlag = e.absolute ?? false;
  live.screenOrientationDeg = screenOrientationDeg();
  live.source = source;

  live.axisA = cameraAxisFromRotation(degToRad(alpha), degToRad(beta), degToRad(gamma));
  if (compassHeading !== null) {
    live.azimuthBRad = candidateBAzimuthRad(
      degToRad(e.alpha),
      degToRad(beta),
      degToRad(gamma),
      compassHeading,
    );
  } else {
    live.azimuthBRad = live.axisA.azimuthRad;
  }
  scheduleRender();
}

// ---- Sun, recomputed once per second (it moves <0.01° between ticks) ----

let sunTimer: number | undefined;

function startSunTimer(): void {
  if (sunTimer !== undefined) return;
  sunTimer = window.setInterval(() => {
    if (live.latDeg !== null && live.lonDeg !== null) {
      live.sun = sunHorizontalDeg(new Date(), live.latDeg, live.lonDeg);
    } else {
      live.sun = null;
    }
    scheduleRender();
  }, 1000);
}

// ---- HUD ----

function renderHud(): void {
  const a = live.axisA;
  const s = live.sun;
  let azAErrDeg = NaN;
  let azBErrDeg = NaN;
  let altErrDeg = NaN;
  if (a !== null && s !== null && live.azimuthBRad !== null) {
    azAErrDeg = radToDeg(wrapPi(a.azimuthRad - degToRad(s.azimuthDeg)));
    azBErrDeg = radToDeg(wrapPi(live.azimuthBRad - degToRad(s.azimuthDeg)));
    altErrDeg = radToDeg(a.altitudeRad - degToRad(s.altitudeDeg));
  }

  const azA = a ? radToDeg(a.azimuthRad) : NaN;
  const azB = live.azimuthBRad !== null ? radToDeg(live.azimuthBRad) : NaN;
  const alt = a ? radToDeg(a.altitudeRad) : NaN;

  hud.azA.textContent = fmt(azA);
  hud.azB.textContent = fmt(azB);
  hud.alt.textContent = fmt(alt);
  hud.sunAz.textContent = fmt(s ? s.azimuthDeg : NaN);
  hud.sunAlt.textContent = fmt(s ? s.altitudeDeg : NaN);
  setErr(hud.errA, azAErrDeg);
  setErr(hud.errB, azBErrDeg);
  setErr(hud.errAlt, altErrDeg);
  hud.alpha.textContent = fmt(live.alphaDeg);
  hud.source.textContent = live.source;
  hud.abs.textContent = live.absoluteFlag ? 'Y' : 'N';
  hud.beta.textContent = fmt(live.betaDeg);
  hud.gamma.textContent = fmt(live.gammaDeg);
  hud.rawAlpha.textContent = fmt(live.rawAlphaDeg);
  hud.comp.textContent = fmt(live.compassHeadingDeg);
  hud.compAcc.textContent = fmt(live.compassAccuracyDeg);
  hud.lat.textContent = fmtCoord(live.latDeg);
  hud.lon.textContent = fmtCoord(live.lonDeg);
  hud.gpsAcc.textContent = fmt(live.gpsAccuracyM, 0);
  hud.scr.textContent = fmt(live.screenOrientationDeg, 0);
  hud.n.textContent = String(samples.length);
  hud.videoRes.textContent = videoInfo.width ? `${videoInfo.width}×${videoInfo.height}` : '—';
  hud.videoFps.textContent = videoInfo.fps ? videoInfo.fps.toFixed(0) : '—';
  hud.orientRate.textContent = orientRatePerSec ? orientRatePerSec.toFixed(0) : '—';

  // Big GPS accuracy line: green once below 20 m.
  hud.gpsAccBig.textContent = fmt(live.gpsAccuracyM, 0);
  const goodGps = live.gpsAccuracyM !== null && live.gpsAccuracyM < 20;
  hud.gpsBig.className = goodGps ? 'gpsbig good' : 'gpsbig';
}

// ---- samples ----

function mean(xs: number[]): number {
  return xs.reduce((p, c) => p + c, 0) / xs.length;
}

function sampleStd(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((p, c) => p + (c - m) * (c - m), 0) / (xs.length - 1));
}

function capture(): void {
  if (live.axisA === null || live.azimuthBRad === null) {
    toast('No orientation reading');
    return;
  }
  const a = live.axisA;
  const azB = live.azimuthBRad;
  const s =
    live.latDeg !== null && live.lonDeg !== null
      ? sunHorizontalDeg(new Date(), live.latDeg, live.lonDeg)
      : null;
  const sample: Sample = {
    timeUtcMs: Date.now(),
    azADeg: radToDeg(a.azimuthRad),
    azBDeg: radToDeg(azB),
    altDeg: radToDeg(a.altitudeRad),
    sunAzDeg: s ? s.azimuthDeg : NaN,
    sunAltDeg: s ? s.altitudeDeg : NaN,
    azErrADeg: s ? radToDeg(wrapPi(a.azimuthRad - degToRad(s.azimuthDeg))) : NaN,
    azErrBDeg: s ? radToDeg(wrapPi(azB - degToRad(s.azimuthDeg))) : NaN,
    altErrDeg: s ? radToDeg(a.altitudeRad - degToRad(s.altitudeDeg)) : NaN,
    alphaDeg: live.alphaDeg,
    rawAlphaDeg: live.rawAlphaDeg,
    betaDeg: live.betaDeg,
    gammaDeg: live.gammaDeg,
    compassHeadingDeg: live.compassHeadingDeg,
    compassAccuracyDeg: live.compassAccuracyDeg,
    absoluteFlag: live.absoluteFlag,
    screenOrientationDeg: live.screenOrientationDeg,
    source: live.source,
    latDeg: live.latDeg,
    lonDeg: live.lonDeg,
    gpsAccuracyM: live.gpsAccuracyM,
  };
  samples.push(sample);
  renderSamples();
  toast(`Captured #${samples.length}`);
}

function renderSamples(): void {
  const n = samples.length;
  const aE = samples.map((s) => s.azErrADeg).filter(Number.isFinite);
  const bE = samples.map((s) => s.azErrBDeg).filter(Number.isFinite);
  const lE = samples.map((s) => s.altErrDeg).filter(Number.isFinite);
  const mA = aE.length ? mean(aE) : NaN;
  const sA = sampleStd(aE);
  const mB = bE.length ? mean(bE) : NaN;
  const sB = sampleStd(bE);
  const mL = lE.length ? mean(lE) : NaN;
  const sL = sampleStd(lE);
  summaryEl.textContent =
    `n=${n} | ΔazA ${fmtSigned(mA)}° σ ${fmt(sA, 2)}° | ΔazB ${fmtSigned(mB)}° σ ${fmt(sB, 2)}° | Δalt ${fmtSigned(mL)}° σ ${fmt(sL, 2)}°`;

  const head = [
    '#', 'time', 'ΔazA°', 'ΔazB°', 'Δalt°', 'azA°', 'azB°', 'alt°', 'sunAz°', 'sunAlt°',
    'α°', 'rawα°', 'β°', 'γ°', 'comp°', 'acc°', 'abs', 'scr°', 'src', 'lat', 'lon', 'gps±m',
  ];
  const thead = `<thead><tr>${head
    .map((h, i) => `<th class="${i === 0 ? 'idx' : ''}">${h}</th>`)
    .join('')}</tr></thead>`;

  const body = samples
    .map((s, i) => {
      const cells = [
        `<td class="idx">${i + 1}</td>`,
        `<td>${new Date(s.timeUtcMs).toLocaleTimeString()}</td>`,
        `<td>${fmtSigned(s.azErrADeg)}</td>`,
        `<td>${fmtSigned(s.azErrBDeg)}</td>`,
        `<td>${fmtSigned(s.altErrDeg)}</td>`,
        `<td>${fmt(s.azADeg)}</td>`,
        `<td>${fmt(s.azBDeg)}</td>`,
        `<td>${fmt(s.altDeg)}</td>`,
        `<td>${fmt(s.sunAzDeg)}</td>`,
        `<td>${fmt(s.sunAltDeg)}</td>`,
        `<td>${fmt(s.alphaDeg)}</td>`,
        `<td>${fmt(s.rawAlphaDeg)}</td>`,
        `<td>${fmt(s.betaDeg)}</td>`,
        `<td>${fmt(s.gammaDeg)}</td>`,
        `<td>${fmt(s.compassHeadingDeg)}</td>`,
        `<td>${fmt(s.compassAccuracyDeg)}</td>`,
        `<td>${s.absoluteFlag ? 'Y' : 'N'}</td>`,
        `<td>${fmt(s.screenOrientationDeg, 0)}</td>`,
        `<td class="src">${s.source}</td>`,
        `<td>${fmtCoord(s.latDeg)}</td>`,
        `<td>${fmtCoord(s.lonDeg)}</td>`,
        `<td>${fmt(s.gpsAccuracyM, 0)}</td>`,
      ].join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  tableEl.innerHTML = `${thead}<tbody>${body}</tbody>`;
}

// ---- CSV ----

function toCsv(): string {
  const cols = [
    'timeUtcMs', 'isoTime', 'azADeg', 'azBDeg', 'altDeg', 'sunAzDeg', 'sunAltDeg',
    'azErrADeg', 'azErrBDeg', 'altErrDeg', 'alphaDeg', 'rawAlphaDeg', 'betaDeg', 'gammaDeg',
    'compassHeadingDeg', 'compassAccuracyDeg', 'absoluteFlag', 'screenOrientationDeg',
    'source', 'latDeg', 'lonDeg', 'gpsAccuracyM',
  ];
  const f = (x: number): string => (Number.isFinite(x) ? String(x) : '');
  const nn = (x: number | null): string => (x === null || !Number.isFinite(x) ? '' : String(x));
  const bb = (x: boolean): string => (x ? 'true' : 'false');
  const lines = [cols.join(',')];
  for (const s of samples) {
    lines.push(
      [
        s.timeUtcMs,
        new Date(s.timeUtcMs).toISOString(),
        f(s.azADeg), f(s.azBDeg), f(s.altDeg), f(s.sunAzDeg), f(s.sunAltDeg),
        f(s.azErrADeg), f(s.azErrBDeg), f(s.altErrDeg),
        f(s.alphaDeg), nn(s.rawAlphaDeg), f(s.betaDeg), f(s.gammaDeg),
        nn(s.compassHeadingDeg), nn(s.compassAccuracyDeg),
        bb(s.absoluteFlag), nn(s.screenOrientationDeg),
        s.source,
        nn(s.latDeg), nn(s.lonDeg), nn(s.gpsAccuracyM),
      ].join(','),
    );
  }
  return lines.join('\n');
}

async function copyCsv(): Promise<void> {
  if (samples.length === 0) {
    toast('No samples');
    return;
  }
  const csv = toCsv();
  try {
    await navigator.clipboard.writeText(csv);
    toast(`Copied ${samples.length} rows`);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = csv;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(`Copied ${samples.length} rows`);
    } catch {
      toast('Copy failed');
    } finally {
      ta.remove();
    }
  }
}

// ---- geolocation & camera ----

function startGeo(): void {
  if (!('geolocation' in navigator)) return;
  navigator.geolocation.watchPosition(
    (pos) => {
      live.latDeg = pos.coords.latitude;
      live.lonDeg = pos.coords.longitude;
      live.gpsAccuracyM = pos.coords.accuracy;
      scheduleRender();
    },
    (err) => {
      live.gpsAccuracyM = null;
      toast(`geo: ${err.message}`);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
  );
}

async function startCamera(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {
      /* autoplay can reject; the playsinline video keeps the stream */
    });
    const track = stream.getVideoTracks()[0];
    if (track) {
      const st = track.getSettings();
      videoInfo.width = st.width ?? 0;
      videoInfo.height = st.height ?? 0;
      videoInfo.fps = st.frameRate ?? 0;
    }
    scheduleRender();
  } catch (e) {
    toast(`camera: ${e instanceof Error ? e.message : 'unavailable'}`);
  }
}

// ---- zoom ----

function cycleZoom(): void {
  zoom = zoom === 1 ? 2 : zoom === 2 ? 4 : 1;
  videoEl.style.transform = `scale(${zoom})`;
  zoomBtn.textContent = `Zoom ${zoom}×`;
}

// ---- start ----

async function start(): Promise<void> {
  startBtn.disabled = true;

  const DOE = window.DeviceOrientationEvent as unknown as DeviceOrientationEventStatic;
  if (DOE !== undefined && typeof DOE.requestPermission === 'function') {
    try {
      const res = await DOE.requestPermission();
      if (res !== 'granted') toast('orientation denied');
    } catch {
      toast('orientation denied');
    }
  }

  window.addEventListener('deviceorientation', (e) => handleOrient(e as DeviceOrientationEvent, false));
  window.addEventListener(
    'deviceorientationabsolute',
    (e) => handleOrient(e as DeviceOrientationEvent, true),
  );

  startGeo();
  await startCamera();

  zoomBtn.disabled = false;
  captureBtn.disabled = false;
  toggleBtn.disabled = false;
  copyBtn.disabled = false;
  clearBtn.disabled = false;
  startSunTimer();
  scheduleRender();
}

// ---- wire up ----

startBtn.addEventListener('click', () => {
  void start();
});
zoomBtn.addEventListener('click', cycleZoom);
captureBtn.addEventListener('click', capture);
copyBtn.addEventListener('click', () => {
  void copyCsv();
});
clearBtn.addEventListener('click', () => {
  samples.length = 0;
  renderSamples();
  scheduleRender();
  toast('Cleared');
});
toggleBtn.addEventListener('click', () => {
  samplesEl.classList.toggle('open');
});

renderSamples();
