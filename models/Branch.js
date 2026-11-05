import mongoose from "mongoose";

const BranchSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    address: { type: String, default: "" },
    gstin: { type: String, default: "" },
    phone: { type: String, default: "" },
    upiId: { type: String, default: "" },
    payerName: { type: String, default: "" },
    autoPrintKOT: { type: Boolean, default: false },
    autoPrintBill: { type: Boolean, default: false },
    lastTokenNumber: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

BranchSchema.index({ orgId: 1, code: 1 }, { unique: true });

export default mongoose.models.Branch || mongoose.model("Branch", BranchSchema);
