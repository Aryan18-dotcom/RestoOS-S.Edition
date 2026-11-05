import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    parentCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

CategorySchema.index({ branchId: 1, sortOrder: 1 });

export default mongoose.models.Category ||
  mongoose.model("Category", CategorySchema);
