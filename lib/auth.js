import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import connectToDatabase from "@/lib/db";
import User from "@/models/User";

export const COOKIE_NAME = process.env.JWT_COOKIE_NAME || "restaurant_session";

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user) {
  return new SignJWT({
    userId: user._id.toString(),
    loginId: user.loginId,
    role: user.role,
    orgId: user.orgId?.toString() || null,
    branchId: user.branchId?.toString() || null,
    isTemporaryPass: user.isTemporaryPass,
    sessionVersion: user.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secretKey());
}

export async function verifySessionToken(token) {
  const { payload } = await jwtVerify(token, secretKey());
  return payload;
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let payload;
  try {
    payload = await verifySessionToken(token);
  } catch {
    return null;
  }

  await connectToDatabase();
  const user = await User.findById(payload.userId)
    .select("isActive isTemporaryPass sessionVersion role orgId branchId")
    .lean();
  if (
    !user ||
    !user.isActive ||
    user.sessionVersion !== payload.sessionVersion ||
    user.isTemporaryPass !== payload.isTemporaryPass
  ) {
    return null;
  }
  return payload;
}

export function isValidObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ""));
}
