import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Product from "@/models/Product";
import Branch from "@/models/Branch";
import { isBranchManagerRole } from "@/lib/roles";
import { ensureCategoryForPath, findEquivalentCategories, getCategoryPath, getOrgBranchIds } from "@/lib/shared-menu";

async function productSession() {
  const session = await getSession();
  if (!session || (session.role !== "OWNER" && !isBranchManagerRole(session.role))) throw new Error("UNAUTHORIZED");
  return session;
}

export async function PATCH(request, { params }) {
  try {
    const session = await productSession();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid product update" }, { status: 400 });
    await connectToDatabase();
    const product = await Product.findById(id);
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const originalName = product.name;
    const originalPrice = product.price;
    const originalAvailability = product.isAvailable;
    const branchQuery = { _id: product.branchId, orgId: session.orgId, isActive: true };
    if (isBranchManagerRole(session.role)) branchQuery._id = session.branchId;
    const branch = await Branch.findOne(branchQuery);
    if (!branch) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    if (body.name != null) {
      if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Product name is required" }, { status: 400 });
      product.name = body.name.trim();
    }
    if (body.price != null) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Price must be a non-negative number" }, { status: 400 });
      product.price = price;
    }
    if (body.costPrice !== undefined) {
      if (session.role !== "OWNER") {
        return NextResponse.json({ error: "Only the Owner can manage menu item cost prices" }, { status: 403 });
      }
      if (body.costPrice === null || body.costPrice === "") {
        product.costPrice = null;
      } else {
        const costPrice = Number(body.costPrice);
        if (!Number.isFinite(costPrice) || costPrice < 0 || costPrice > product.price) {
          return NextResponse.json({ error: "Cost price must be between zero and the menu price" }, { status: 400 });
        }
        product.costPrice = costPrice;
      }
    }
    if (product.costPrice != null && product.costPrice > product.price) {
      return NextResponse.json({ error: "Menu price cannot be lower than the saved cost price" }, { status: 400 });
    }
    if (body.isAvailable != null) product.isAvailable = Boolean(body.isAvailable);
    if (body.syncAll && session.role === "OWNER") {
      const categoryPath = await getCategoryPath(product.categoryId);
      const branchIds = await getOrgBranchIds(session.orgId);
      const equivalentCategories = [];
      for (const branchId of branchIds) {
        equivalentCategories.push(await ensureCategoryForPath(branchId, categoryPath));
      }
      const categoryIds = equivalentCategories.map((entry) => entry._id);
      let matchingProducts = await Product.find({
        branchId: { $in: branchIds },
        categoryId: { $in: categoryIds },
      });
      const siblings = matchingProducts.filter((entry) =>
        entry.name.trim().toLowerCase() === originalName.trim().toLowerCase(),
      );
      if (body.price != null && siblings.some((entry) => entry.costPrice != null && entry.costPrice > product.price)) {
        return NextResponse.json({ error: "The new menu price cannot be lower than the cost price set in another branch." }, { status: 400 });
      }
      for (const category of equivalentCategories) {
        const counterpartExists = siblings.some((entry) => entry.branchId.toString() === category.branchId.toString());
        if (!counterpartExists) {
          const counterpart = await Product.create({
            branchId: category.branchId,
            categoryId: category._id,
            name: originalName,
            price: originalPrice,
            costPrice: null,
            isAvailable: originalAvailability,
          });
          matchingProducts.push(counterpart);
        }
      }
      const allSiblings = matchingProducts.filter((entry) =>
        entry.name.trim().toLowerCase() === originalName.trim().toLowerCase(),
      );
      for (const sibling of allSiblings) {
        if (body.name != null) sibling.name = product.name;
        if (body.price != null) sibling.price = product.price;
        if (body.isAvailable != null) sibling.isAvailable = product.isAvailable;
        if (sibling._id.toString() === product._id.toString() && body.costPrice !== undefined) {
          sibling.costPrice = product.costPrice;
        }
        await sibling.save();
      }
      const updatedSource = allSiblings.find((entry) => entry._id.toString() === product._id.toString()) || product;
      const responseProduct = updatedSource.toObject();
      return NextResponse.json({ product: responseProduct, syncedBranches: allSiblings.length });
    }
    await product.save();
    const responseProduct = product.toObject();
    if (isBranchManagerRole(session.role)) delete responseProduct.costPrice;
    return NextResponse.json({ product: responseProduct });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "Owner or Branch Manager access required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await productSession();
    const { id } = await params;
    await connectToDatabase();
    const product = await Product.findById(id);
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const branchQuery = { _id: product.branchId, orgId: session.orgId };
    if (isBranchManagerRole(session.role)) branchQuery._id = session.branchId;
    const branch = await Branch.findOne(branchQuery);
    if (!branch) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    if (new URL(request.url).searchParams.get("syncAll") === "true" && session.role === "OWNER") {
      const categoryPath = await getCategoryPath(product.categoryId);
      const branchIds = await getOrgBranchIds(session.orgId);
      const equivalents = await findEquivalentCategories(categoryPath, branchIds);
      const categoryIds = equivalents.map((entry) => entry._id);
      const candidates = await Product.find({
        branchId: { $in: branchIds },
        categoryId: { $in: categoryIds },
      }).select("_id name").lean();
      const ids = candidates
        .filter((entry) => entry.name.trim().toLowerCase() === product.name.trim().toLowerCase())
        .map((entry) => entry._id);
      await Product.deleteMany({ _id: { $in: ids } });
      return NextResponse.json({ success: true, syncedBranches: ids.length });
    }
    await Product.deleteOne({ _id: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "Owner or Branch Manager access required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
