import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectToDatabase from "@/lib/db";
import { COOKIE_NAME, createSessionToken } from "@/lib/auth";
import User from "@/models/User";
import { displayRole } from "@/lib/roles";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const loginId = typeof body?.loginId === "string" ? body.loginId.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!loginId || !password) {
    return NextResponse.json({ error: "Login ID and password are required" }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const user = await User.findOne({ loginId }).select("+passwordHash");
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid login ID or password" }, { status: 401 });
    }

    const token = await createSessionToken(user);
    const response = NextResponse.json({
      role: displayRole(user.role),
      isTemporaryPass: user.isTemporaryPass,
    });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  } catch (error) {
    console.error("Login service failed:", error);
    return NextResponse.json(
      { error: "Sign-in service unavailable. Check MONGODB_URI and JWT_SECRET in .env.local." },
      { status: 503 },
    );
  }
}
