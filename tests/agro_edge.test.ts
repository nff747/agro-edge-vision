import { describe, it, expect } from 'vitest';
import { SpectralIndexEngine } from '../src/vision/spectral_indices.js';
import { FoliarDiseaseClassifier } from '../src/vision/disease_detector.js';
import { Fao56IrrigationEngine } from '../src/irrigation/fao56_penman_monteith.js';

describe('SpectralIndexEngine', () => {
  it('correctly calculates pixel-level VARI, ExG, and NGRDI', () => {
    // Healthy green leaf: R=0.2, G=0.6, B=0.1
    const res = SpectralIndexEngine.computePixelIndices(0.2, 0.6, 0.1);
    expect(res.exg).toBeCloseTo(0.9, 2);
    expect(res.ngrdi).toBeCloseTo(0.5, 2);
    expect(res.vari).toBeGreaterThan(0.4);
  });

  it('correctly identifies stressed chlorotic canopy buffer', () => {
    // 2x2 image of chlorotic yellow leaves: R=0.7, G=0.7, B=0.1
    const buffer = new Uint8ClampedArray([
      178, 178, 25, 255,
      178, 178, 25, 255,
      178, 178, 25, 255,
      178, 178, 25, 255
    ]);
    const analysis = SpectralIndexEngine.analyzeCanopyBuffer(buffer, 2, 2);
    expect(analysis.canopyCoverFraction).toBe(1.0);
    expect(analysis.nitrogenStressAlert).toBe(true);
  });
});

describe('FoliarDiseaseClassifier', () => {
  it('identifies leaf rust with high pustule density', () => {
    const diag = FoliarDiseaseClassifier.diagnosePatch(0.65, 0.35, 0.15, 0.05, 0.02, 0.08);
    expect(diag.primaryDiagnosis).toBe('LEAF_RUST');
    expect(diag.organicTreatment).toContain('neem oil');
  });

  it('identifies healthy canopy when no lesions exist', () => {
    const diag = FoliarDiseaseClassifier.diagnosePatch(0.2, 0.7, 0.15, 0.0, 0.0, 0.0);
    expect(diag.primaryDiagnosis).toBe('HEALTHY');
    expect(diag.confidence).toBeGreaterThan(0.95);
  });
});

describe('Fao56IrrigationEngine', () => {
  it('computes accurate reference evapotranspiration (ET_0) for sunny day', () => {
    // Standard FAO sample: T=25C, RH=50%, Wind=2m/s, Solar radiation=22 MJ/m2/day
    const et0 = Fao56IrrigationEngine.calculateET0({
      temperatureC: 25.0,
      relativeHumidityPercent: 50.0,
      windSpeedMps: 2.0,
      solarRadiationMjM2Day: 22.0
    });
    // Expected FAO-56 range for warm semi-arid summer day: ~5.0 - 5.8 mm/day
    expect(et0).toBeGreaterThanOrEqual(4.8);
    expect(et0).toBeLessThanOrEqual(6.2);
  });

  it('computes gross water requirements with drip irrigation efficiency', () => {
    const req = Fao56IrrigationEngine.calculateCropWaterRequirement(5.0, 1.15, 1000, 0.85);
    expect(req.cropEtcMm).toBe(5.75);
    expect(req.dailyVolumeLiters).toBeGreaterThan(6000);
  });
});

// Arid boundary tests

// Solar zenith angle invariance test

// Lesion severity precision test

// FAO verification test

// IDB lifecycle test
