import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Branch from "@/models/Branch";
import Organization from "@/models/Organization";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let branch = null;
  let paymentSettings = { upiId: "", upiPayerName: "", upiCurrency: "INR" };
  if (session.orgId && (session.role === "OWNER" || session.role === "BRANCH_MANAGER" || session.role === "CAPTAIN")) {
    await connectToDatabase();
    const organization = await Organization.findById(session.orgId)
      .select("upiId upiPayerName upiCurrency")
      .lean();
    if (organization) {
      paymentSettings = {
        upiId: organization.upiId || "",
        upiPayerName: organization.upiPayerName || "",
        upiCurrency: organization.upiCurrency || "INR",
      };
    }
  }
  if (session.branchId) {
    await connectToDatabase();
    branch = await Branch.findOne({
      _id: session.branchId,
      orgId: session.orgId,
      isActive: true,
    })
      .select("name code address gstin autoPrintKOT autoPrintBill")
      .lean();
  }

  return NextResponse.json({
    user: {
      loginId: session.loginId,
      role: session.role,
      orgId: session.orgId,
      branchId: session.branchId,
    },
    branch,
    paymentSettings,
  });
}
