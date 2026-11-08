/**
 * AgroEdge Vision - Precision Irrigation Engine (FAO-56 Standard)
 * Copyright 2026 nff747. Licensed under Apache-2.0.
 *
 * Implements FAO Irrigation and Drainage Paper No. 56:
 * Reference Crop Evapotranspiration (ET_0) via Penman-Monteith equation:
 *
 *          0.408 * Δ * (R_n - G) + γ * (900 / (T + 273)) * u_2 * (e_s - e_a)
 * ET_0 =  ------------------------------------------------------------------
 *                             Δ + γ * (1 + 0.34 * u_2)
 */

export interface WeatherData {
  temperatureC: number;        // Mean daily air temperature [°C]
  relativeHumidityPercent: number; // Mean daily relative humidity [%]
  windSpeedMps: number;         // Wind speed measured at 2m height [m/s]
  netRadiationMjM2Day?: number; // Net radiation Rn at crop surface [MJ/m²/day]
  solarRadiationMjM2Day?: number;// Incoming solar radiation Rs [MJ/m²/day] (if Rn not provided directly)
  soilHeatFluxMjM2Day?: number; // Soil heat flux density [MJ/m²/day] (defaults to 0 for daily)
  atmosphericPressureKpa?: number; // Atmospheric pressure [kPa] (defaults to 101.3 at sea level)
}

export class Fao56IrrigationEngine {
  /**
   * Psychrometric constant γ [kPa/°C]
   */
  public static calculatePsychrometricConstant(pressureKpa: number = 101.3): number {
    return 0.000665 * pressureKpa;
  }

  /**
   * Slope of saturation vapor pressure curve Δ [kPa/°C]
   */
  public static calculateSlopeVaporPressure(temperatureC: number): number {
    const t = temperatureC;
    const numerator = 4098 * (0.6108 * Math.exp((17.27 * t) / (t + 237.3)));
    const denominator = Math.pow(t + 237.3, 2);
    return numerator / denominator;
  }

  /**
   * Saturation vapor pressure e_s [kPa]
   */
  public static calculateSaturationVaporPressure(temperatureC: number): number {
    return 0.6108 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));
  }

  /**
   * Actual vapor pressure e_a [kPa]
   */
  public static calculateActualVaporPressure(temperatureC: number, rhPercent: number): number {
    const es = this.calculateSaturationVaporPressure(temperatureC);
    return es * (rhPercent / 100.0);
  }

  /**
   * Computes Reference Evapotranspiration ET_0 [mm/day].
   */
  public static calculateET0(weather: WeatherData): number {
    const T = weather.temperatureC;
    const RH = weather.relativeHumidityPercent;
    const u2 = Math.max(0.1, weather.windSpeedMps);
    
    // Determine net radiation Rn. If solar radiation Rs is provided instead of net Rn,
    // apply standard FAO-56 conversion: Rn ≈ (1 - 0.23) * Rs - Rnl ≈ 0.68 * Rs
    let Rn = weather.netRadiationMjM2Day;
    if (Rn === undefined) {
      if (weather.solarRadiationMjM2Day !== undefined) {
        Rn = weather.solarRadiationMjM2Day * 0.68;
      } else {
        Rn = 14.5; // Typical temperate crop day default
      }
    }

    const G = weather.soilHeatFluxMjM2Day ?? 0.0;
    const P = weather.atmosphericPressureKpa ?? 101.3;

    const delta = this.calculateSlopeVaporPressure(T);
    const gamma = this.calculatePsychrometricConstant(P);
    const es = this.calculateSaturationVaporPressure(T);
    const ea = this.calculateActualVaporPressure(T, RH);
    const vpd = Math.max(0, es - ea); // Vapor pressure deficit

    const numerator = 0.408 * delta * (Rn - G) + gamma * (900.0 / (T + 273.0)) * u2 * vpd;
    const denominator = delta + gamma * (1.0 + 0.34 * u2);

    const et0 = numerator / denominator;
    return Number(Math.max(0.1, et0).toFixed(2));
  }

  /**
   * Calculates actual crop water requirement: ET_c = K_c * ET_0 [mm/day]
   * and translates it to Liters per Square Meter or Liters per Hectare.
   */
  public static calculateCropWaterRequirement(
    et0MmDay: number,
    cropCoefficientKc: number,
    areaSquareMeters: number,
    irrigationEfficiency: number = 0.85 // Typical drip irrigation efficiency
  ) {
    const etcMmDay = et0MmDay * cropCoefficientKc;
    const netWaterDepthMm = etcMmDay;
    const grossWaterDepthMm = netWaterDepthMm / irrigationEfficiency;

    // 1 mm of water over 1 m² = 1 Liter
    const dailyVolumeLiters = grossWaterDepthMm * areaSquareMeters;

    return {
      referenceEt0Mm: et0MmDay,
      cropEtcMm: Number(etcMmDay.toFixed(2)),
      grossWaterDepthMm: Number(grossWaterDepthMm.toFixed(2)),
      dailyVolumeLiters: Math.round(dailyVolumeLiters),
      litersPerHectare: Math.round(grossWaterDepthMm * 10000)
    };
  }
}
