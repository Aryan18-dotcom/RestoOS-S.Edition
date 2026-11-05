import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isBranchManagerRole } from "@/lib/roles";

const COOKIE_NAME = process.env.JWT_COOKIE_NAME || "restaurant_session";

export async function middleware(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.next();

  let payload;
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error("JWT_SECRET must be set to at least 32 characters");
    }
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(secret)));
  } catch {
    const response = NextResponse.next();
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  const { pathname } = request.nextUrl;

  // SUPERADMIN: unrestricted access everywhere
  if (payload.role === "SUPERADMIN") {
    return NextResponse.next();
  }

  const allowedForTemporary = [
    "/force-password-change",
    "/api/auth/change-password",
    "/api/auth/logout",
    "/api/session",
  ];

  // Block temporary-password users from everything except allowed paths
  if (payload.isTemporaryPass && !allowedForTemporary.includes(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Password change required" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/force-password-change", request.url));
  }

  // Redirect away from force-password-change if password is already set
  if (!payload.isTemporaryPass && pathname === "/force-password-change") {
    const dest = payload.role === "OWNER"
      ? "/owner"
      : isBranchManagerRole(payload.role) ? "/branch-manager" : "/";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // OWNER: redirect to /owner if they land on /
  if (!payload.isTemporaryPass && payload.role === "OWNER" && pathname === "/") {
    return NextResponse.redirect(new URL("/owner", request.url));
  }

  if (isBranchManagerRole(payload.role)) {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/branch-manager", request.url));
    }
    if (pathname.startsWith("/owner") || pathname.startsWith("/superadmin")) {
      return NextResponse.redirect(new URL("/branch-manager", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
