import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Category from "@/models/Category";
import Branch from "@/models/Branch";
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
    const categories = await Category.find({ branchId: { $in: branchIds } })
      .populate("branchId", "name")
      .populate("parentCategoryId", "name")
      .sort({ sortOrder: 1, name: 1 }).lean();
    return NextResponse.json({ categories });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await menuSession();
    const isOwner = session.role === "OWNER";
    if (!isOwner && !isBranchManagerRole(session.role)) {
      return NextResponse.json({ error: "Menu management access required" }, { status: 403 });
    }
    const { branchId, name, parentCategoryId } = await request.json();
    if (!branchId || !name) return NextResponse.json({ error: "branchId and name required" }, { status: 400 });
    await connectToDatabase();
    const branch = await Branch.findOne({ _id: branchId, orgId: session.orgId, isActive: true });
    if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    if (!isOwner && branch._id.toString() !== session.branchId) {
      return NextResponse.json({ error: "Not authorized for this branch" }, { status: 403 });
    }
    let parent = null;
    if (parentCategoryId) {
      parent = await Category.findOne({
        _id: parentCategoryId,
        branchId,
        parentCategoryId: null,
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent category not found or is not a top-level category" }, { status: 400 });
      }
    }
    const category = await Category.create({
      branchId,
      name: name.trim(),
      parentCategoryId: parent?._id || null,
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
