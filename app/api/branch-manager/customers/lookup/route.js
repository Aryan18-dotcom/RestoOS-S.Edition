import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isBranchManagerRole } from "@/lib/roles";
import Customer from "@/models/Customer";
import Branch from "@/models/Branch";

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session || !isBranchManagerRole(session.role) || !session.orgId) {
      return NextResponse.json({ error: "Branch Manager access required" }, { status: 403 });
    }
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const phone = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
    if (name.length < 2 || name.length > 80 || !/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: "Enter a customer name and a valid 10-digit mobile number." }, { status: 400 });
    }
    await connectToDatabase();
    const branch = await Branch.exists({
      _id: session.branchId,
      orgId: session.orgId,
      isActive: true,
    });
    if (!branch) return NextResponse.json({ error: "Assigned branch is unavailable" }, { status: 403 });
    const customer = await Customer.findOne({ orgId: session.orgId, phone })
      .select("name phone visitCount totalSpend averageOrderCost lastVisitAt")
      .lean();
    if (!customer) {
      return NextResponse.json({
        customer: {
          name,
          phone,
          visitCount: 0,
          averageOrderCost: 0,
          isRegular: false,
          suggestedDiscountPercent: 0,
        },
      });
    }
    return NextResponse.json({
      customer: {
        name: customer.name,
        phone: customer.phone,
        visitCount: customer.visitCount,
        averageOrderCost: customer.averageOrderCost,
        lastVisitAt: customer.lastVisitAt,
        isRegular: customer.visitCount >= 3,
        suggestedDiscountPercent: customer.visitCount >= 3 ? 5 : 0,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
