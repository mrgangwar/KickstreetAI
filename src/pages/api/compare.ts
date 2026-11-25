
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Product from "@/models/Product";
import ComparisonLog, { COMPARISON_STATUS, COMPARISON_AI_STATUS } from "@/models/ComparisonLog";
import {
  calculateRecommendationScore,
  normalizePreferences,
  getEffectivePrice,
  type UserPreferencesInput,
} from "@/lib/recommendation";
import { authOptions } from "./auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ success: false, message: "Method not allowed. Use POST." });
  }

  const startTime = Date.now();
  let sessionUserId: string | null = null;

  try {
    const session = await getServerSession(req, res, authOptions);
    if (session?.user?.id) {
      sessionUserId = session.user.id;
    }
  } catch {
    // Non-blocking session check
  }

  try {
    const { productIds, shoeIds, preferences } = req.body || {};
    const ids: string[] = Array.isArray(productIds) ? productIds : Array.isArray(shoeIds) ? shoeIds : [];

    if (!Array.isArray(ids) || ids.length < 2 || ids.length > 4) {
      return res.status(400).json({
        success: false,
        message: "Please provide between 2 and 4 product IDs to compare.",
      });
    }

    // Deduplicate IDs
    const uniqueIds = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
    if (uniqueIds.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Please select at least 2 distinct products to compare.",
      });
    }

    await dbConnect();

    // Query valid ObjectIds or slugs
    const validObjectIds = uniqueIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const shoes = await Product.find({
      $or: [{ _id: { $in: validObjectIds } }, { slug: { $in: uniqueIds } }],
      isActive: true,
    }).lean();

    if (shoes.length < 2) {
      return res.status(404).json({
        success: false,
        message: "Could not find at least 2 active products with the provided IDs.",
      });
    }

    // Ensure every requested product was found
    if (shoes.length !== uniqueIds.length) {
      return res.status(404).json({
        success: false,
        message: "One or more selected products could not be found or are inactive. Please select the products again.",
      });
    }

    // Normalize optional preferences
    let normalizedPrefs: any = null;
    if (preferences && typeof preferences === "object" && Object.keys(preferences).length > 0) {
      try {
        normalizedPrefs = normalizePreferences(preferences as UserPreferencesInput);
      } catch {
        // Continue without preferences
      }
    }

    // Map each product's comparison details
    const productsCompared = shoes.map((shoe: any) => {
      const effectivePrice = getEffectivePrice(shoe);
      const rf = shoe.recommendationFeatures || {
        comfort: 7,
        cushioning: 7,
        durability: 8,
        breathability: 7,
        flexibility: 7,
        grip: 7,
        style: 8,
        valueForMoney: 8,
      };

      const specs = shoe.specifications || {
        upperMaterial: "mesh",
        soleMaterial: "rubber",
        closureType: "lace-up",
        fit: "regular",
        weightGrams: 350,
        waterproof: false,
        breathable: true,
        cushioned: true,
        lightweight: true,
        slipResistant: true,
      };

      let suitabilityScore: number | null = null;
      if (normalizedPrefs) {
        const scoreResult = calculateRecommendationScore(shoe, normalizedPrefs);
        suitabilityScore = scoreResult.score;
      }

      return {
        _id: String(shoe._id),
        name: shoe.name,
        slug: shoe.slug,
        brand: shoe.brand,
        category: shoe.category,
        subCategory: shoe.subCategory || shoe.category,
        price: shoe.price,
        originalPrice: shoe.originalPrice || null,
        effectivePrice,
        images: Array.isArray(shoe.images) ? shoe.images : [],
        stock: shoe.stock,
        ratings: shoe.ratings ?? 0,
        numOfReviews: shoe.numOfReviews ?? 0,
        suitabilityScore,
        recommendationFeatures: rf,
        specifications: specs,
        pros: Array.isArray(shoe.pros) ? shoe.pros : [],
        cons: Array.isArray(shoe.cons) ? shoe.cons : [],
        shoppingOffers: Array.isArray(shoe.shoppingOffers) ? shoe.shoppingOffers : [],
      };
    });

    // Determine price range & differences
    const prices = productsCompared.map((p) => p.effectivePrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceDiff = maxPrice - minPrice;

    // Build comparison summary
    const featureKeys = [
      "comfort",
      "cushioning",
      "durability",
      "breathability",
      "flexibility",
      "grip",
      "style",
      "valueForMoney",
    ] as const;

    const featureLeaders: Record<string, { productId: string; productName: string; score: number }> = {};
    for (const key of featureKeys) {
      let best = productsCompared[0];
      for (const p of productsCompared) {
        if ((p.recommendationFeatures[key] ?? 0) > (best.recommendationFeatures[key] ?? 0)) {
          best = p;
        }
      }
      featureLeaders[key] = {
        productId: best._id,
        productName: best.name,
        score: best.recommendationFeatures[key] ?? 7,
      };
    }

    const processingTimeMs = Date.now() - startTime;

    // Log comparison activity
    try {
      await ComparisonLog.create({
        userId: sessionUserId || null,
        status: COMPARISON_STATUS.SUCCESS,
        productCount: productsCompared.length,
        productIds: productsCompared.map((p) => p._id),
        processingTimeMs,
        aiUsed: false,
        aiStatus: COMPARISON_AI_STATUS.SKIPPED,
        algorithmVersion: "comparison-v1",
      });
    } catch (logErr) {
      console.warn("ComparisonLog skipped:", logErr);
    }

    return res.status(200).json({
      success: true,
      data: {
        productCount: productsCompared.length,
        products: productsCompared,
        priceAnalysis: {
          lowestPrice: minPrice,
          highestPrice: maxPrice,
          priceDifference: priceDiff,
        },
        featureLeaders,
        processingTimeMs,
      },
    });
  } catch (error: unknown) {
    console.error(
      "Comparison API error:",
      error instanceof Error ? error.name : "UnknownError"
    );

    try {
      await ComparisonLog.create({
        userId: sessionUserId || null,
        status: COMPARISON_STATUS.FAILED,
        productCount: 0,
        productIds: [],
        processingTimeMs: Date.now() - startTime,
        aiUsed: false,
        aiStatus: COMPARISON_AI_STATUS.FAILED,
        algorithmVersion: "comparison-v1",
      });
    } catch {
      // Ignore
    }

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while comparing products.",
    });
  }
}
