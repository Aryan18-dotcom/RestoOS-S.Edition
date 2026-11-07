import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Branch from "@/models/Branch";
import { migrateLegacyUpiSettings } from "@/lib/branch-payment-settings";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let branch = null;
  let paymentSettings = { upiId: "", upiPayerName: "", upiCurrency: "INR" };
  if (session.orgId && (session.role === "OWNER" || session.role === "BRANCH_MANAGER" || session.role === "CAPTAIN")) {
    await connectToDatabase();
    await migrateLegacyUpiSettings(session.orgId);
  }
  if (session.branchId) {
    await connectToDatabase();
    branch = await Branch.findOne({
      _id: session.branchId,
      orgId: session.orgId,
      isActive: true,
    })
      .select("name code address gstin upiId payerName autoPrintKOT autoPrintBill")
      .lean();
    if (branch) {
      paymentSettings = {
        upiId: branch.upiId || "",
        upiPayerName: branch.payerName || "",
        upiCurrency: "INR",
      };
    }
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
