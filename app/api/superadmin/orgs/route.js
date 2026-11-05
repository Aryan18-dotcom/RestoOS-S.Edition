import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Organization from "@/models/Organization";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") throw new Error("UNAUTHORIZED");
}

export async function GET() {
  try {
    await requireSuperAdmin();
    await connectToDatabase();
    const orgs = await Organization.find({}).lean();
    return NextResponse.json({ orgs });
  } catch (err) {
    if (err.message === "UNAUTHORIZED")
      return NextResponse.json({ error: "SuperAdmin access required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireSuperAdmin();
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    await connectToDatabase();
    const org = await Organization.create({ name });
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "restaurant";
    let loginId;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      loginId = `owner-${base}-${randomBytes(3).toString("hex")}`;
      if (!(await User.exists({ loginId }))) break;
      loginId = null;
    }
    if (!loginId) {
      await Organization.deleteOne({ _id: org._id });
      throw new Error("Could not generate a unique owner login ID");
    }

    const password = randomBytes(12).toString("base64url");
    try {
      await User.create({
        orgId: org._id,
        loginId,
        passwordHash: await bcrypt.hash(password, 12),
        role: "OWNER",
        isTemporaryPass: true,
        isActive: true,
        sessionVersion: 0,
      });
    } catch (error) {
      await Organization.deleteOne({ _id: org._id });
      throw error;
    }
    return NextResponse.json({
      org,
      ownerCredentials: { loginId, temporaryPassword: password },
    }, { status: 201 });
  } catch (err) {
    if (err.message === "UNAUTHORIZED")
      return NextResponse.json({ error: "SuperAdmin access required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
