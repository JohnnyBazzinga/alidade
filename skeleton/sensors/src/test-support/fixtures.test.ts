import { describe, expect, it } from 'vitest';
import { sha256Hex, wmmFixtureText, wmmTestPoints } from './fixtures';

// The fixture is the official data, unmodified (Req 13.4; fixtures/wmm2025/SOURCE.md).
describe('WMM2025 fixture', () => {
  it('holds the files NOAA published, byte for byte', async () => {
    expect(await sha256Hex(wmmFixtureText('WMM2025_TEST_VALUES.txt'))).toBe(
      'ae289c94e2200e4deeae2dfdedf543a8a0e93096512b30d6a754199731f570d0',
    );
    expect(await sha256Hex(wmmFixtureText('WMM2025_TestValues.txt'))).toBe(
      'e6975b093dddeb6153e0b23cc418425c438167e7c5b1dd795da379cb654f5819',
    );
  });

  it('parses 12 and 100 points with the published first rows', () => {
    const small = wmmTestPoints('WMM2025_TEST_VALUES.txt');
    const large = wmmTestPoints('WMM2025_TestValues.txt');
    expect(small).toHaveLength(12);
    expect(large).toHaveLength(100);
    // "2025.0 0.0 80.0 0.0 6521.6 145.9 54791.5 6523.2 ... 1.28"
    expect(small[0]).toEqual({
      file: 'WMM2025_TEST_VALUES.txt',
      decimalYear: 2025,
      heightKm: 0,
      latitudeDeg: 80,
      longitudeDeg: 0,
      declinationDeg: 1.28,
      horizontalIntensityNt: 6523.2,
    });
    // "2025.000000 28 89 -121 -99.77 88.47 1504.298146 ..."
    expect(large[0]).toEqual({
      file: 'WMM2025_TestValues.txt',
      decimalYear: 2025,
      heightKm: 28,
      latitudeDeg: 89,
      longitudeDeg: -121,
      declinationDeg: -99.77,
      horizontalIntensityNt: 1504.298146,
    });
  });
});
