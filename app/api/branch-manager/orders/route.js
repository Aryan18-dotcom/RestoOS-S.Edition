import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isBranchManagerRole } from "@/lib/roles";
import Order from "@/models/Order";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !isBranchManagerRole(session.role) || !session.branchId || !session.orgId) {
      return NextResponse.json({ error: "Branch Manager access required" }, { status: 403 });
    }
    await connectToDatabase();
    const orders = await Order.find({ orgId: session.orgId, branchId: session.branchId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return NextResponse.json({ orders });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
