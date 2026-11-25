
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import dbConnect from "@/lib/db";
import Product from "@/models/Product";
import RecommendationLog, { AI_STATUS, RECOMMENDATION_STATUS } from "@/models/RecommendationLog";
import { recommendShoes, type UserPreferencesInput } from "@/lib/recommendation";
import { explainRecommendations } from "@/lib/gemini";
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
    // Non-blocking session resolution
  }

  try {
    await dbConnect();

    const preferences: UserPreferencesInput = req.body?.preferences ?? req.body ?? {};

    // Fetch active products from unified catalog
    const shoes = await Product.find({ isActive: true })
      .select(
        "name slug brand description price originalPrice category gender subCategory useCases colors sizes images ratings numOfReviews recommendationFeatures specifications shoppingOffers pros cons stock"
      )
      .lean();

    if (!shoes || shoes.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          totalCandidates: 0,
          totalMatches: 0,
          returnedCount: 0,
          recommendations: [],
          aiExplanation: null,
          message: "No products currently available in the catalog.",
        },
      });
    }

    // Run the content-based recommendation algorithm
    const recResult = recommendShoes({
      shoes,
      preferences,
      limit: 4,
    });

    // Generate grounded AI explanation via Gemini (with automatic deterministic fallback)
    const aiExplanation = await explainRecommendations({
      recommendations: recResult.recommendations,
      preferences: recResult.preferences,
    });

    const processingTimeMs = Date.now() - startTime;

    // Log recommendation asynchronously
    try {
      await RecommendationLog.create({
        userId: sessionUserId || null,
        status: RECOMMENDATION_STATUS.SUCCESS,
        recommendationCount: recResult.recommendations.length,
        productIds: recResult.recommendations.map((r) => String(r.shoe._id)),
        preferences: recResult.preferences as unknown as Record<string, unknown>,
        processingTimeMs,
        aiUsed: aiExplanation.source === "gemini",
        aiStatus: aiExplanation.source === "gemini" ? AI_STATUS.SUCCESS : AI_STATUS.UNAVAILABLE,
        algorithmVersion: "hybrid-v1",
      });
    } catch (logErr) {
      console.warn("RecommendationLog save skipped:", logErr);
    }

    return res.status(200).json({
      success: true,
      data: {
        totalCandidates: recResult.totalCandidates,
        totalMatches: recResult.totalMatches,
        returnedCount: recResult.returnedCount,
        preferences: recResult.preferences as unknown as Record<string, unknown>,
        recommendations: recResult.recommendations,
        aiExplanation,
        processingTimeMs,
      },
    });
  } catch (error: any) {
    console.error("Recommendation error:", error);

    try {
      await RecommendationLog.create({
        userId: sessionUserId || null,
        status: RECOMMENDATION_STATUS.FAILED,
        recommendationCount: 0,
        productIds: [],
        processingTimeMs: Date.now() - startTime,
        aiUsed: false,
        aiStatus: AI_STATUS.FAILED,
        algorithmVersion: "hybrid-v1",
      });
    } catch {
      // Ignore log error on failure
    }

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while generating recommendations.",
    });
  }
}
