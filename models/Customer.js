import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    whatsappOptIn: { type: Boolean, default: false },
    whatsappOptInAt: { type: Date, default: null },
    whatsappOptOutAt: { type: Date, default: null },
    visitCount: { type: Number, default: 0, min: 0 },
    totalSpend: { type: Number, default: 0, min: 0 },
    averageOrderCost: { type: Number, default: 0, min: 0 },
    lastVisitAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CustomerSchema.index({ orgId: 1, phone: 1 }, { unique: true });

export default mongoose.models.Customer || mongoose.model("Customer", CustomerSchema);
