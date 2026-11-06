import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Branch from "@/models/Branch";
import Category from "@/models/Category";
import Product from "@/models/Product";
import { copyOrganizationMenuToBranch } from "@/lib/shared-menu";

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") throw new Error("UNAUTHORIZED");
}

export async function GET() {
  try {
    await requireSuperAdmin();
    await connectToDatabase();
    const branches = await Branch.find({}).lean();
    return NextResponse.json({ branches });
  } catch (err) {
    if (err.message === "UNAUTHORIZED")
      return NextResponse.json({ error: "SuperAdmin access required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireSuperAdmin();
    const { orgId, name, code, address } = await request.json();
    if (!orgId || !name || !code)
      return NextResponse.json({ error: "orgId, name and code are required" }, { status: 400 });
    await connectToDatabase();
    const branch = await Branch.create({
      orgId,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      address: address || "",
    });
    try {
      await copyOrganizationMenuToBranch(orgId, branch._id);
    } catch (error) {
      await Promise.all([
        Product.deleteMany({ branchId: branch._id }),
        Category.deleteMany({ branchId: branch._id }),
      ]);
      await Branch.deleteOne({ _id: branch._id });
      throw error;
    }
    return NextResponse.json({ branch }, { status: 201 });
  } catch (err) {
    if (err.message === "UNAUTHORIZED")
      return NextResponse.json({ error: "SuperAdmin access required" }, { status: 403 });
    if (err.code === 11000)
      return NextResponse.json({ error: "Branch code already exists for this org" }, { status: 409 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
