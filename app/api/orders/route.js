import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectToDatabase from "@/lib/db";
import { getSession, isValidObjectId } from "@/lib/auth";
import Branch from "@/models/Branch";
import Customer from "@/models/Customer";
import Organization from "@/models/Organization";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { isBranchManagerRole } from "@/lib/roles";

const roundMoney = (value) => Math.round(value * 100) / 100;

export async function POST(request) {
  const session = await getSession();
  if (!session || !isBranchManagerRole(session.role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!session.branchId || !session.orgId) {
    return NextResponse.json({ error: "Organization and branch assignment required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const sourceItems = body?.items;
  const paymentMode = body?.paymentMode;
  const customerName = typeof body?.customerName === "string" ? body.customerName.trim() : "";
  const customerPhone = typeof body?.customerPhone === "string"
    ? body.customerPhone.replace(/\D/g, "")
    : "";
  const discountPercent = Number(body?.discountPercent || 0);
  if (
    !Array.isArray(sourceItems) ||
    sourceItems.length < 1 ||
    sourceItems.length > 100 ||
    !["CASH", "UPI"].includes(paymentMode)
  ) {
    return NextResponse.json({ error: "Invalid order details" }, { status: 400 });
  }
  if (customerName.length < 2 || customerName.length > 80 || !/^\d{10}$/.test(customerPhone)) {
    return NextResponse.json({ error: "Customer name and a valid 10-digit mobile number are required." }, { status: 400 });
  }
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return NextResponse.json({ error: "Invalid discount" }, { status: 400 });
  }

  const quantities = new Map();
  for (const item of sourceItems) {
    const quantity = Number(item?.quantity);
    if (
      !isValidObjectId(item?.productId) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 999
    ) {
      return NextResponse.json({ error: "Invalid item or quantity" }, { status: 400 });
    }
    if (item.specialNote !== undefined && (typeof item.specialNote !== "string" || item.specialNote.length > 300)) {
      return NextResponse.json({ error: "Item special notes must be 300 characters or fewer" }, { status: 400 });
    }
    const productId = item.productId.toLowerCase();
    if (quantities.has(productId)) {
      return NextResponse.json({ error: "Duplicate products must be combined into one line" }, { status: 400 });
    }
    quantities.set(productId, quantity);
  }

  await connectToDatabase();
  const [branch, organization] = await Promise.all([
    Branch.findOne({
      _id: session.branchId,
      orgId: session.orgId,
      isActive: true,
    }).lean(),
    Organization.findById(session.orgId)
      .select("upiId upiPayerName upiCurrency")
      .lean(),
  ]);
  if (!branch) {
    return NextResponse.json({ error: "Assigned branch is unavailable" }, { status: 403 });
  }
  if (!organization) {
    return NextResponse.json({ error: "Restaurant configuration is unavailable" }, { status: 404 });
  }

  const paymentSettings = {
    upiId: organization.upiId || "",
    upiPayerName: organization.upiPayerName || "",
    upiCurrency: organization.upiCurrency || "INR",
  };
  const upiConfigured = Boolean(paymentSettings.upiId && paymentSettings.upiPayerName);
  if (!upiConfigured && body?.confirmNoUpi !== true) {
    return NextResponse.json({
      error: "Owner has not configured UPI payment details.",
      requiresUpiConfirmation: true,
    }, { status: 409 });
  }

  const products = await Product.find({
    _id: { $in: [...quantities.keys()] },
    branchId: session.branchId,
    isAvailable: true,
  }).lean();
  if (products.length !== quantities.size) {
    return NextResponse.json({ error: "One or more items are unavailable" }, { status: 400 });
  }

  if (discountPercent > 0) {
    const belowCost = products.find((product) => {
      if (product.costPrice == null) return true;
      return product.price * (1 - discountPercent / 100) < product.costPrice - 0.000001;
    });
    if (belowCost) {
      return NextResponse.json({
        error: `Discount exceeds the safe cost-price limit for ${belowCost.name}.`,
      }, { status: 400 });
    }
  }

  const items = products.map((product) => {
    const quantity = quantities.get(product._id.toString());
    const gross = product.price * quantity;
    const lineTotal = roundMoney(gross * (1 - discountPercent / 100));
    return {
      productId: product._id,
      name: product.name,
      quantity,
      unitPrice: product.price,
      specialNote: String(sourceItems.find((item) => item.productId.toLowerCase() === product._id.toString())?.specialNote || "").trim(),
      discountPercent,
      total: lineTotal,
    };
  });
  const subtotal = roundMoney(products.reduce(
    (sum, product) => sum + product.price * quantities.get(product._id.toString()),
    0,
  ));
  const grandTotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  const discountAmount = roundMoney(subtotal - grandTotal);
  const databaseSession = await mongoose.startSession();
  let order;
  let tokenNumber;
  try {
    await databaseSession.withTransaction(async () => {
      const branchFilter = { _id: session.branchId, orgId: session.orgId };
      let counter = await Branch.findOneAndUpdate(
        branchFilter,
        { $inc: { lastTokenNumber: 1 } },
        { new: true, session: databaseSession },
      ).select("lastTokenNumber").lean();
      if (!counter) throw new Error("Assigned branch is unavailable");
      tokenNumber = counter.lastTokenNumber;

      while (await Order.exists({ branchId: session.branchId, tokenNumber }).session(databaseSession)) {
        counter = await Branch.findOneAndUpdate(
          branchFilter,
          { $inc: { lastTokenNumber: 1 } },
          { new: true, session: databaseSession },
        ).select("lastTokenNumber").lean();
        if (!counter) throw new Error("Assigned branch is unavailable");
        tokenNumber = counter.lastTokenNumber;
      }

      [order] = await Order.create(
        [{
          orgId: session.orgId,
          branchId: session.branchId,
          userId: session.userId,
          tokenNumber,
          customerName,
          customerPhone,
          items,
          subtotal,
          discountPercent,
          discountAmount,
          taxAmount: 0,
          grandTotal,
          status: "SETTLED",
          paymentMode,
          notes: String(body?.notes || "").slice(0, 300),
        }],
        { session: databaseSession },
      );

      const oldVisits = { $ifNull: ["$visitCount", 0] };
      const newVisits = { $add: [oldVisits, 1] };
      const newSpend = { $add: [{ $ifNull: ["$totalSpend", 0] }, grandTotal] };
      await Customer.updateOne(
        { orgId: session.orgId, phone: customerPhone },
        [{
          $set: {
            orgId: { $literal: new mongoose.Types.ObjectId(session.orgId) },
            phone: { $literal: customerPhone },
            name: { $literal: customerName },
            visitCount: newVisits,
            totalSpend: newSpend,
            averageOrderCost: { $divide: [newSpend, newVisits] },
            lastVisitAt: { $literal: new Date() },
          },
        }],
        { upsert: true, session: databaseSession },
      );
    });
  } finally {
    await databaseSession.endSession();
  }

  return NextResponse.json(
    {
      order: {
        id: order._id.toString(),
        tokenNumber: order.tokenNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        notes: order.notes,
        items: order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          specialNote: item.specialNote,
          discountPercent: item.discountPercent,
          total: item.total,
        })),
        subtotal: order.subtotal,
        discountPercent: order.discountPercent,
        discountAmount: order.discountAmount,
        taxAmount: order.taxAmount,
        grandTotal: order.grandTotal,
        paymentMode: order.paymentMode,
        createdAt: order.createdAt,
      },
      branch: {
        name: branch.name,
        address: branch.address,
        gstin: branch.gstin,
        autoPrintKOT: branch.autoPrintKOT,
        autoPrintBill: branch.autoPrintBill,
        paymentSettings,
      },
    },
    { status: 201 },
  );
}
