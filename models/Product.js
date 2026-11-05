import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, min: 0, default: null },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ProductSchema.index({ branchId: 1, categoryId: 1 });

export default mongoose.models.Product || mongoose.model("Product", ProductSchema);
