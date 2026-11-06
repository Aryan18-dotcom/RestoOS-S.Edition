import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Product from "@/models/Product";
import Branch from "@/models/Branch";
import Category from "@/models/Category";
import { isBranchManagerRole } from "@/lib/roles";
import { ensureCategoryForPath, getCategoryPath, getOrgBranchIds } from "@/lib/shared-menu";

async function menuSession() {
  const session = await getSession();
  if (!session || (session.role !== "OWNER" && !isBranchManagerRole(session.role))) throw new Error("UNAUTHORIZED");
  return session;
}

export async function GET() {
  try {
    const session = await menuSession();
    await connectToDatabase();
    const branches = isBranchManagerRole(session.role)
      ? await Branch.find({ _id: session.branchId, orgId: session.orgId, isActive: true }).select("_id").lean()
      : await Branch.find({ orgId: session.orgId }).select("_id").lean();
    const branchIds = branches.map(b => b._id);
    const projection = session.role === "OWNER"
      ? "branchId categoryId name price costPrice isAvailable"
      : "branchId categoryId name price isAvailable";
    const products = await Product.find({ branchId: { $in: branchIds } })
      .select(projection)
      .populate("branchId", "name")
      .sort({ name: 1 }).lean();
    return NextResponse.json({ products });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await menuSession();
    const { branchId, categoryId, name, price, costPrice, syncAll } = await request.json();
    if (!branchId || !categoryId || !name || price == null)
      return NextResponse.json({ error: "branchId, categoryId, name and price required" }, { status: 400 });
    await connectToDatabase();
    const branchQuery = { _id: branchId, orgId: session.orgId, isActive: true };
    if (isBranchManagerRole(session.role)) branchQuery._id = session.branchId;
    const branch = await Branch.findOne(branchQuery);
    if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    if (isBranchManagerRole(session.role) && branch._id.toString() !== session.branchId) {
      return NextResponse.json({ error: "Not authorized for this branch" }, { status: 403 });
    }
    if (!(await Category.exists({ _id: categoryId, branchId }))) {
      return NextResponse.json({ error: "Category does not belong to this branch" }, { status: 400 });
    }
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return NextResponse.json({ error: "Price must be a non-negative number" }, { status: 400 });
    }
    let numericCost = null;
    if (session.role === "OWNER" && costPrice !== "" && costPrice != null) {
      numericCost = Number(costPrice);
      if (!Number.isFinite(numericCost) || numericCost < 0 || numericCost > numericPrice) {
        return NextResponse.json({ error: "Cost price must be between zero and the menu price" }, { status: 400 });
      }
    }
    if (syncAll && session.role === "OWNER") {
      const categoryPath = await getCategoryPath(categoryId);
      const branchIds = await getOrgBranchIds(session.orgId);
      const targetCategories = [];
      for (const targetBranchId of branchIds) {
        targetCategories.push(await ensureCategoryForPath(targetBranchId, categoryPath));
      }
      const existingByCategory = [];
      for (const targetCategory of targetCategories) {
        const matchingProducts = await Product.find({
          branchId: targetCategory.branchId,
          categoryId: targetCategory._id,
        }).lean();
        const existing = matchingProducts.find((item) => item.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (existing && existing.costPrice != null && existing.costPrice > numericPrice) {
          return NextResponse.json({ error: `Price for ${existing.name} cannot be lower than its cost price in one of the branches.` }, { status: 400 });
        }
        existingByCategory.push(existing || null);
      }
      let sourceProduct = null;
      for (let index = 0; index < branchIds.length; index += 1) {
        const targetBranchId = branchIds[index];
        const targetCategory = targetCategories[index];
        const existing = existingByCategory[index];
        const product = existing
          ? await Product.findByIdAndUpdate(existing._id, { $set: { name: name.trim(), price: numericPrice, isAvailable: true } }, { new: true })
          : await Product.create({
            branchId: targetBranchId,
            categoryId: targetCategory._id,
            name: name.trim(),
            price: numericPrice,
            costPrice: targetBranchId.toString() === branch._id.toString() ? numericCost : null,
            isAvailable: true,
          });
        if (targetBranchId.toString() === branch._id.toString()) sourceProduct = product;
      }
      return NextResponse.json({ product: sourceProduct, syncedBranches: branchIds.length }, { status: 201 });
    }
    const product = await Product.create({
      branchId,
      categoryId,
      name: name.trim(),
      price: numericPrice,
      costPrice: numericCost,
      isAvailable: true,
    });
    const responseProduct = product.toObject();
    if (isBranchManagerRole(session.role)) delete responseProduct.costPrice;
    return NextResponse.json({ product: responseProduct }, { status: 201 });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
