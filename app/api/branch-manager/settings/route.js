import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isBranchManagerRole } from "@/lib/roles";
import Branch from "@/models/Branch";

async function getAssignedBranch() {
  const session = await getSession();
  if (!session || !isBranchManagerRole(session.role) || !session.orgId || !session.branchId) {
    return { error: NextResponse.json({ error: "Branch Manager access required" }, { status: 403 }) };
  }
  await connectToDatabase();
  const branch = await Branch.findOne({
    _id: session.branchId,
    orgId: session.orgId,
    isActive: true,
  });
  if (!branch) return { error: NextResponse.json({ error: "Assigned branch is unavailable" }, { status: 403 }) };
  return { branch };
}

export async function GET() {
  try {
    const { branch, error } = await getAssignedBranch();
    if (error) return error;
    return NextResponse.json({
      branch: {
        _id: branch._id,
        name: branch.name,
        code: branch.code,
        address: branch.address,
        upiId: branch.upiId,
        payerName: branch.payerName,
        autoPrintKOT: branch.autoPrintKOT,
        autoPrintBill: branch.autoPrintBill,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { branch, error } = await getAssignedBranch();
    if (error) return error;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
    }

    for (const field of ["upiId", "payerName"]) {
      if (field in body) {
        if (typeof body[field] !== "string" || body[field].length > 120) {
          return NextResponse.json({ error: `${field} must be a string of at most 120 characters` }, { status: 400 });
        }
        branch[field] = body[field].trim();
      }
    }
    for (const field of ["autoPrintKOT", "autoPrintBill"]) {
      if (field in body) {
        if (typeof body[field] !== "boolean") {
          return NextResponse.json({ error: `${field} must be true or false` }, { status: 400 });
        }
        branch[field] = body[field];
      }
    }

    await branch.save();
    return GET();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
