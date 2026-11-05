import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Product from "@/models/Product";
import Branch from "@/models/Branch";
import Category from "@/models/Category";
import { isBranchManagerRole } from "@/lib/roles";

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
    const { branchId, categoryId, name, price, costPrice } = await request.json();
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
