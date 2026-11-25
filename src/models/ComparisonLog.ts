import mongoose, { Schema, type Document, type Model } from "mongoose";

export const COMPARISON_STATUS = {
  SUCCESS: "success",
  FAILED: "failed",
} as const;

export const COMPARISON_AI_STATUS = {
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
  UNAVAILABLE: "unavailable",
} as const;

export interface IComparisonLog extends Document {
  userId?: mongoose.Types.ObjectId | null;
  status: (typeof COMPARISON_STATUS)[keyof typeof COMPARISON_STATUS];
  productCount: number;
  productIds: string[];
  processingTimeMs?: number | null;
  aiUsed: boolean;
  aiStatus: (typeof COMPARISON_AI_STATUS)[keyof typeof COMPARISON_AI_STATUS];
  algorithmVersion: string;
  createdAt: Date;
}

const ComparisonLogSchema = new Schema<IComparisonLog>(
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
      enum: Object.values(COMPARISON_STATUS),
      required: true,
      default: COMPARISON_STATUS.SUCCESS,
      index: true,
    },
    productCount: {
      type: Number,
      required: true,
      min: 2,
      max: 4,
    },
    productIds: {
      type: [String],
      required: true,
      default: [],
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
      enum: Object.values(COMPARISON_AI_STATUS),
      required: true,
      default: COMPARISON_AI_STATUS.SKIPPED,
    },
    algorithmVersion: {
      type: String,
      trim: true,
      default: "comparison-v1",
      maxlength: 40,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    collection: "comparison_logs",
  }
);

ComparisonLogSchema.index({ createdAt: -1 });

const ComparisonLog: Model<IComparisonLog> =
  (mongoose.models.ComparisonLog as Model<IComparisonLog>) ||
  mongoose.model<IComparisonLog>("ComparisonLog", ComparisonLogSchema);

export default ComparisonLog;
