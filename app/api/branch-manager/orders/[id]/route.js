import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession, isValidObjectId } from "@/lib/auth";
import { isBranchManagerRole } from "@/lib/roles";
import Order from "@/models/Order";
import Product from "@/models/Product";

export async function PATCH(request, { params }) {
  try {
    const session = await getSession();
    if (!session || !isBranchManagerRole(session.role) || !session.branchId || !session.orgId) {
      return NextResponse.json({ error: "Branch Manager access required" }, { status: 403 });
    }
    const { id } = await params;
    if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid order update" }, { status: 400 });
    await connectToDatabase();

    const order = await Order.findOne({
      _id: id,
      orgId: session.orgId,
      branchId: session.branchId,
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (body.items !== undefined) {
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
        return NextResponse.json({ error: "An order must contain between 1 and 100 items" }, { status: 400 });
      }
      const quantities = new Map();
      const specialNotes = new Map();
      for (const item of body.items) {
        const quantity = Number(item?.quantity);
        if (
          !isValidObjectId(item?.productId) ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > 999
        ) {
          return NextResponse.json({ error: "Invalid product or quantity" }, { status: 400 });
        }
        if (item.specialNote !== undefined && (typeof item.specialNote !== "string" || item.specialNote.length > 300)) {
          return NextResponse.json({ error: "Item special notes must be 300 characters or fewer" }, { status: 400 });
        }
        const productId = item.productId.toLowerCase();
        if (quantities.has(productId)) return NextResponse.json({ error: "Combine duplicate order items" }, { status: 400 });
        quantities.set(productId, quantity);
        specialNotes.set(productId, String(item.specialNote || "").trim());
      }
      const products = await Product.find({
        _id: { $in: [...quantities.keys()] },
        branchId: session.branchId,
        isAvailable: true,
      }).lean();
      if (products.length !== quantities.size) {
        return NextResponse.json({ error: "One or more menu items are no longer available" }, { status: 400 });
      }
      const compositionUnchanged = order.items.length === quantities.size &&
        order.items.every((item) => quantities.get(item.productId.toString()) === item.quantity);
      if (compositionUnchanged) {
        order.items.forEach((item) => {
          item.specialNote = specialNotes.get(item.productId.toString()) || "";
        });
      } else {
        order.items = products.map((product) => {
          const quantity = quantities.get(product._id.toString());
          return {
            productId: product._id,
            name: product.name,
            quantity,
            unitPrice: product.price,
            specialNote: specialNotes.get(product._id.toString()) || "",
            discountPercent: 0,
            total: Math.round(product.price * quantity * 100) / 100,
          };
        });
        order.subtotal = Math.round(order.items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
        order.discountPercent = 0;
        order.discountAmount = 0;
        order.grandTotal = order.subtotal + order.taxAmount;
      }
    }

    if (body.tableNumber !== undefined) order.tableNumber = String(body.tableNumber).slice(0, 40);
    if (body.notes !== undefined) order.notes = String(body.notes).slice(0, 300);
    if (body.paymentMode !== undefined) {
      if (!["CASH", "UPI"].includes(body.paymentMode)) {
        return NextResponse.json({ error: "Payment mode must be CASH or UPI" }, { status: 400 });
      }
      order.paymentMode = body.paymentMode;
    }

    await order.save();
    return NextResponse.json({ order });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
