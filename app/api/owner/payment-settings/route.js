import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Organization from "@/models/Organization";

function isValidUpiId(value) {
  return /^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/.test(value);
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "OWNER") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }
    await connectToDatabase();
    const organization = await Organization.findById(session.orgId)
      .select("upiId upiPayerName upiCurrency")
      .lean();
    if (!organization) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    return NextResponse.json({
      paymentSettings: {
        upiId: organization.upiId || "",
        upiPayerName: organization.upiPayerName || "",
        upiCurrency: organization.upiCurrency || "INR",
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
    const organization = await Organization.findByIdAndUpdate(
      session.orgId,
      { $set: { upiId, upiPayerName, upiCurrency: "INR" } },
      { new: true, runValidators: true },
    ).select("upiId upiPayerName upiCurrency");
    if (!organization) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    return NextResponse.json({
      paymentSettings: {
        upiId: organization.upiId,
        upiPayerName: organization.upiPayerName,
        upiCurrency: organization.upiCurrency,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
