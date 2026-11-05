import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    loginId: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["SUPERADMIN", "OWNER", "BRANCH_MANAGER", "CAPTAIN"],
      required: true,
    },
    isTemporaryPass: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.models.User || mongoose.model("User", UserSchema);
