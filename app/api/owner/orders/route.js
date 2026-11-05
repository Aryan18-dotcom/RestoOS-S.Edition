import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Order from "@/models/Order";
import Branch from "@/models/Branch";
import { isValidObjectId } from "@/lib/auth";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "OWNER") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }
    await connectToDatabase();
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId");
    const rawSkip = url.searchParams.get("skip") || "0";
    const rawLimit = url.searchParams.get("limit") || "50";
    const skip = Number(rawSkip);
    const limit = Number(rawLimit);
    if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return NextResponse.json({ error: "Invalid pagination values" }, { status: 400 });
    }
    if (branchId && !isValidObjectId(branchId)) {
      return NextResponse.json({ error: "Invalid branch ID" }, { status: 400 });
    }
    if (branchId && !(await Branch.exists({ _id: branchId, orgId: session.orgId }))) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }
    const orders = await Order.find({
      orgId: session.orgId,
      ...(branchId ? { branchId } : {}),
    })
      .populate("branchId", "name code")
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit + 1)
    .lean();
    const hasMore = orders.length > limit;
    if (hasMore) orders.pop();
    return NextResponse.json({ orders, hasMore });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
