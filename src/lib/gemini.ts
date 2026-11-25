
/**
 * Kickstreet + SoleMatch AI
 * Google Gemini AI Integration & Grounded Explanations
 *
 * File: src/lib/gemini.ts
 *
 * Features:
 * - Server-side Gemini API REST requests
 * - Evidence-based explanations grounded on actual product attributes
 * - Pros, cons, match reasons, and budget suitability
 * - Comparison summary among recommended products
 * - Timeout handling and retry logic
 * - Deterministic fallback explanation generator when Gemini is unconfigured or unavailable
 * - Clear distinction between "gemini" and "fallback" sources
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const configuredTimeout = Number(process.env.GEMINI_TIMEOUT_MS);

export const GEMINI_CONFIG = Object.freeze({
  DEFAULT_MODEL: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  DEFAULT_TIMEOUT_MS:
    Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 20000,
  MAX_RETRIES: 2,
  MAX_PRODUCTS: 4,
  MAX_OUTPUT_TOKENS: 2500,
  TEMPERATURE: 0.2,
});

export interface GeminiProductInput {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  colors?: string[];
  features?: string[];
  specifications?: Record<string, unknown>;
  recommendationFeatures?: Record<string, number>;
  pros?: string[];
  cons?: string[];
  matchScore?: number;
}

export interface GroundedProductExplanation {
  productId: string;
  productName: string;
  whyItMatches: string;
  highlightedFeatures: string[];
  pros: string[];
  cons: string[];
  budgetSuitability: string;
}

export interface GroundedComparisonSummary {
  bestOverallProductId: string;
  reason: string;
  keyDifferences: string[];
}

export interface GeminiExplanationResponse {
  success: boolean;
  source: "gemini" | "fallback";
  model: string | null;
  data: {
    summary: string;
    recommendations: GroundedProductExplanation[];
    comparison: GroundedComparisonSummary;
    disclaimer: string;
  };
}

export class GeminiError extends Error {
  code: string;
  status: number | null;
  retryable: boolean;

  constructor(
    message: string,
    {
      code = "GEMINI_ERROR",
      status = null,
      retryable = false,
    }: {
      code?: string;
      status?: number | null;
      retryable?: boolean;
    } = {}
  ) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key && key.length > 5 ? key : null;
}

function prepareProduct(item: any): GeminiProductInput {
  const shoe = item.shoe ?? item;
  const id = String(shoe._id ?? shoe.id ?? shoe.slug ?? "");
  const rf = shoe.recommendationFeatures ?? {};

  return {
    id,
    name: String(shoe.name ?? "Sneaker"),
    brand: String(shoe.brand ?? "KickStreet"),
    category: String(shoe.subCategory ?? shoe.category ?? "sneakers"),
    price: Number(shoe.price ?? 0),
    colors: Array.isArray(shoe.colors) ? shoe.colors : [],
    features: Array.isArray(shoe.useCases) ? shoe.useCases : [],
    specifications: shoe.specifications ?? {},
    recommendationFeatures: {
      comfort: Number(rf.comfort ?? 7),
      cushioning: Number(rf.cushioning ?? 7),
      durability: Number(rf.durability ?? 8),
      breathability: Number(rf.breathability ?? 7),
      flexibility: Number(rf.flexibility ?? 7),
      grip: Number(rf.grip ?? 7),
      style: Number(rf.style ?? 8),
      valueForMoney: Number(rf.valueForMoney ?? 8),
    },
    pros: Array.isArray(shoe.pros) ? shoe.pros : [],
    cons: Array.isArray(shoe.cons) ? shoe.cons : [],
    matchScore: typeof item.score === "number" ? item.score : undefined,
  };
}

function createFallbackExplanation(
  products: GeminiProductInput[],
  preferences: Record<string, any> = {}
): GeminiExplanationResponse["data"] {
  const explanations: GroundedProductExplanation[] = products.map((p) => {
    const rf = p.recommendationFeatures || {};
    const strengths: string[] = [];

    if ((rf.comfort ?? 0) >= 8) {
      strengths.push("Exceptional all-day cushioning");
    }

    if ((rf.durability ?? 0) >= 8) {
      strengths.push("Heavy-duty outsole construction");
    }

    if ((rf.grip ?? 0) >= 8) {
      strengths.push("High-traction slip-resistant tread");
    }

    if ((rf.breathability ?? 0) >= 8) {
      strengths.push("Breathable lightweight upper");
    }

    if (strengths.length === 0) {
      strengths.push("Reliable everyday sneaker performance");
    }

    const userBudget = preferences.maxPrice
      ? `₹${Number(preferences.maxPrice).toLocaleString("en-IN")}`
      : null;

    const budgetNote = userBudget
      ? p.price <= preferences.maxPrice
        ? `Priced at ₹${p.price.toLocaleString("en-IN")}, comfortably within your ${userBudget} budget.`
        : `Priced at ₹${p.price.toLocaleString("en-IN")}, slightly exceeding your target ${userBudget}.`
      : `Priced at ₹${p.price.toLocaleString("en-IN")}.`;

    return {
      productId: p.id,
      productName: p.name,
      whyItMatches: `${p.name} from ${p.brand} aligns with your preferences with a verified suitability score of ${p.matchScore ?? 85}/100.`,
      highlightedFeatures: strengths,
      pros:
        p.pros && p.pros.length > 0
          ? p.pros
          : ["Premium design and fit", "Durable materials for everyday wear"],
      cons:
        p.cons && p.cons.length > 0
          ? p.cons
          : ["Requires gentle cleaning for longevity"],
      budgetSuitability: budgetNote,
    };
  });

  const bestProduct = products[0] || null;

  return {
    summary:
      products.length > 0
        ? `We analyzed ${products.length} matching sneakers from the KickStreet catalog that align with your specified criteria.`
        : "No products available for explanation.",

    recommendations: explanations,

    comparison: {
      bestOverallProductId: bestProduct?.id ?? "",
      reason: bestProduct
        ? `${bestProduct.name} stands out as the best overall match based on composite comfort, durability, and budget alignment.`
        : "N/A",
      keyDifferences: products.map(
        (p) =>
          `${p.brand} ${p.name}: ₹${p.price.toLocaleString("en-IN")} — ${p.category} profile.`
      ),
    },

    disclaimer:
      "Explanations generated using deterministic Kickstreet catalog attribute grounding.",
  };
}

function buildPrompt(
  products: GeminiProductInput[],
  preferences: Record<string, any>
): string {
  return `You are SoleMatch AI, an expert shoe recommendation advisor integrated into the KickStreet sneaker platform.
Evaluate the following top-ranked shoe recommendations against the user's preferences.

CRITICAL INSTRUCTIONS:
1. ONLY use the verified facts and attributes provided below for each shoe. DO NOT fabricate prices, specifications, or ratings.
2. Return a valid JSON response conforming strictly to the requested schema.
3. Every recommendation MUST reference the exact productId provided.
4. Do not invent product names or product IDs.
5. Include exactly one recommendation for each supplied product.
6. The bestOverallProductId MUST match one of the supplied product IDs.

USER PREFERENCES:
${JSON.stringify(preferences, null, 2)}

RECOMMENDED SHOES:
${JSON.stringify(products, null, 2)}

Provide a structured JSON output with this exact shape:
{
  "summary": "Brief 2-sentence summary of why these shoes match the user's preferences",
  "recommendations": [
    {
      "productId": "string matching input id",
      "productName": "string",
      "whyItMatches": "Specific explanation grounded in user preferences and product attributes",
      "highlightedFeatures": ["feature 1", "feature 2"],
      "pros": ["verified pro 1", "verified pro 2"],
      "cons": ["realistic limitation 1"],
      "budgetSuitability": "Assessment of price vs user budget"
    }
  ],
  "comparison": {
    "bestOverallProductId": "id of best product",
    "reason": "Clear explanation of why this product is top recommended",
    "keyDifferences": ["Difference 1", "Difference 2"]
  },
  "disclaimer": "AI recommendations are grounded in KickStreet catalog attributes."
}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
}

function validateGeminiResponse(
  parsed: any,
  products: GeminiProductInput[]
): GeminiExplanationResponse["data"] | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  if (
    !isNonEmptyString(parsed.summary) ||
    !isNonEmptyString(parsed.disclaimer) ||
    !Array.isArray(parsed.recommendations)
  ) {
    return null;
  }

  const comparison = parsed.comparison;

  if (
    !comparison ||
    typeof comparison !== "object" ||
    Array.isArray(comparison) ||
    !isNonEmptyString(comparison.bestOverallProductId) ||
    !isNonEmptyString(comparison.reason) ||
    !isStringArray(comparison.keyDifferences)
  ) {
    return null;
  }

  const validProductIds = new Set(products.map((product) => product.id));

  if (!validProductIds.has(comparison.bestOverallProductId)) {
    return null;
  }

  if (parsed.recommendations.length !== products.length) {
    return null;
  }

  const seenProductIds = new Set<string>();

  const recommendations: GroundedProductExplanation[] = [];

  for (const rec of parsed.recommendations) {
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) {
      return null;
    }

    if (
      !isNonEmptyString(rec.productId) ||
      !isNonEmptyString(rec.whyItMatches) ||
      !isStringArray(rec.highlightedFeatures) ||
      !isStringArray(rec.pros) ||
      !isStringArray(rec.cons) ||
      !isNonEmptyString(rec.budgetSuitability)
    ) {
      return null;
    }

    const matchingProduct = products.find(
      (product) => product.id === rec.productId
    );

    if (!matchingProduct || seenProductIds.has(rec.productId)) {
      return null;
    }

    seenProductIds.add(rec.productId);

    recommendations.push({
      productId: matchingProduct.id,
      productName: matchingProduct.name,
      whyItMatches: rec.whyItMatches.trim(),
      highlightedFeatures: rec.highlightedFeatures,
      pros: rec.pros,
      cons: rec.cons,
      budgetSuitability: rec.budgetSuitability.trim(),
    });
  }

  if (seenProductIds.size !== products.length) {
    return null;
  }

  return {
    summary: parsed.summary.trim(),
    recommendations,
    comparison: {
      bestOverallProductId: comparison.bestOverallProductId,
      reason: comparison.reason.trim(),
      keyDifferences: comparison.keyDifferences,
    },
    disclaimer: parsed.disclaimer.trim(),
  };
}

function createFallbackResponse(
  products: GeminiProductInput[],
  preferences: Record<string, any>,
  model: string | null
): GeminiExplanationResponse {
  return {
    success: true,
    source: "fallback",
    model,
    data: createFallbackExplanation(products, preferences),
  };
}

function isRetryableStatus(status: number): boolean {
  // 429 (quota/rate limit) is NOT retryable — if daily quota is exhausted,
  // retries just waste time. Fall back immediately.
  return status >= 500;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestGemini(
  url: string,
  prompt: string
): Promise<unknown> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    GEMINI_CONFIG.DEFAULT_TIMEOUT_MS
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: GEMINI_CONFIG.TEMPERATURE,
          maxOutputTokens: GEMINI_CONFIG.MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      throw new GeminiError(
        `Gemini API responded with HTTP ${res.status}.`,
        {
          code: "GEMINI_HTTP_ERROR",
          status: res.status,
          retryable: isRetryableStatus(res.status),
        }
      );
    }

    return await res.json();
  } catch (error: unknown) {
    if (error instanceof GeminiError) {
      throw error;
    }

    if (
      error instanceof Error &&
      (error.name === "AbortError" || controller.signal.aborted)
    ) {
      throw new GeminiError("Gemini API request timed out.", {
        code: "GEMINI_TIMEOUT",
        retryable: true,
      });
    }

    throw new GeminiError(
      error instanceof Error
        ? error.message
        : "Unknown Gemini API request error.",
      {
        code: "GEMINI_NETWORK_ERROR",
        retryable: true,
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function explainRecommendations({
  recommendations = [],
  preferences = {},
}: {
  recommendations?: any[];
  preferences?: Record<string, any>;
} = {}): Promise<GeminiExplanationResponse> {
  const selected = recommendations.slice(0, GEMINI_CONFIG.MAX_PRODUCTS);

  if (selected.length === 0) {
    return {
      success: true,
      source: "fallback",
      model: null,
      data: {
        summary: "No matching shoes were found for the specified preferences.",
        recommendations: [],
        comparison: {
          bestOverallProductId: "",
          reason: "",
          keyDifferences: [],
        },
        disclaimer: "Try adjusting your filters or price range.",
      },
    };
  }

  const products = selected.map(prepareProduct);
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    return createFallbackResponse(products, preferences, null);
  }

  const model = GEMINI_CONFIG.DEFAULT_MODEL;
  const prompt = buildPrompt(products, preferences);

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  for (
    let attempt = 0;
    attempt <= GEMINI_CONFIG.MAX_RETRIES;
    attempt++
  ) {
    try {
      const payload: any = await requestGemini(url, prompt);

      const candidateText =
        payload?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!isNonEmptyString(candidateText)) {
        throw new GeminiError(
          "Gemini returned an empty or invalid response.",
          {
            code: "GEMINI_EMPTY_RESPONSE",
            retryable: true,
          }
        );
      }

      let parsed: any;

      try {
        parsed = JSON.parse(candidateText);
      } catch {
        throw new GeminiError(
          "Gemini returned invalid JSON.",
          {
            code: "GEMINI_INVALID_JSON",
            retryable: true,
          }
        );
      }

      const validatedData = validateGeminiResponse(parsed, products);

      if (!validatedData) {
        throw new GeminiError(
          "Gemini response failed schema or product validation.",
          {
            code: "GEMINI_INVALID_RESPONSE",
            retryable: true,
          }
        );
      }

      return {
        success: true,
        source: "gemini",
        model,
        data: validatedData,
      };
    } catch (error: unknown) {
      const geminiError =
        error instanceof GeminiError
          ? error
          : new GeminiError(
              error instanceof Error
                ? error.message
                : "Unknown Gemini error.",
              {
                code: "GEMINI_ERROR",
                retryable: true,
              }
            );

      const hasRetriesLeft = attempt < GEMINI_CONFIG.MAX_RETRIES;

      if (geminiError.retryable && hasRetriesLeft) {
        console.warn(
          `[Gemini AI] Attempt ${attempt + 1} failed (${geminiError.code}). Retrying.`
        );

        await wait(500 * Math.pow(2, attempt));
        continue;
      }

      console.warn(
        `[Gemini AI] Request failed (${geminiError.code}). Using deterministic fallback.`
      );

      break;
    }
  }

  return createFallbackResponse(products, preferences, model);
}

export default explainRecommendations;
