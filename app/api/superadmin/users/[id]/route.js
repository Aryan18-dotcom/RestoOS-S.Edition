import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession } from "@/lib/auth";
import User from "@/models/User";

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") throw new Error("UNAUTHORIZED");
}

export async function DELETE(request, { params }) {
  try {
    await requireSuperAdmin();
    await connectToDatabase();
    const { id } = await params;
    const user = await User.findById(id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.role === "SUPERADMIN") {
      return NextResponse.json({ error: "Cannot delete a SuperAdmin account" }, { status: 400 });
    }
    await User.deleteOne({ _id: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.message === "UNAUTHORIZED")
      return NextResponse.json({ error: "SuperAdmin access required" }, { status: 403 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
