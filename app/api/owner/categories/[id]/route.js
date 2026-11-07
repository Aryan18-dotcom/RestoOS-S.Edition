import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Category from "@/models/Category";
import Product from "@/models/Product";
import Branch from "@/models/Branch";
import { isBranchManagerRole } from "@/lib/roles";
import { ensureCategoryForPath, findEquivalentCategories, getCategoryPath, getOrgBranchIds } from "@/lib/shared-menu";

async function menuSession() {
  const session = await getSession();
  if (!session || (session.role !== "OWNER" && !isBranchManagerRole(session.role))) throw new Error("UNAUTHORIZED");
  return session;
}

export async function PATCH(request, { params }) {
  try {
    const session = await menuSession();
    const { id } = await params;
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    await connectToDatabase();
    const category = await Category.findById(id);
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    const branchQuery = { _id: category.branchId, orgId: session.orgId, isActive: true };
    if (isBranchManagerRole(session.role)) branchQuery._id = session.branchId;
    if (!(await Branch.exists(branchQuery))) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    if (body.syncAll && session.role === "OWNER") {
      const path = await getCategoryPath(id);
      const equivalents = [];
      for (const branchId of await getOrgBranchIds(session.orgId)) {
        equivalents.push(await ensureCategoryForPath(branchId, path));
      }
      const results = await Category.updateMany(
        { _id: { $in: equivalents.map((entry) => entry._id) } },
        { $set: { name } },
      );
      category.name = name;
      return NextResponse.json({ category, syncedBranches: results.modifiedCount });
    }
    category.name = name;
    await category.save();
    return NextResponse.json({ category });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "Owner or Branch Manager access required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await menuSession();
    const { id } = await params;
    await connectToDatabase();
    const category = await Category.findById(id);
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    const branchQuery = { _id: category.branchId, orgId: session.orgId, isActive: true };
    if (isBranchManagerRole(session.role)) branchQuery._id = session.branchId;
    if (!(await Branch.exists(branchQuery))) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    if (new URL(request.url).searchParams.get("syncAll") === "true" && session.role === "OWNER") {
      const path = await getCategoryPath(id);
      const equivalents = await findEquivalentCategories(path, await getOrgBranchIds(session.orgId));
      const ids = equivalents.map((entry) => entry._id);
      if (await Category.exists({ parentCategoryId: { $in: ids } })) {
        return NextResponse.json({ error: "Delete or move this category's subcategories in every branch first" }, { status: 409 });
      }
      if (await Product.exists({ categoryId: { $in: ids } })) {
        return NextResponse.json({ error: "Delete or move this category's menu items in every branch first" }, { status: 409 });
      }
      await Category.deleteMany({ _id: { $in: ids } });
      return NextResponse.json({ success: true });
    }
    if (await Category.exists({ parentCategoryId: id })) {
      return NextResponse.json({ error: "Delete or move this category's subcategories first" }, { status: 409 });
    }
    if (await Product.exists({ categoryId: id })) {
      return NextResponse.json({ error: "Delete or move this category's menu items first" }, { status: 409 });
    }
    await Category.deleteOne({ _id: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "Owner or Branch Manager access required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
