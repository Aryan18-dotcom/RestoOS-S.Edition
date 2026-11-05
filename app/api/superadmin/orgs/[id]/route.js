import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import Organization from "@/models/Organization";

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") throw new Error("UNAUTHORIZED");
}

export async function DELETE(request, { params }) {
  try {
    await requireSuperAdmin();
    await connectToDatabase();
    const { id } = await params;
    await Organization.deleteOne({ _id: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.message === "UNAUTHORIZED")
      return NextResponse.json({ error: "SuperAdmin access required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
