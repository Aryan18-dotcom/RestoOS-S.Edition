import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Category from "@/models/Category";
import Product from "@/models/Product";
import Branch from "@/models/Branch";
import { isBranchManagerRole } from "@/lib/roles";

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
