import mongoose from "mongoose";

const PasswordResetRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },
    status: {
      type: String,
      enum: ["PENDING", "RESOLVED"],
      default: "PENDING",
    },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default mongoose.models.PasswordResetRequest ||
  mongoose.model("PasswordResetRequest", PasswordResetRequestSchema);
