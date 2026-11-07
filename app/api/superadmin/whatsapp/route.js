import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { getSession, isValidObjectId } from "@/lib/auth";
import Branch from "@/models/Branch";
import Customer from "@/models/Customer";
import Order from "@/models/Order";

const MAX_CAMPAIGN_RECIPIENTS = 25;

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "SuperAdmin access required" }, { status: 403 });
  }
  return null;
}

async function getRecipients(orgId, branchId) {
  let phones = null;
  if (branchId) {
    phones = await Order.distinct("customerPhone", { orgId, branchId });
    if (!phones.length) return [];
  }
  const customers = await Customer.find({
    orgId,
    whatsappOptIn: true,
    ...(phones ? { phone: { $in: phones } } : {}),
  }).select("name phone").sort({ name: 1 }).lean();
  return customers.filter((customer) => /^\d{10}$/.test(customer.phone));
}

export async function GET(request) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const orgId = url.searchParams.get("orgId");
    const branchId = url.searchParams.get("branchId") || "";
    if (!isValidObjectId(orgId) || (branchId && !isValidObjectId(branchId))) {
      return NextResponse.json({ error: "Select a valid restaurant and branch" }, { status: 400 });
    }

    await connectToDatabase();
    if (branchId && !(await Branch.exists({ _id: branchId, orgId, isActive: true }))) {
      return NextResponse.json({ error: "Branch does not belong to this restaurant" }, { status: 400 });
    }
    const recipients = await getRecipients(orgId, branchId);
    return NextResponse.json({
      recipientCount: recipients.length,
      maxRecipients: MAX_CAMPAIGN_RECIPIENTS,
      providerConfigured: Boolean(
        process.env.META_WHATSAPP_ACCESS_TOKEN &&
        process.env.META_WHATSAPP_PHONE_NUMBER_ID &&
        process.env.META_WHATSAPP_API_VERSION,
      ),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => null);
    const orgId = body?.orgId;
    const branchId = body?.branchId || "";
    const templateName = typeof body?.templateName === "string" ? body.templateName.trim() : "";
    const language = typeof body?.language === "string" ? body.language.trim() : "";
    const parameters = Array.isArray(body?.parameters) ? body.parameters : [];
    if (
      !isValidObjectId(orgId) ||
      (branchId && !isValidObjectId(branchId)) ||
      !/^[a-zA-Z0-9_]{1,512}$/.test(templateName) ||
      !/^[a-zA-Z]{2,3}(?:_[A-Z]{2})?$/.test(language) ||
      parameters.length > 10 ||
      parameters.some((value) => typeof value !== "string" || value.length > 1024)
    ) {
      return NextResponse.json({ error: "Enter a valid restaurant, approved template name, language, and up to 10 body parameters." }, { status: 400 });
    }

    const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.META_WHATSAPP_API_VERSION;
    if (!accessToken || !phoneNumberId || !apiVersion) {
      return NextResponse.json({
        error: "WhatsApp is not configured. Set META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID, and META_WHATSAPP_API_VERSION on the server.",
      }, { status: 503 });
    }
    if (!/^v\d+\.\d+$/.test(apiVersion)) {
      return NextResponse.json({ error: "META_WHATSAPP_API_VERSION must use the format vNN.N." }, { status: 503 });
    }

    await connectToDatabase();
    const branch = branchId
      ? await Branch.findOne({ _id: branchId, orgId, isActive: true }).select("name").lean()
      : null;
    if (branchId && !branch) {
      return NextResponse.json({ error: "Branch does not belong to this restaurant" }, { status: 400 });
    }
    const recipients = await getRecipients(orgId, branchId);
    if (!recipients.length) {
      return NextResponse.json({ error: "No opted-in customers with valid phone numbers were found for this selection." }, { status: 400 });
    }
    if (recipients.length > MAX_CAMPAIGN_RECIPIENTS) {
      return NextResponse.json({
        error: `This campaign has ${recipients.length} opted-in recipients, above the ${MAX_CAMPAIGN_RECIPIENTS}-recipient limit. Narrow the branch selection.`,
      }, { status: 413 });
    }

    const results = [];
    for (let offset = 0; offset < recipients.length; offset += 5) {
      const batch = recipients.slice(offset, offset + 5);
      const batchResults = await Promise.all(batch.map(async (customer) => {
        const values = parameters.map((value) => value
          .replaceAll("{{name}}", customer.name)
          .replaceAll("{{phone}}", customer.phone)
          .replaceAll("{{branch}}", branch?.name || ""));
        const components = values.length
          ? [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }]
          : [];
        try {
          const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(15000),
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: `91${customer.phone}`,
              type: "template",
              template: {
                name: templateName,
                language: { code: language },
                ...(components.length ? { components } : {}),
              },
            }),
          });
          const result = await response.json().catch(() => ({}));
          return {
            name: customer.name,
            success: response.ok,
            error: response.ok ? undefined : (result.error?.message || "WhatsApp provider rejected this message.").slice(0, 300),
          };
        } catch (error) {
          return { name: customer.name, success: false, error: error.message };
        }
      }));
      results.push(...batchResults);
    }

    return NextResponse.json({
      sent: results.filter((result) => result.success).length,
      failed: results.filter((result) => !result.success).length,
      results,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
