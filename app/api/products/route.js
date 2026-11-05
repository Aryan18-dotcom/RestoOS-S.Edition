import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Branch from "@/models/Branch";
import Product from "@/models/Product";
import { isBranchManagerRole } from "@/lib/roles";

export async function GET() {
  const session = await getSession();
  if (!session || !isBranchManagerRole(session.role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!session.branchId) {
    return NextResponse.json({ error: "A branch must be assigned" }, { status: 400 });
  }

  await connectToDatabase();
  const branch = await Branch.findOne({
    _id: session.branchId,
    orgId: session.orgId,
    isActive: true,
  }).select("_id");
  if (!branch) {
    return NextResponse.json({ error: "Assigned branch is unavailable" }, { status: 403 });
  }

  const products = await Product.find({
    branchId: session.branchId,
    isAvailable: true,
  })
    .select("name price costPrice categoryId")
    .populate({
      path: "categoryId",
      select: "name parentCategoryId",
      populate: { path: "parentCategoryId", select: "name" },
    })
    .sort({ name: 1 })
    .lean();

  return NextResponse.json({
    products: products.map((product) => ({
      id: product._id.toString(),
      name: product.name,
      price: product.price,
      categoryId: product.categoryId._id.toString(),
      categoryName: product.categoryId.name,
      parentCategoryName: product.categoryId.parentCategoryId?.name || "",
      maxDiscountPercent: product.costPrice == null || product.price <= 0
        ? 0
        : Math.max(0, Math.floor(((product.price - product.costPrice) / product.price) * 100)),
    })),
  });
}
