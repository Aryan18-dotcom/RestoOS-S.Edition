import { formatTokenNumber } from "@/lib/order-token";

const ESC = 0x1b;
const GS = 0x1d;

function textBytes(value) {
  return new TextEncoder().encode(String(value));
}

function joinBytes(...parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function command(...bytes) {
  return new Uint8Array(bytes);
}

function formatMoney(value) {
  return `Rs ${Number(value).toFixed(2)}`;
}

function qrCodeCommand(value) {
  const data = textBytes(value);
  const storeLength = data.length + 3;
  const pL = storeLength % 256;
  const pH = Math.floor(storeLength / 256);
  return joinBytes(
    command(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00),
    command(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06),
    command(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30),
    data,
    command(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30),
  );
}

function commonOrderLines(order) {
  const itemLines = order.items.map(
    (item) => [
      `${item.quantity} x ${item.name}  ${formatMoney(item.total)}`,
      item.specialNote ? `  Note: ${item.specialNote}` : "",
    ].filter(Boolean).join("\n"),
  );
  return itemLines;
}

export function buildCounterBill({ branch, order }) {
  const paymentSettings = branch.paymentSettings || {};
  const upiUri = paymentSettings.upiId && paymentSettings.upiPayerName
    ? `upi://pay?pa=${encodeURIComponent(paymentSettings.upiId)}&pn=${encodeURIComponent(
        paymentSettings.upiPayerName,
      )}&am=${Number(order.grandTotal).toFixed(2)}&cu=${paymentSettings.upiCurrency || "INR"}&tn=Order_${formatTokenNumber(order.tokenNumber)}`
    : "";
  const header = [
    branch.name || "Restaurant",
    branch.address || "",
    branch.gstin ? `GSTIN: ${branch.gstin}` : "",
    "TAX INVOICE",
    `Token: ${formatTokenNumber(order.tokenNumber)}    ${new Date(order.createdAt || Date.now()).toLocaleString("en-IN")}`,
    order.customerName ? `Customer: ${order.customerName}  ${order.customerPhone || ""}` : "",
    order.notes ? `Special note: ${order.notes}` : "",
    "--------------------------------",
    ...commonOrderLines(order),
    "--------------------------------",
    `Subtotal: ${formatMoney(order.subtotal)}`,
    order.discountAmount ? `Discount: -${formatMoney(order.discountAmount)}` : "",
    `Tax:      ${formatMoney(order.taxAmount)}`,
    `TOTAL:    ${formatMoney(order.grandTotal)}`,
    `Paid by: ${order.paymentMode}`,
    "",
  ].filter(Boolean);

  const parts = [
    command(ESC, 0x40),
    command(ESC, 0x61, 0x01),
    command(ESC, 0x45, 0x01),
    textBytes(`${branch.name || "Restaurant"}\n`),
    command(ESC, 0x45, 0x00),
    textBytes(`${header.slice(1).join("\n")}\n`),
  ];
  if (upiUri) {
    parts.push(
      textBytes("Scan to pay\n"),
      qrCodeCommand(upiUri),
      textBytes(`${paymentSettings.upiId}\n`),
    );
  } else {
    parts.push(textBytes("UPI not configured\n"));
  }
  parts.push(
    textBytes("\nThank you!\n\n"),
    command(ESC, 0x70, 0x00, 0x19, 0xfa),
    command(GS, 0x56, 0x42, 0x00),
  );
  return joinBytes(...parts);
}

export function buildKitchenKot({ branch, order }) {
  const parts = [
    command(ESC, 0x40),
    command(ESC, 0x42, 0x03, 0x02),
    command(ESC, 0x61, 0x01),
    textBytes(`${branch.name || "KITCHEN"}\n`),
    command(ESC, 0x45, 0x01),
    command(GS, 0x21, 0x22),
    textBytes(`TOKEN ${formatTokenNumber(order.tokenNumber)}\n`),
    command(GS, 0x21, 0x00),
    textBytes(order.customerName ? `CUSTOMER ${order.customerName}\n` : ""),
    textBytes("--------------------------------\n"),
    ...order.items.map((item) =>
      joinBytes(
        command(ESC, 0x45, 0x01),
        textBytes(`${item.quantity} x ${item.name}\n${item.specialNote ? `  NOTE: ${item.specialNote}\n` : ""}`),
        command(ESC, 0x45, 0x00),
      ),
    ),
    order.notes ? textBytes(`Notes: ${order.notes}\n`) : new Uint8Array(),
    textBytes(`\n${new Date(order.createdAt || Date.now()).toLocaleTimeString("en-IN")}\n\n`),
    command(GS, 0x56, 0x42, 0x00),
  ];
  return joinBytes(...parts);
}

export async function printToUSB(device, bytes) {
  if (!device?.opened) throw new Error("Counter printer is not connected");
  if (!device.configuration) await device.selectConfiguration(1);
  const configuration = device.configuration;
  if (!configuration) throw new Error("USB printer has no active configuration");

  let endpoint;
  for (const iface of device.configuration.interfaces) {
    for (const alternate of iface.alternates) {
      endpoint = alternate.endpoints.find(
        (entry) => entry.direction === "out" && entry.type === "bulk",
      );
      if (endpoint) {
        if (!iface.claimed) await device.claimInterface(iface.interfaceNumber);
        if (iface.alternate.alternateSetting !== alternate.alternateSetting) {
          await device.selectAlternateInterface(iface.interfaceNumber, alternate.alternateSetting);
        }
        break;
      }
    }
    if (endpoint) break;
  }
  if (!endpoint) throw new Error("USB printer has no writable endpoint");
  const result = await device.transferOut(endpoint.endpointNumber, bytes);
  if (result.status !== "ok") throw new Error(`USB printer write failed: ${result.status}`);
}

export async function printToBluetooth(characteristic, bytes) {
  if (!characteristic) throw new Error("Kitchen printer is not connected");
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const chunk = bytes.slice(offset, offset + 64);
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValueWithResponse(chunk);
    }
  }
}

export async function dispatchPrints({ usbDevice, bluetoothCharacteristic, bill, kot }) {
  return Promise.allSettled([
    printToUSB(usbDevice, bill),
    printToBluetooth(bluetoothCharacteristic, kot),
  ]);
}
