// The one function of `magvar` 2.2.0 that this package uses (design §3). Only `wmm.ts` imports it.
declare module 'magvar' {
  /**
   * The WMM2025 field at a decimal year, geodetic latitude and longitude (degrees) and height
   * above mean sea level (km). `declination` and `inclination` are degrees rounded to 0.01;
   * intensities are nanotesla rounded to 0.1.
   */
  export function calculateMagneticField(
    decimalYear: number,
    latitude: number,
    longitude: number,
    altitude?: number,
  ): {
    readonly declination: number;
    readonly inclination: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly h: number;
    readonly f: number;
    readonly decimalYear: number;
  };
}
