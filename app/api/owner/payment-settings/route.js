import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession, isValidObjectId } from "@/lib/auth";
import Branch from "@/models/Branch";
import { migrateLegacyUpiSettings } from "@/lib/branch-payment-settings";

function isValidUpiId(value) {
  return /^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/.test(value);
}

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "OWNER") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }
    await connectToDatabase();
    await migrateLegacyUpiSettings(session.orgId);
    const branchId = new URL(request.url).searchParams.get("branchId");
    if (!isValidObjectId(branchId)) return NextResponse.json({ error: "A valid branch is required" }, { status: 400 });
    const branch = await Branch.findOne({ _id: branchId, orgId: session.orgId, isActive: true })
      .select("upiId payerName")
      .lean();
    if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    return NextResponse.json({
      paymentSettings: {
        branchId,
        upiId: branch.upiId || "",
        upiPayerName: branch.payerName || "",
        upiCurrency: "INR",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "OWNER") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }
    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body.branchId !== "string" ||
      !isValidObjectId(body.branchId) ||
      typeof body.upiId !== "string" ||
      typeof body.upiPayerName !== "string" ||
      body.upiId.length > 130 ||
      body.upiPayerName.length > 80 ||
      (body.upiCurrency != null && body.upiCurrency !== "INR")
    ) {
      return NextResponse.json({ error: "Enter a valid UPI ID and payer name. UPI currency must be INR." }, { status: 400 });
    }

    const upiId = body.upiId.trim();
    const upiPayerName = body.upiPayerName.trim();
    if ((upiId || upiPayerName) && (!isValidUpiId(upiId) || !upiPayerName)) {
      return NextResponse.json({ error: "A valid UPI ID and payer name are both required to enable payment QR codes." }, { status: 400 });
    }

    await connectToDatabase();
    await migrateLegacyUpiSettings(session.orgId);
    const branch = await Branch.findOneAndUpdate(
      { _id: body.branchId, orgId: session.orgId, isActive: true },
      { $set: { upiId, payerName: upiPayerName } },
      { new: true, runValidators: true },
    ).select("upiId payerName");
    if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    return NextResponse.json({
      paymentSettings: {
        branchId: body.branchId,
        upiId: branch.upiId,
        upiPayerName: branch.payerName,
        upiCurrency: "INR",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
