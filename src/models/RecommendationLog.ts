import mongoose, { Schema, type Document, type Model } from "mongoose";

export const RECOMMENDATION_STATUS = {
  SUCCESS: "success",
  FAILED: "failed",
} as const;

export const AI_STATUS = {
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
  UNAVAILABLE: "unavailable",
} as const;

export interface IRecommendationLog extends Document {
  userId?: mongoose.Types.ObjectId | null;
  status: (typeof RECOMMENDATION_STATUS)[keyof typeof RECOMMENDATION_STATUS];
  recommendationCount: number;
  productIds: string[];
  preferences?: Record<string, unknown>;
  processingTimeMs?: number | null;
  aiUsed: boolean;
  aiStatus: (typeof AI_STATUS)[keyof typeof AI_STATUS];
  algorithmVersion: string;
  createdAt: Date;
}

const RecommendationLogSchema = new Schema<IRecommendationLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(RECOMMENDATION_STATUS),
      required: true,
      default: RECOMMENDATION_STATUS.SUCCESS,
      index: true,
    },
    recommendationCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 10,
    },
    productIds: {
      type: [String],
      default: [],
    },
    preferences: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    processingTimeMs: {
      type: Number,
      default: null,
      min: 0,
    },
    aiUsed: {
      type: Boolean,
      required: true,
      default: false,
    },
    aiStatus: {
      type: String,
      enum: Object.values(AI_STATUS),
      required: true,
      default: AI_STATUS.SKIPPED,
    },
    algorithmVersion: {
      type: String,
      trim: true,
      default: "hybrid-v1",
      maxlength: 40,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    collection: "recommendation_logs",
  }
);

RecommendationLogSchema.index({ createdAt: -1 });

const RecommendationLog: Model<IRecommendationLog> =
  (mongoose.models.RecommendationLog as Model<IRecommendationLog>) ||
  mongoose.model<IRecommendationLog>("RecommendationLog", RecommendationLogSchema);

export default RecommendationLog;
