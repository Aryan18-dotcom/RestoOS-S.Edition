import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tokenNumber: { type: Number, required: true },
    tableNumber: { type: String, default: "" },
    customerName: { type: String, default: "" },
    customerPhone: { type: String, default: "" },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        specialNote: { type: String, default: "", maxlength: 300 },
        discountPercent: { type: Number, default: 0, min: 0, max: 100 },
        total: { type: Number, required: true, min: 0 },
      },
    ],
    subtotal: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["PENDING", "SETTLED", "CANCELLED"],
      default: "SETTLED",
    },
    paymentMode: { type: String, enum: ["UPI", "CASH"], required: true },
    notes: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

OrderSchema.index({ branchId: 1, createdAt: -1 });
OrderSchema.index({ branchId: 1, tokenNumber: 1 }, { unique: true });

export default mongoose.models.Order || mongoose.model("Order", OrderSchema);
