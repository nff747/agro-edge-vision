/**
 * AgroEdge Vision - Foliar Disease & Lesion Classifier
 * Copyright 2026 nff747. Licensed under Apache-2.0.
 *
 * Edge-resident optical lesion detection identifying:
 * - Leaf Rust (Puccinia spp.)
 * - Early Blight (Alternaria solani)
 * - Powdery Mildew (Erysiphales)
 * - Chlorosis / Nitrogen Deficiency
 * - Healthy Canopy
 */

export type CropDiseaseType = 
  | 'HEALTHY'
  | 'LEAF_RUST'
  | 'EARLY_BLIGHT'
  | 'POWDERY_MILDEW'
  | 'CHLOROSIS';

export interface DiseaseDiagnosis {
  primaryDiagnosis: CropDiseaseType;
  confidence: number; // 0.0 - 1.0
  severityFraction: number; // Lesion area relative to leaf area [0, 1]
  organicTreatment: string;
  chemicalTreatment: string;
  recommendedWaterScheduleAdjustment: string;
}

export class FoliarDiseaseClassifier {
  /**
   * Fast edge heuristic inspection over color distribution and edge entropy.
   */
  public static diagnosePatch(
    meanR: number,
    meanG: number,
    meanB: number,
    chloroticRatio: number,
    necroticRatio: number,
    pustuleRatio: number
  ): DiseaseDiagnosis {
    // Rust: high pustule ratio (cinnamon/orange-brown spots: high R, moderate G, low B)
    if (pustuleRatio > 0.04 && meanR > meanB * 1.5) {
      return {
        primaryDiagnosis: 'LEAF_RUST',
        confidence: Math.min(0.96, 0.75 + pustuleRatio * 3),
        severityFraction: Math.min(1.0, pustuleRatio * 2.5),
        organicTreatment: 'Apply neem oil solution (5ml/L) or Bacillus subtilis bio-fungicide at dawn.',
        chemicalTreatment: 'Tebuconazole or Azoxystrobin spray targeted to affected canopy foliage.',
        recommendedWaterScheduleAdjustment: 'Shift to drip irrigation immediately to avoid foliar wetness duration > 6 hours.'
      };
    }

    // Early Blight: concentric target-board dark brown necrotic lesions
    if (necroticRatio > 0.06) {
      return {
        primaryDiagnosis: 'EARLY_BLIGHT',
        confidence: Math.min(0.95, 0.70 + necroticRatio * 2.5),
        severityFraction: Math.min(1.0, necroticRatio * 2.0),
        organicTreatment: 'Copper sulfate octahydrate or Trichoderma harzianum soil inoculation.',
        chemicalTreatment: 'Chlorothalonil or Mancozeb protective barrier fungicide.',
        recommendedWaterScheduleAdjustment: 'Irrigate early morning (05:00-07:00) so canopy dries rapidly under morning sun.'
      };
    }

    // Powdery Mildew: white/grey talcum-like superficial patches
    if (meanR > 0.65 && meanG > 0.65 && meanB > 0.65 && chloroticRatio > 0.05) {
      return {
        primaryDiagnosis: 'POWDERY_MILDEW',
        confidence: 0.88,
        severityFraction: chloroticRatio,
        organicTreatment: 'Potassium bicarbonate (3g/L) or 10% unpasteurized milk foliar spray.',
        chemicalTreatment: 'Myclobutanil or sulfur dust formulation.',
        recommendedWaterScheduleAdjustment: 'Ensure canopy pruning to increase air circulation; reduce night irrigation cycles.'
      };
    }

    // Chlorosis: generalized leaf yellowing (High R+G, low B)
    if (chloroticRatio > 0.15 && meanG > 0.4 && meanR > 0.4) {
      return {
        primaryDiagnosis: 'CHLOROSIS',
        confidence: 0.92,
        severityFraction: chloroticRatio,
        organicTreatment: 'Foliar application of chelated iron (Fe-EDDHA) and compost tea enriched with nitrogen.',
        chemicalTreatment: 'Ammonium sulfate or urea top-dressing with trace micronutrient cocktail.',
        recommendedWaterScheduleAdjustment: 'Check soil drainage; prevent anaerobic root waterlogging that locks iron uptake.'
      };
    }

    return {
      primaryDiagnosis: 'HEALTHY',
      confidence: 0.98,
      severityFraction: 0.0,
      organicTreatment: 'Maintain preventive vermicompost extract and biochar top-dressing.',
      chemicalTreatment: 'None required. Continue standard NPK maintenance fertilization.',
      recommendedWaterScheduleAdjustment: 'Follow standard FAO-56 Penman-Monteith daily reference schedule.'
    };
  }
}

// Cercospora leaf spot detection profile
