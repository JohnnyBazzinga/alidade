// The mode the page starts in (Req 17.1; the lead's decision of 2026-11-21). A desktop browser
// defines `DeviceOrientationEvent` and has no sensor, so the feature test alone would start a
// reviewer in device mode. Opened with `?mode=simulator` the page starts in Simulation mode;
// without `DeviceOrientationEvent` it always does.

import { describe, expect, it } from 'vitest';
import { initialMode, simulatorRequested } from './start-mode';

describe('simulatorRequested', () => {
  it('is true for ?mode=simulator, with other parameters, and before a fragment', () => {
    for (const address of [
      'https://app.example.test/?mode=simulator',
      'https://app.example.test/index.html?mode=simulator',
      'https://app.example.test/sub/?a=1&mode=simulator&b=2',
      'https://app.example.test/?mode=simulator#K7PQ3MWXA2',
      'http://localhost:5173/?mode=simulator',
    ])
      expect(simulatorRequested(address), address).toBe(true);
  });

  it('is false for anything else', () => {
    for (const address of [
      'https://app.example.test/',
      'https://app.example.test/?mode=device',
      'https://app.example.test/?mode=Simulator',
      'https://app.example.test/?mode=simulator2',
      'https://app.example.test/?mode=',
      'https://app.example.test/?xmode=simulator',
      'https://app.example.test/#?mode=simulator',
      'https://app.example.test/?mode=a&mode=simulator',
      '',
    ])
      expect(simulatorRequested(address), address).toBe(false);
  });
});

describe('initialMode', () => {
  it('is device mode when the browser has DeviceOrientationEvent and nothing asks otherwise', () => {
    expect(initialMode({ hasDeviceOrientation: true, address: 'https://app.example.test/' })).toBe(
      'device',
    );
  });

  it('is Simulation mode when the browser has no DeviceOrientationEvent', () => {
    expect(initialMode({ hasDeviceOrientation: false, address: 'https://app.example.test/' })).toBe(
      'simulation',
    );
  });

  it('is Simulation mode with ?mode=simulator, whatever the browser has', () => {
    for (const hasDeviceOrientation of [true, false])
      expect(
        initialMode({ hasDeviceOrientation, address: 'https://app.example.test/?mode=simulator' }),
      ).toBe('simulation');
  });
});
