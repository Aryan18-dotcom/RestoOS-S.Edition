import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import User from "@/models/User";

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "SuperAdmin access required" }, { status: 403 });
    }

    const { id } = await params;
    const { password } = await request.json();

    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    await connectToDatabase();
    const hash = await bcrypt.hash(password, 12);
    const user = await User.findByIdAndUpdate(
      id,
      { passwordHash: hash, isTemporaryPass: true, sessionVersion: 0 },
      { new: true }
    );

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({ success: true, loginId: user.loginId });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
