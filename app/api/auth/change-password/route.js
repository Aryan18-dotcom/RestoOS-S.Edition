import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectToDatabase from "@/lib/db";
import { COOKIE_NAME, createSessionToken, getSession } from "@/lib/auth";
import User from "@/models/User";

export async function POST(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!session.isTemporaryPass) {
    return NextResponse.json({ error: "Password change is not available for this session" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const loginId = typeof body?.loginId === "string" ? body.loginId.trim() : "";
  if (password.length < 10 || password.length > 128) {
    return NextResponse.json(
      { error: "New password must be between 10 and 128 characters" },
      { status: 400 },
    );
  }
  if (session.role === "OWNER" && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}$/.test(loginId)) {
    return NextResponse.json(
      { error: "New login ID must be 3–40 characters using letters, numbers, dots, underscores, or hyphens" },
      { status: 400 },
    );
  }
  if (session.role === "OWNER" && loginId === session.loginId) {
    return NextResponse.json({ error: "Choose a new login ID instead of keeping the temporary one" }, { status: 400 });
  }

  await connectToDatabase();
  if (session.role === "OWNER" && await User.exists({ loginId, _id: { $ne: session.userId } })) {
    return NextResponse.json({ error: "That login ID is already in use" }, { status: 409 });
  }
  const user = await User.findById(session.userId);
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Account is unavailable" }, { status: 401 });
  }
  if (session.role === "OWNER") user.loginId = loginId;
  user.passwordHash = await bcrypt.hash(password, 12);
  user.isTemporaryPass = false;
  user.sessionVersion += 1;
  try {
    await user.save();
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json({ error: "That login ID is already in use" }, { status: 409 });
    }
    throw error;
  }

  const token = await createSessionToken(user);
  const response = NextResponse.json({ ok: true, role: user.role });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
