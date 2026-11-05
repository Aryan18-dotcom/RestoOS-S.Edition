import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import User from "@/models/User";
import Organization from "@/models/Organization";
import Branch from "@/models/Branch";
import { isValidObjectId } from "@/lib/auth";

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function GET() {
  try {
    await requireSuperAdmin();
    await connectToDatabase();
    const users = await User.find({}).select("loginId role orgId branchId isActive isTemporaryPass").lean();
    return NextResponse.json({ users });
  } catch (err) {
    if (err.message === "UNAUTHORIZED")
      return NextResponse.json({ error: "SuperAdmin access required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireSuperAdmin();
    const body = await request.json();
    const { loginId, password, role, orgId, branchId } = body;
    if (typeof loginId !== "string" || !loginId.trim() || typeof password !== "string" || !password || !role) {
      return NextResponse.json({ error: "loginId, password and role are required" }, { status: 400 });
    }
    if (!["OWNER", "BRANCH_MANAGER", "SUPERADMIN"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (role !== "SUPERADMIN" && !orgId) {
      return NextResponse.json({ error: "Organization is required" }, { status: 400 });
    }
    if (role !== "SUPERADMIN" && !isValidObjectId(orgId)) {
      return NextResponse.json({ error: "Invalid organization ID" }, { status: 400 });
    }
    if (role === "BRANCH_MANAGER" && !branchId) {
      return NextResponse.json({ error: "Branch is required for a Branch Manager" }, { status: 400 });
    }
    if (role === "BRANCH_MANAGER" && !isValidObjectId(branchId)) {
      return NextResponse.json({ error: "Invalid branch ID" }, { status: 400 });
    }
    await connectToDatabase();
    if (role !== "SUPERADMIN") {
      const organization = await Organization.exists({ _id: orgId });
      if (!organization) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if (role === "BRANCH_MANAGER" && !(await Branch.exists({ _id: branchId, orgId }))) {
      return NextResponse.json({ error: "Branch does not belong to this organization" }, { status: 400 });
    }
    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({
      loginId: loginId.trim(),
      passwordHash: hash,
      role,
      orgId: role === "SUPERADMIN" ? null : orgId,
      branchId: role === "BRANCH_MANAGER" ? branchId : null,
      isTemporaryPass: true,
      isActive: true,
      sessionVersion: 0,
    });
    return NextResponse.json({ user: { _id: user._id, loginId: user.loginId, role: user.role } }, { status: 201 });
  } catch (err) {
    if (err.message === "UNAUTHORIZED")
      return NextResponse.json({ error: "SuperAdmin access required" }, { status: 403 });
    if (err.code === 11000)
      return NextResponse.json({ error: "Login ID already exists" }, { status: 409 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
