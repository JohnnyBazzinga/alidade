# WMM2025 official test values

Read-only reference data for the World Magnetic Model tests of `@alidade/sensors`
(requirements 6.10 and 13.4; design §3 and §9). Both files are copied byte for byte from NOAA
NCEI and must not be edited. If a test disagrees with them, the code or the test is wrong.

Both are works of the US Government and in the public domain.

Retrieved on 2026-11-16.

| File                      | Source                                                                                                                                                                                                 | SHA-256                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `WMM2025_TEST_VALUES.txt` | <https://www.ncei.noaa.gov/sites/default/files/2025-02/WMM2025_TEST_VALUES.txt>                                                                                                                        | `ae289c94e2200e4deeae2dfdedf543a8a0e93096512b30d6a754199731f570d0` |
| `WMM2025_TestValues.txt`  | `WMM2025COF/WMM2025_TestValues.txt` inside <https://www.ncei.noaa.gov/sites/default/files/2024-12/WMM2025COF.zip> (archive SHA-256 `2e76569370d081f2cd7919490218bd094ca9afde347b198eff5621e0af460d03`) | `e6975b093dddeb6153e0b23cc418425c438167e7c5b1dd795da379cb654f5819` |

Columns, as stated in each file's header:

- `WMM2025_TEST_VALUES.txt` (12 points): date, height above the WGS84 ellipsoid (km), geodetic
  latitude and longitude (deg), X, Y, Z, H, F (nT), inclination, declination, grid variation
  (deg), then their rates of change.
- `WMM2025_TestValues.txt` (100 points): decimal year, altitude (km), geodetic latitude and
  longitude (deg), declination, inclination (deg), H, X, Y, Z, F (nT), then rates of change.
