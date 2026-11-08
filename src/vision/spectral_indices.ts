/**
 * AgroEdge Vision - Spectral Index Engine
 * Copyright 2026 nff747. Licensed under Apache-2.0.
 *
 * Implements real-time agricultural visible-spectrum vegetation indices:
 * - VARI (Visible Atmospherically Resistant Index): (Green - Red) / (Green + Red - Blue)
 * - ExG (Excess Green Index): 2 * Green - Red - Blue
 * - NGRDI (Normalized Green-Red Difference Index): (Green - Red) / (Green + Red)
 * - GLI (Green Leaf Index): (2 * Green - Red - Blue) / (2 * Green + Red + Blue)
 */

export interface SpectralAnalysisResult {
  vari: number;
  exg: number;
  ngrdi: number;
  gli: number;
  canopyCoverFraction: number; // 0.0 to 1.0
  vegetationHealthScore: number; // 0 to 100%
  nitrogenStressAlert: boolean;
}

export class SpectralIndexEngine {
  /**
   * Computes normalized spectral indices for a single normalized RGB pixel [0, 1].
   */
  public static computePixelIndices(r: number, g: number, b: number) {
    const denomVari = g + r - b;
    const vari = Math.abs(denomVari) > 1e-5 ? (g - r) / denomVari : 0.0;

    const exg = 2.0 * g - r - b;

    const denomNgrdi = g + r;
    const ngrdi = denomNgrdi > 1e-5 ? (g - r) / denomNgrdi : 0.0;

    const denomGli = 2.0 * g + r + b;
    const gli = denomGli > 1e-5 ? (2.0 * g - r - b) / denomGli : 0.0;

    return { vari, exg, ngrdi, gli };
  }

  /**
   * Evaluates whole canopy image buffer (RGBA Uint8ClampedArray).
   */
  public static analyzeCanopyBuffer(
    buffer: Uint8ClampedArray,
    width: number,
    height: number
  ): SpectralAnalysisResult {
    const totalPixels = width * height;
    if (totalPixels === 0) {
      throw new Error('Image buffer dimension must be non-zero.');
    }

    let sumVari = 0;
    let sumExg = 0;
    let sumNgrdi = 0;
    let sumGli = 0;
    let vegetationPixelCount = 0;

    for (let i = 0; i < buffer.length; i += 4) {
      const r = buffer[i] / 255.0;
      const g = buffer[i + 1] / 255.0;
      const b = buffer[i + 2] / 255.0;

      const indices = this.computePixelIndices(r, g, b);

      // Otsu-derived agricultural vegetation threshold (including chlorotic canopy)
      if (indices.exg > 0.04 || indices.ngrdi > 0.01) {
        vegetationPixelCount++;
        sumVari += indices.vari;
        sumExg += indices.exg;
        sumNgrdi += indices.ngrdi;
        sumGli += indices.gli;
      }
    }

    const canopyCoverFraction = vegetationPixelCount / totalPixels;
    const activePixels = Math.max(1, vegetationPixelCount);

    const meanVari = sumVari / activePixels;
    const meanExg = sumExg / activePixels;
    const meanNgrdi = sumNgrdi / activePixels;
    const meanGli = sumGli / activePixels;

    // Normalizing health score: VARI typically spans [-0.2, 0.6] for field crops
    const healthScore = Math.max(0, Math.min(100, Math.round(((meanVari + 0.1) / 0.6) * 100)));
    const nitrogenStressAlert = meanNgrdi < 0.08 || meanGli < 0.12;

    return {
      vari: Number(meanVari.toFixed(4)),
      exg: Number(meanExg.toFixed(4)),
      ngrdi: Number(meanNgrdi.toFixed(4)),
      gli: Number(meanGli.toFixed(4)),
      canopyCoverFraction: Number(canopyCoverFraction.toFixed(4)),
      vegetationHealthScore: healthScore,
      nitrogenStressAlert
    };
  }
}

export const EPSILON_GUARD = 1e-6;
