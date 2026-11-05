import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Branch from "@/models/Branch";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "OWNER") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }
    await connectToDatabase();
    const branches = await Branch.find({ orgId: session.orgId, isActive: true })
      .select("_id name code address")
      .lean();
    return NextResponse.json({ branches });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
