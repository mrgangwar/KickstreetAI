import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ success: false, message: "Unauthorized. Please sign in." });
  }

  await dbConnect();

  if (req.method === "GET") {
    try {
      const user = await User.findById(session.user.id).select("preferences name email");
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
      }
      return res.status(200).json({ success: true, preferences: user.preferences || {} });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error?.message || "Failed to load preferences." });
    }
  }

  if (req.method === "POST" || req.method === "PUT") {
    try {
      const { gender, category, brands, colors, useCases, minPrice, maxPrice, priorities } = req.body || {};

      const updatedUser = await User.findByIdAndUpdate(
        session.user.id,
        {
          $set: {
            preferences: {
              gender: typeof gender === "string" ? gender : "",
              category: typeof category === "string" ? category : "",
              brands: Array.isArray(brands) ? brands : [],
              colors: Array.isArray(colors) ? colors : [],
              useCases: Array.isArray(useCases) ? useCases : [],
              minPrice: typeof minPrice === "number" ? minPrice : null,
              maxPrice: typeof maxPrice === "number" ? maxPrice : null,
              priorities: typeof priorities === "object" && priorities !== null ? priorities : {},
            },
          },
        },
        { new: true }
      ).select("preferences");

      return res.status(200).json({
        success: true,
        message: "Preferences updated successfully.",
        preferences: updatedUser?.preferences,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error?.message || "Failed to save preferences." });
    }
  }

  res.setHeader("Allow", ["GET", "POST", "PUT"]);
  return res.status(405).json({ success: false, message: "Method not allowed." });
}
