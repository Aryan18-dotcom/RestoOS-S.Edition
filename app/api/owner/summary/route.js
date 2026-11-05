import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession, isValidObjectId } from "@/lib/auth";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Branch from "@/models/Branch";
import mongoose from "mongoose";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "OWNER") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }
    await connectToDatabase();

    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId");
    const filter = { orgId: new mongoose.Types.ObjectId(session.orgId) };
    if (branchId) {
      if (!isValidObjectId(branchId)) {
        return NextResponse.json({ error: "Invalid branch ID" }, { status: 400 });
      }
      const branchExists = await Branch.exists({ _id: branchId, orgId: session.orgId });
      if (!branchExists) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
      filter.branchId = new mongoose.Types.ObjectId(branchId);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since = new Date(today);
    since.setDate(since.getDate() - 13);
    const branchIds = await Branch.find({ orgId: session.orgId }).distinct("_id");
    const [result, productCount, managerCount] = await Promise.all([
      Order.aggregate([
        { $match: filter },
        {
          $facet: {
            overall: [
              { $group: { _id: null, orders: { $sum: 1 }, sales: { $sum: "$grandTotal" } } },
            ],
            today: [
              { $match: { createdAt: { $gte: today } } },
              {
                $group: {
                  _id: null,
                  orders: { $sum: 1 },
                  sales: { $sum: "$grandTotal" },
                  cash: { $sum: { $cond: [{ $eq: ["$paymentMode", "CASH"] }, "$grandTotal", 0] } },
                  upi: { $sum: { $cond: [{ $eq: ["$paymentMode", "UPI"] }, "$grandTotal", 0] } },
                },
              },
            ],
            daily: [
              { $match: { createdAt: { $gte: since } } },
              {
                $group: {
                  _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                  orders: { $sum: 1 },
                  sales: { $sum: "$grandTotal" },
                },
              },
              { $sort: { _id: 1 } },
            ],
            byBranch: [
              {
                $group: {
                  _id: "$branchId",
                  orders: { $sum: 1 },
                  sales: { $sum: "$grandTotal" },
                  todaySales: {
                    $sum: { $cond: [{ $gte: ["$createdAt", today] }, "$grandTotal", 0] },
                  },
                },
              },
            ],
          },
        },
      ]),
      Product.countDocuments({
        branchId: branchId ? new mongoose.Types.ObjectId(branchId) : { $in: branchIds },
      }),
      User.countDocuments({
        orgId: session.orgId,
        role: { $in: ["BRANCH_MANAGER", "CAPTAIN"] },
        isActive: true,
        ...(branchId ? { branchId } : {}),
      }),
    ]);

    const facets = result[0] || {};
    const totals = facets.overall?.[0] || {};
    const todayStats = facets.today?.[0] || {};
    const branchRows = await Branch.find({
      orgId: session.orgId,
      ...(branchId ? { _id: branchId } : {}),
    }).select("_id name code").lean();
    const branchStats = new Map((facets.byBranch || []).map((row) => [row._id.toString(), row]));

    return NextResponse.json({
      summary: {
        todayOrders: todayStats.orders || 0,
        todaySales: todayStats.sales || 0,
        todayCash: todayStats.cash || 0,
        todayUpi: todayStats.upi || 0,
        totalOrders: totals.orders || 0,
        totalSales: totals.sales || 0,
        productCount,
        managerCount,
      },
      branches: branchRows.map((branch) => ({
        ...branch,
        ...(branchStats.get(branch._id.toString()) || { orders: 0, sales: 0, todaySales: 0 }),
      })),
      dailySales: (facets.daily || []).map((row) => ({
        date: row._id,
        orders: row.orders,
        sales: row.sales,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
