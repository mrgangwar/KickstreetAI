
/**
 * Kickstreet + SoleMatch AI
 * Hybrid Content-Based Recommendation Engine
 *
 * File: src/lib/recommendation.ts
 *
 * Features:
 * - Gender and category filtering
 * - Budget filtering and scoring
 * - Brand preference matching
 * - Color preference matching
 * - Use-case matching
 * - Feature-vector similarity (comfort, cushioning, durability, etc.)
 * - Weighted recommendation scoring (0-100)
 * - Explainable score breakdown
 * - Top 4 recommendation selection with deterministic tie-breaking
 */

export const RECOMMENDATION_CONFIG = Object.freeze({
  DEFAULT_LIMIT: 4,
  MAX_LIMIT: 20,

  FEATURE_KEYS: [
    "comfort",
    "cushioning",
    "durability",
    "breathability",
    "flexibility",
    "grip",
    "style",
    "valueForMoney",
  ] as const,

  WEIGHTS: {
    budget: 25,
    brand: 10,
    color: 10,
    category: 15,
    useCase: 15,
    features: 25,
  },

  DEFAULT_FEATURE_VALUE: 7,
  MAX_FEATURE_VALUE: 10,
});

export type FeatureKey = (typeof RECOMMENDATION_CONFIG.FEATURE_KEYS)[number];

export interface UserPreferencesInput {
  gender?: string;
  category?: string;
  brands?: string | string[];
  brand?: string;
  colors?: string | string[];
  color?: string;
  useCases?: string | string[];
  useCase?: string;
  minPrice?: number | string | null;
  maxPrice?: number | string | null;
  priorities?: Partial<Record<FeatureKey, number>>;
  strictBrand?: boolean;
  strictColor?: boolean;
}

export interface NormalizedPreferences {
  gender: string;
  category: string;
  brands: string[];
  colors: string[];
  useCases: string[];
  minPrice: number | null;
  maxPrice: number | null;
  priorities: Partial<Record<FeatureKey, number>>;
  strictBrand: boolean;
  strictColor: boolean;
}

export interface RecommendationScoreBreakdown {
  budget: number;
  brand: number;
  color: number;
  category: number;
  useCase: number;
  features: number;
  total: number;
}

export interface RecommendationResultItem {
  shoe: any;
  score: number;
  effectivePrice: number;
  scoreBreakdown: RecommendationScoreBreakdown;
  matchReasons: string[];
}

export interface RecommendationOutput {
  totalCandidates: number;
  totalMatches: number;
  returnedCount: number;
  preferences: NormalizedPreferences;
  recommendations: RecommendationResultItem[];
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "string" ? v : String(v)));
  }
  if (value === null || value === undefined || value === "") {
    return [];
  }
  return [String(value)];
}

function normalizeList(value: unknown): string[] {
  return [
    ...new Set(
      toArray(value)
        .map(normalizeText)
        .filter(Boolean)
    ),
  ];
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizePreferences(input: UserPreferencesInput = {}): NormalizedPreferences {
  const minPrice = toFiniteNumber(input.minPrice);
  const maxPrice = toFiniteNumber(input.maxPrice);

  if (minPrice !== null && minPrice < 0) {
    throw new Error("Minimum price cannot be negative.");
  }
  if (maxPrice !== null && maxPrice < 0) {
    throw new Error("Maximum price cannot be negative.");
  }
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    throw new Error("Minimum price cannot exceed maximum price.");
  }

  const priorities: Partial<Record<FeatureKey, number>> = {};
  const inputPriorities =
    input.priorities && typeof input.priorities === "object" && !Array.isArray(input.priorities)
      ? input.priorities
      : {};

  for (const key of RECOMMENDATION_CONFIG.FEATURE_KEYS) {
    const value = toFiniteNumber(inputPriorities[key]);
    if (value !== null) {
      priorities[key] = clamp(value, 0, 10);
    }
  }

  return {
    gender: normalizeText(input.gender),
    category: normalizeText(input.category),
    brands: normalizeList(input.brands ?? input.brand),
    colors: normalizeList(input.colors ?? input.color),
    useCases: normalizeList(input.useCases ?? input.useCase),
    minPrice,
    maxPrice,
    priorities,
    strictBrand: input.strictBrand === true,
    strictColor: input.strictColor === true,
  };
}

export function getEffectivePrice(shoe: any): number {
  if (Array.isArray(shoe.shoppingOffers) && shoe.shoppingOffers.length > 0) {
    const available = shoe.shoppingOffers.filter(
      (o: any) => o && o.isAvailable !== false && Number.isFinite(Number(o.price)) && Number(o.price) >= 0
    );
    if (available.length > 0) {
      return Math.min(...available.map((o: any) => Number(o.price)));
    }
  }
  const catalogPrice = toFiniteNumber(shoe.price);
  return catalogPrice !== null && catalogPrice >= 0 ? catalogPrice : 0;
}

function getShoeGender(shoe: any): string {
  if (shoe.gender) {
    return normalizeText(shoe.gender);
  }
  if (shoe.category === "Men") return "men";
  if (shoe.category === "Women") return "women";
  if (shoe.category === "Children") return "kids";
  return "unisex";
}

function getShoeCategory(shoe: any): string {
  if (shoe.subCategory) {
    return normalizeText(shoe.subCategory);
  }
  if (shoe.category) {
    return normalizeText(shoe.category);
  }
  return "sneakers";
}

function matchesGender(shoeGender: string, requestedGender: string): boolean {
  if (!requestedGender) return true;
  const sg = normalizeText(shoeGender);
  if (sg === requestedGender) return true;
  return sg === "unisex" && (requestedGender === "men" || requestedGender === "women" || requestedGender === "unisex");
}

function matchesCategory(shoeCategory: string, requestedCategory: string): boolean {
  if (!requestedCategory) return true;
  const sc = normalizeText(shoeCategory);
  const rc = normalizeText(requestedCategory);
  if (sc === rc) return true;
  if ((rc === "sneakers" || rc === "casual") && (sc === "sneakers" || sc === "casual")) return true;
  if ((rc === "sports" || rc === "running") && (sc === "sports" || sc === "running")) return true;
  return false;
}

export function passesHardFilters(shoe: any, prefs: NormalizedPreferences): boolean {
  if (!shoe || shoe.isActive === false) {
    return false;
  }

  const effectivePrice = getEffectivePrice(shoe);
  if (prefs.minPrice !== null && effectivePrice < prefs.minPrice) {
    return false;
  }
  if (prefs.maxPrice !== null && effectivePrice > prefs.maxPrice) {
    return false;
  }

  const shoeGender = getShoeGender(shoe);
  if (!matchesGender(shoeGender, prefs.gender)) {
    return false;
  }

  const shoeCategory = getShoeCategory(shoe);
  if (!matchesCategory(shoeCategory, prefs.category)) {
    return false;
  }

  if (prefs.strictBrand && prefs.brands.length > 0) {
    const shoeBrand = normalizeText(shoe.brand);
    if (!prefs.brands.includes(shoeBrand)) {
      return false;
    }
  }

  if (prefs.strictColor && prefs.colors.length > 0) {
    const shoeColors = normalizeList(shoe.colors);
    const hasColorMatch = prefs.colors.some((c) => shoeColors.includes(c));
    if (!hasColorMatch) {
      return false;
    }
  }

  return true;
}

function calculateBudgetScore(price: number, minPrice: number | null, maxPrice: number | null): number {
  if (minPrice === null && maxPrice === null) return 1.0;
  if (minPrice !== null && maxPrice !== null) {
    if (price < minPrice || price > maxPrice) return 0;
    const mid = (minPrice + maxPrice) / 2;
    const halfSpan = Math.max((maxPrice - minPrice) / 2, 1);
    const distance = Math.abs(price - mid);
    return Math.max(0, 1 - (distance / halfSpan) * 0.4);
  }
  if (maxPrice !== null) {
    if (price > maxPrice) return 0;

    // Prevent division by zero when the maximum budget is zero.
    if (maxPrice === 0) {
      return price === 0 ? 1.0 : 0;
    }

    return Math.max(0.6, 1 - (price / maxPrice) * 0.3);
  }
  if (minPrice !== null) {
    if (price < minPrice) return 0;
    return 1.0;
  }
  return 1.0;
}

function calculateBrandScore(shoeBrand: string, requestedBrands: string[]): number {
  if (requestedBrands.length === 0) return 0.7;
  const brand = normalizeText(shoeBrand);
  return requestedBrands.includes(brand) ? 1.0 : 0.2;
}

function calculateColorScore(shoeColors: unknown, requestedColors: string[]): number {
  if (requestedColors.length === 0) return 0.7;
  const colors = normalizeList(shoeColors);
  const match = requestedColors.some((c) => colors.includes(c));
  return match ? 1.0 : 0.3;
}

function calculateCategoryScore(shoeCategory: string, requestedCategory: string): number {
  if (!requestedCategory) return 0.8;
  const sc = normalizeText(shoeCategory);
  const rc = normalizeText(requestedCategory);
  if (sc === rc) return 1.0;
  if (matchesCategory(sc, rc)) return 0.85;
  return 0.3;
}

function calculateUseCaseScore(shoeUseCases: unknown, requestedUseCases: string[]): number {
  if (requestedUseCases.length === 0) return 0.8;
  const uses = normalizeList(shoeUseCases);
  if (uses.length === 0) return 0.5;
  const matched = requestedUseCases.filter((u) => uses.includes(u)).length;
  return Math.min(1.0, 0.4 + (matched / requestedUseCases.length) * 0.6);
}

function calculateFeaturesScore(shoe: any, priorities: Partial<Record<FeatureKey, number>>): number {
  const rf = shoe.recommendationFeatures || {};
  const activeKeys = Object.keys(priorities) as FeatureKey[];
  if (activeKeys.length === 0) {
    const scores = RECOMMENDATION_CONFIG.FEATURE_KEYS.map((k) =>
      Number(rf[k] ?? RECOMMENDATION_CONFIG.DEFAULT_FEATURE_VALUE)
    );
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return clamp(avg / 10, 0, 1);
  }

  let totalWeight = 0;
  let weightedSum = 0;

  for (const key of activeKeys) {
    const weight = Number(priorities[key]);
    if (weight > 0) {
      const shoeVal = Number(rf[key] ?? RECOMMENDATION_CONFIG.DEFAULT_FEATURE_VALUE);
      weightedSum += (shoeVal / 10) * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return 0.7;
  return clamp(weightedSum / totalWeight, 0, 1);
}

export function calculateRecommendationScore(shoe: any, prefs: NormalizedPreferences) {
  const effectivePrice = getEffectivePrice(shoe);
  const budgetRatio = calculateBudgetScore(effectivePrice, prefs.minPrice, prefs.maxPrice);
  const brandRatio = calculateBrandScore(shoe.brand, prefs.brands);
  const colorRatio = calculateColorScore(shoe.colors, prefs.colors);
  const categoryRatio = calculateCategoryScore(getShoeCategory(shoe), prefs.category);
  const useCaseRatio = calculateUseCaseScore(shoe.useCases, prefs.useCases);
  const featuresRatio = calculateFeaturesScore(shoe, prefs.priorities);

  const W = RECOMMENDATION_CONFIG.WEIGHTS;
  const breakdown: RecommendationScoreBreakdown = {
    budget: Math.round(budgetRatio * W.budget * 10) / 10,
    brand: Math.round(brandRatio * W.brand * 10) / 10,
    color: Math.round(colorRatio * W.color * 10) / 10,
    category: Math.round(categoryRatio * W.category * 10) / 10,
    useCase: Math.round(useCaseRatio * W.useCase * 10) / 10,
    features: Math.round(featuresRatio * W.features * 10) / 10,
    total: 0,
  };

  breakdown.total = Math.round(
    breakdown.budget +
      breakdown.brand +
      breakdown.color +
      breakdown.category +
      breakdown.useCase +
      breakdown.features
  );

  return {
    score: breakdown.total,
    effectivePrice,
    breakdown,
  };
}

export function buildMatchReasons(shoe: any, prefs: NormalizedPreferences, breakdown: RecommendationScoreBreakdown): string[] {
  const reasons: string[] = [];
  const effectivePrice = getEffectivePrice(shoe);

  if (prefs.maxPrice !== null && effectivePrice <= prefs.maxPrice) {
    reasons.push(`Comfortably within your ₹${prefs.maxPrice.toLocaleString("en-IN")} budget`);
  } else if (effectivePrice > 0) {
    reasons.push(`Competitive pricing at ₹${effectivePrice.toLocaleString("en-IN")}`);
  }

  if (prefs.brands.includes(normalizeText(shoe.brand))) {
    reasons.push(`Matches your preferred brand: ${shoe.brand}`);
  }

  const shoeColors = normalizeList(shoe.colors);
  const matchedColors = prefs.colors.filter((c) => shoeColors.includes(c));
  if (matchedColors.length > 0) {
    reasons.push(`Available in your selected color (${matchedColors.join(", ")})`);
  }

  const rf = shoe.recommendationFeatures || {};
  if (rf.comfort >= 8) reasons.push("Engineered for exceptional all-day cushioning and comfort");
  if (rf.durability >= 8) reasons.push("High-durability sole and reinforced construction");
  if (rf.grip >= 8) reasons.push("Superior multi-surface traction and grip");
  if (rf.breathability >= 8) reasons.push("Enhanced airflow and breathable upper");

  if (reasons.length === 0) {
    reasons.push(`Top-rated choice in ${shoe.category || "Sneakers"}`);
  }

  return reasons.slice(0, 4);
}

function getProductId(shoe: any): string {
  return String(shoe._id ?? shoe.id ?? shoe.slug ?? shoe.name ?? "");
}

export function recommendShoes({
  shoes = [],
  preferences = {},
  limit = RECOMMENDATION_CONFIG.DEFAULT_LIMIT,
}: {
  shoes?: any[];
  preferences?: UserPreferencesInput;
  limit?: number;
} = {}): RecommendationOutput {
  if (!Array.isArray(shoes)) {
    throw new TypeError("Shoes must be an array.");
  }

  const normalizedPreferences = normalizePreferences(preferences);
  const safeLimit = clamp(Number(limit) || RECOMMENDATION_CONFIG.DEFAULT_LIMIT, 1, RECOMMENDATION_CONFIG.MAX_LIMIT);

  const eligibleShoes = shoes.filter((shoe) => passesHardFilters(shoe, normalizedPreferences));

  const rankedShoes: RecommendationResultItem[] = eligibleShoes.map((shoe) => {
    const result = calculateRecommendationScore(shoe, normalizedPreferences);
    return {
      shoe,
      score: result.score,
      effectivePrice: result.effectivePrice,
      scoreBreakdown: result.breakdown,
      matchReasons: buildMatchReasons(shoe, normalizedPreferences, result.breakdown),
    };
  });

  rankedShoes.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.effectivePrice !== b.effectivePrice) {
      return a.effectivePrice - b.effectivePrice;
    }
    return getProductId(a.shoe).localeCompare(getProductId(b.shoe));
  });

  return {
    totalCandidates: shoes.length,
    totalMatches: eligibleShoes.length,
    returnedCount: Math.min(safeLimit, rankedShoes.length),
    preferences: normalizedPreferences,
    recommendations: rankedShoes.slice(0, safeLimit),
  };
}

export default recommendShoes;
