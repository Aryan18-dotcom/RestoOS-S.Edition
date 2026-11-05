import mongoose from "mongoose";

const OrganizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    upiId: { type: String, default: "" },
    upiPayerName: { type: String, default: "" },
    upiCurrency: { type: String, enum: ["INR"], default: "INR" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default mongoose.models.Organization ||
  mongoose.model("Organization", OrganizationSchema);
