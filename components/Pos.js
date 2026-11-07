"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { formatTokenNumber } from "@/lib/order-token";
import {
  Bluetooth,
  CircleDollarSign,
  Eye,
  Minus,
  Plus,
  Printer,
  Receipt,
  Search,
  Usb,
  Utensils,
  X,
} from "lucide-react";
import {
  buildCounterBill,
  buildKitchenKot,
  printToBluetooth,
  printToUSB,
} from "@/lib/escpos";
import Login from "@/components/Login";
import { isBranchManagerRole } from "@/lib/roles";

const money = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);

export default function Pos() {
  const [products, setProducts] = useState([]);
  const [branch, setBranch] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [cart, setCart] = useState([]);
  const [lastOrder, setLastOrder] = useState(null);
  const [showBill, setShowBill] = useState(false);
  const [billEdit, setBillEdit] = useState(null);
  const [showKot, setShowKot] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [customerLookup, setCustomerLookup] = useState({ loading: false, error: "" });
  const [discountPercent, setDiscountPercent] = useState(0);
  const [showUpiWarning, setShowUpiWarning] = useState(false);
  const [pendingPayment, setPendingPayment] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [activePayment, setActivePayment] = useState("");
  const [usbLabel, setUsbLabel] = useState("Connect counter printer");
  const [bluetoothLabel, setBluetoothLabel] = useState("Connect kitchen printer");
  const usbDevice = useRef(null);
  const bluetoothCharacteristic = useRef(null);

  const subtotal = useMemo(
    () => Math.round(cart.reduce((sum, entry) => sum + entry.price * entry.quantity, 0) * 100) / 100,
    [cart],
  );
  const maxSafeDiscountPercent = cart.length
    ? Math.min(...cart.map((item) => item.maxDiscountPercent || 0))
    : 0;
  const appliedDiscountPercent = Math.min(discountPercent, maxSafeDiscountPercent);
  const discountAmount = Math.round(subtotal * appliedDiscountPercent) / 100;
  const grandTotal = Math.round((subtotal - discountAmount) * 100) / 100;
  const customerLookupMatches =
    customerInfo?.lookupForName === customerName.trim() &&
    customerInfo?.lookupForPhone === customerPhone;
  const billEditSubtotal = billEdit
    ? billEdit.items.reduce((sum, item) => {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) return sum;
      const price = products.find((product) => product.id === item.productId)?.price ?? item.unitPrice;
      return sum + Math.round(price * quantity * 100) / 100;
    }, 0)
    : 0;
  const billEditCompositionChanged = billEdit
    ? billEdit.items.length !== (lastOrder?.order.items.length || 0) ||
      billEdit.items.some((item) => {
        const existing = lastOrder?.order.items.find((entry) => entry.productId === item.productId);
        return !existing || Number(item.quantity) !== existing.quantity;
      })
    : false;
  const billEditTotal = billEdit
    ? billEditCompositionChanged
      ? billEditSubtotal + Number(lastOrder?.order.taxAmount || 0)
      : Number(lastOrder?.order.grandTotal || 0)
    : 0;

  useEffect(() => {
    async function load() {
      const [sessionResponse, productsResponse] = await Promise.all([
        fetch("/api/session"),
        fetch("/api/products"),
      ]);
      if (!sessionResponse.ok) {
        setAuthRequired(true);
        return;
      }
      const session = await sessionResponse.json();
      const productResult = await productsResponse.json();
      if (!productsResponse.ok) throw new Error(productResult.error || "Could not load menu");
      if (!isBranchManagerRole(session.user.role)) {
        setStatus("The billing screen is available to branch operators.");
        return;
      }
      setBranch({ ...session.branch, paymentSettings: session.paymentSettings });
      setProducts(productResult.products);
    }

    load().catch((error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    const settings = lastOrder?.branch?.paymentSettings;
    if (!lastOrder || !settings?.upiId || !settings?.upiPayerName || lastOrder.order.grandTotal <= 0) {
      setQrDataUrl("");
      return;
    }
    const upiUri = `upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.upiPayerName)}&am=${Number(lastOrder.order.grandTotal).toFixed(2)}&cu=${settings.upiCurrency || "INR"}&tn=Order_${formatTokenNumber(lastOrder.order.tokenNumber)}`;
    let active = true;
    QRCode.toDataURL(upiUri, { width: 220, margin: 1 })
      .then((dataUrl) => { if (active) setQrDataUrl(dataUrl); })
      .catch((error) => { if (active) setStatus(`Could not create payment QR: ${error.message}`); });
    return () => { active = false; };
  }, [lastOrder]);

  useEffect(() => {
    const normalizedPhone = customerPhone.replace(/\D/g, "");
    if (customerName.trim().length < 2 || !/^\d{10}$/.test(normalizedPhone)) {
      setCustomerInfo(null);
      setWhatsappOptIn(false);
      setCustomerLookup({ loading: false, error: "" });
      setDiscountPercent(0);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCustomerLookup({ loading: true, error: "" });
      try {
        const response = await fetch("/api/branch-manager/customers/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: customerName.trim(), phone: normalizedPhone }),
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not look up customer");
        setCustomerInfo({
          ...result.customer,
          lookupForName: customerName.trim(),
          lookupForPhone: normalizedPhone,
        });
        setWhatsappOptIn(result.customer.whatsappOptIn === true);
        setDiscountPercent(result.customer.suggestedDiscountPercent || 0);
        setCustomerLookup({ loading: false, error: "" });
      } catch (error) {
        if (error.name !== "AbortError") {
          setCustomerInfo(null);
          setCustomerLookup({ loading: false, error: error.message });
        }
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [customerName, customerPhone]);

  const addProduct = useCallback((product) => {
    setCart((current) => {
      const found = current.find((entry) => entry.id === product.id);
      if (found) {
        return current.map((entry) =>
          entry.id === product.id ? { ...entry, quantity: entry.quantity + 1 } : entry,
        );
      }
      return [...current, { ...product, quantity: 1, specialNote: "" }];
    });
  }, []);

  function changeItemNote(productId, specialNote) {
    setCart((current) =>
      current.map((item) => item.id === productId ? { ...item, specialNote } : item),
    );
  }

  function changeQuantity(productId, delta) {
    setCart((current) =>
      current
        .map((item) =>
          item.id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  async function connectUSB() {
    if (!navigator.usb) {
      setStatus("WebUSB is unavailable. Use a supported Chromium browser over HTTPS.");
      return;
    }
    const device = await navigator.usb.requestDevice({ filters: [] });
    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);
    usbDevice.current = device;
    setUsbLabel(device.productName || "Counter printer connected");
    device.addEventListener("disconnect", () => {
      if (usbDevice.current === device) {
        usbDevice.current = null;
        setUsbLabel("Connect counter printer");
      }
    });
    setStatus("Counter printer connected.");
  }

  async function connectBluetooth() {
    if (!navigator.bluetooth) {
      setStatus("Web Bluetooth is unavailable. Use a supported Chromium browser over HTTPS.");
      return;
    }
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ["000018f0-0000-1000-8000-00805f9b34fb"],
    });
    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();
    let writable = null;
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      writable = characteristics.find(
        (characteristic) =>
          characteristic.properties.write || characteristic.properties.writeWithoutResponse,
      );
      if (writable) break;
    }
    if (!writable) {
      device.gatt.disconnect();
      throw new Error("No writable printer characteristic was exposed by this device.");
    }
    bluetoothCharacteristic.current = writable;
    setBluetoothLabel(device.name || "Kitchen printer connected");
    device.addEventListener("gattserverdisconnected", () => {
      bluetoothCharacteristic.current = null;
      setBluetoothLabel("Connect kitchen printer");
    });
    setStatus("Kitchen printer connected.");
  }

  async function testPrinter(target) {
    const message = new TextEncoder().encode("\u001b@\u001ba\u0001PRINTER TEST\n\n\u001dV\u0000");
    try {
      if (target === "bill") {
        await printToUSB(usbDevice.current, message);
      } else {
        await printToBluetooth(bluetoothCharacteristic.current, message);
      }
      setStatus(`${target === "bill" ? "Counter" : "Kitchen"} printer test sent.`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function printLastOrder(target) {
    if (!lastOrder) {
      setStatus("Settle an order before printing.");
      return;
    }
    try {
      if (target === "bill") {
        await printToUSB(
          usbDevice.current,
          buildCounterBill({ branch: lastOrder.branch, order: lastOrder.order }),
        );
      } else {
        await printToBluetooth(
          bluetoothCharacteristic.current,
          buildKitchenKot({ branch: lastOrder.branch, order: lastOrder.order }),
        );
      }
      setStatus(`${target === "bill" ? "Bill" : "Kitchen ticket"} printed for order ${formatTokenNumber(lastOrder.order.tokenNumber)}.`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  function beginBillEdit() {
    if (!lastOrder) return;
    setBillEdit({
      notes: lastOrder.order.notes || "",
      paymentMode: lastOrder.order.paymentMode,
      items: lastOrder.order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: String(item.quantity),
        specialNote: item.specialNote || "",
        unitPrice: item.unitPrice,
        total: item.total,
      })),
    });
    setStatus("");
    setShowBill(false);
  }

  function addProductToBill(productId) {
    const product = products.find((entry) => entry.id === productId);
    if (!product || !billEdit) return;
    const existing = billEdit.items.find((item) => item.productId === product.id);
    setBillEdit((current) => ({
      ...current,
      items: existing
        ? current.items.map((item) => item.productId === product.id
          ? { ...item, quantity: String(Number(item.quantity) + 1) }
          : item)
        : [...current.items, {
          productId: product.id,
          name: product.name,
          quantity: "1",
          specialNote: "",
          unitPrice: product.price,
        }],
    }));
  }

  async function saveBillEdit(event) {
    event.preventDefault();
    if (!lastOrder || !billEdit || busy) return;
    const items = billEdit.items
      .filter((item) => Number(item.quantity) > 0)
      .map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        specialNote: item.specialNote,
      }));
    if (!items.length) {
      setStatus("An order must contain at least one menu item.");
      return;
    }

    setBusy(true);
    try {
      const orderId = lastOrder.order.id || lastOrder.order._id;
      const response = await fetch(`/api/branch-manager/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: billEdit.notes,
          paymentMode: billEdit.paymentMode,
          items,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update order");
      setLastOrder((current) => ({
        ...current,
        order: { ...result.order, id: String(result.order._id) },
      }));
      setBillEdit(null);
      setQrDataUrl("");
      setShowBill(true);
      setStatus(`Order ${formatTokenNumber(result.order.tokenNumber)} updated. Item changes use current menu prices.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function settle(paymentMode, confirmedNoUpi = false) {
    if (!cart.length || busy) return;
    if (
      customerName.trim().length < 2 ||
      !/^\d{10}$/.test(customerPhone.replace(/\D/g, "")) ||
      !customerLookupMatches
    ) {
      setStatus(!customerLookupMatches && customerName.trim().length >= 2 && /^\d{10}$/.test(customerPhone)
        ? "Wait for the customer lookup to finish before billing."
        : "Enter the customer's name and valid 10-digit mobile number before billing.");
      return;
    }
    setBusy(true);
    setActivePayment(paymentMode);
    setStatus("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
            specialNote: item.specialNote,
          })),
          customerName: customerName.trim(),
          customerPhone: customerPhone.replace(/\D/g, ""),
          whatsappOptIn,
          discountPercent: appliedDiscountPercent,
          paymentMode,
          notes,
          confirmNoUpi: confirmedNoUpi,
        }),
      });
      const result = await response.json();
      if (response.status === 409 && result.requiresUpiConfirmation) {
        setPendingPayment(paymentMode);
        setShowUpiWarning(true);
        return;
      }
      if (!response.ok) throw new Error(result.error || "Unable to settle order");

      setQrDataUrl("");
      setLastOrder({ order: result.order, branch: result.branch });
      setBranch({ ...branch, ...result.branch });
      setShowBill(true);
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setWhatsappOptIn(false);
      setCustomerInfo(null);
      setNotes("");
      setDiscountPercent(0);
      const [billResult, kotResult] = await Promise.allSettled([
        result.branch.autoPrintBill
          ? printToUSB(
              usbDevice.current,
              buildCounterBill({ branch: result.branch, order: result.order }),
            )
          : Promise.resolve(),
        result.branch.autoPrintKOT
          ? printToBluetooth(
              bluetoothCharacteristic.current,
              buildKitchenKot({ branch: result.branch, order: result.order }),
            )
          : Promise.resolve(),
      ]);
      const errors = [
        ...(result.branch.autoPrintBill ? [billResult] : []),
        ...(result.branch.autoPrintKOT ? [kotResult] : []),
      ]
          .filter((printResult) => printResult.status === "rejected")
          .map((printResult) => printResult.reason?.message || "Printer failed");
      setStatus(errors.length
        ? `Order ${formatTokenNumber(result.order.tokenNumber)} saved. ${errors.join("; ")}`
        : result.branch.autoPrintBill || result.branch.autoPrintKOT
          ? `Order ${formatTokenNumber(result.order.tokenNumber)} settled and dispatched.`
          : `Order ${formatTokenNumber(result.order.tokenNumber)} settled. Use the print actions if needed.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
      setActivePayment("");
    }
  }

  const visibleProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase()),
  );
  const productSections = visibleProducts.reduce((sections, product) => {
    const sectionName = product.parentCategoryName || product.categoryName || "Menu";
    if (!sections[sectionName]) sections[sectionName] = {};
    const subsectionName = product.parentCategoryName ? product.categoryName : "";
    if (!sections[sectionName][subsectionName]) sections[sectionName][subsectionName] = [];
    sections[sectionName][subsectionName].push(product);
    return sections;
  }, {});

  if (authRequired) return <Login />;

  return (
    <main className="min-h-screen lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-forest text-white">
            <Utensils size={21} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-forest">Counter</p>
            <h1 className="text-lg font-bold">{branch?.name || "Restaurant POS"}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => connectUSB().catch((error) => setStatus(error.message))}
            className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold hover:bg-paper"
          >
            <Usb size={17} /> {usbLabel}
          </button>
          <button
            onClick={() => connectBluetooth().catch((error) => setStatus(error.message))}
            className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold hover:bg-paper"
          >
            <Bluetooth size={17} /> {bluetoothLabel}
          </button>
          <button
            disabled={!usbDevice.current}
            onClick={() => testPrinter("bill")}
            className="rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold hover:bg-paper disabled:opacity-40"
          >
            Test counter
          </button>
          <button
            disabled={!bluetoothCharacteristic.current}
            onClick={() => testPrinter("kot")}
            className="rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold hover:bg-paper disabled:opacity-40"
          >
            Test kitchen
          </button>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              usbDevice.current?.close().catch(() => {});
              bluetoothCharacteristic.current?.service?.device?.gatt?.disconnect();
              window.location.reload();
            }}
            className="rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold hover:bg-paper"
          >
            Log out
          </button>
          <a href="/branch-manager" className="rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold hover:bg-paper">
            Manager workspace
          </a>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 p-4 lg:w-full lg:flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_430px] lg:grid-rows-[minmax(0,1fr)] lg:p-6">
        <section className="lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-black/50">Branch billing</p>
              <h2 className="text-2xl font-bold">Start an order</h2>
            </div>
            <label className="flex w-full max-w-sm items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2.5">
              <Search size={18} className="text-black/40" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search menu"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
          </div>

          {!products.length ? (
            <div className="rounded-2xl border border-dashed border-black/20 bg-white p-10 text-center text-sm text-black/55">
              {status || "No available menu items for this branch."}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(productSections).map(([sectionName, subsections]) => (
                <section key={sectionName} aria-label={sectionName}>
                  <h3 className="mb-3 text-lg font-bold">{sectionName}</h3>
                  <div className="space-y-4">
                    {Object.entries(subsections).map(([subsectionName, sectionProducts]) => (
                      <div key={subsectionName || sectionName}>
                        {subsectionName && <h4 className="mb-2 text-sm font-semibold text-black/60">{subsectionName}</h4>}
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {sectionProducts.map((product) => (
                            <button
                              key={product.id}
                              onClick={() => billEdit ? addProductToBill(product.id) : addProduct(product)}
                              className="rounded-2xl border border-black/10 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-forest/40 hover:shadow-md"
                            >
                              <span className="mb-5 grid h-10 w-10 place-items-center rounded-xl bg-[#e7f2eb] text-forest">
                                <Utensils size={19} />
                              </span>
                              <span className="block font-semibold">{product.name}</span>
                              <span className="mt-1 block text-sm text-black/55">{money(product.price)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-forest">{billEdit ? "Editing order" : "Current order"}</p>
              <h2 className="mt-1 text-xl font-bold">{billEdit ? `Token #${formatTokenNumber(lastOrder.order.tokenNumber)}` : "Checkout"}</h2>
            </div>
            {billEdit ? (
              <button
                type="button"
                onClick={() => setBillEdit(null)}
                aria-label="Cancel order edit"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-black/55 hover:bg-paper"
              >
                Cancel
              </button>
            ) : cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                aria-label="Clear order"
                className="rounded-lg p-2 text-black/45 hover:bg-paper hover:text-black"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {!billEdit ? (
            <>
          <div className="mt-5 grid gap-3">
            <label className="text-xs font-semibold text-black/55">
              CUSTOMER NAME
              <input
                required
                autoComplete="name"
                minLength={2}
                maxLength={80}
                value={customerName}
                onChange={(event) => {
                  setCustomerName(event.target.value);
                  setCustomerInfo(null);
                  setWhatsappOptIn(false);
                  setDiscountPercent(0);
                }}
                placeholder="Customer name"
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm text-ink outline-none focus:border-forest"
              />
            </label>
            <label className="text-xs font-semibold text-black/55">
              CUSTOMER MOBILE NUMBER
              <input
                required
                autoComplete="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                value={customerPhone}
                onChange={(event) => {
                  setCustomerPhone(event.target.value.replace(/\D/g, "").slice(0, 10));
                  setCustomerInfo(null);
                  setWhatsappOptIn(false);
                  setDiscountPercent(0);
                }}
                placeholder="10-digit mobile number"
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm text-ink outline-none focus:border-forest"
              />
            </label>
            <label className="flex items-start gap-2 text-xs text-black/60">
              <input
                type="checkbox"
                checked={whatsappOptIn}
                onChange={(event) => setWhatsappOptIn(event.target.checked)}
                className="mt-0.5 accent-forest"
              />
              <span>Customer agrees to receive WhatsApp messages from this restaurant. Leave unchecked if they have not consented.</span>
            </label>
            {(customerLookup.loading || customerInfo || customerLookup.error) && (
              <div className="rounded-lg bg-paper p-3 text-xs">
                {customerLookup.loading ? <p className="text-black/50">Looking up customer…</p> : null}
                {customerInfo && (
                  <>
                    <p className="font-semibold text-forest">{customerInfo.visitCount ? (customerInfo.isRegular ? "Regular customer" : "Returning customer") : "New customer"}</p>
                    <p className="mt-1 text-black/60">
                      {customerInfo.visitCount} visit{customerInfo.visitCount === 1 ? "" : "s"}
                      {customerInfo.visitCount ? ` · Average order ${money(customerInfo.averageOrderCost)}` : ""}
                    </p>
                    {customerInfo.lastVisitAt && <p className="mt-1 text-black/50">Last visit {new Date(customerInfo.lastVisitAt).toLocaleDateString("en-IN")}</p>}
                  </>
                )}
                {customerLookup.error && <p role="alert" className="text-red-700">{customerLookup.error}</p>}
              </div>
            )}
            <label className="text-xs font-semibold text-black/55">
              ORDER NOTE (OPTIONAL)
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Note for the entire order..."
                maxLength={300}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm text-ink outline-none focus:border-forest"
              />
            </label>
          </div>

          <div className="mt-5 space-y-4">
            {cart.length === 0 ? (
              <div className="rounded-xl bg-paper p-6 text-center text-sm text-black/45">
                Tap a menu item to add it to this order.
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="border-b border-black/5 pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="mt-1 text-xs text-black/50">
                        {money(item.price)} each · {money(
                          Math.round(
                            item.price *
                              item.quantity *
                              (1 - appliedDiscountPercent / 100) *
                              100,
                          ) / 100,
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => changeQuantity(item.id, -1)}
                        aria-label={`Decrease ${item.name}`}
                        className="grid h-7 w-7 place-items-center rounded-md border border-black/10"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-5 text-center text-sm font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => changeQuantity(item.id, 1)}
                        aria-label={`Increase ${item.name}`}
                        className="grid h-7 w-7 place-items-center rounded-md border border-black/10"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <label className="mt-2 block text-xs font-semibold text-black/50">
                    SPECIAL NOTE FOR THIS ITEM
                    <input
                      value={item.specialNote}
                      maxLength={300}
                      onChange={(event) => changeItemNote(item.id, event.target.value)}
                      placeholder={`e.g. less spicy, for ${item.name}`}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm text-ink outline-none focus:border-forest"
                    />
                  </label>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 rounded-lg bg-paper p-3">
            <label className="flex items-center justify-between gap-3 text-xs font-semibold text-black/60">
              <span>
                Order discount
                <span className="mt-1 block font-normal">
                  {maxSafeDiscountPercent
                    ? `${customerInfo?.suggestedDiscountPercent || 0}% suggested · Maximum ${maxSafeDiscountPercent}% above cost`
                    : "No safe discount available until the Owner enters item cost prices"}
                </span>
              </span>
              <input
                type="number"
                min="0"
                max={maxSafeDiscountPercent}
                step="1"
                value={appliedDiscountPercent}
                onChange={(event) => setDiscountPercent(Math.min(maxSafeDiscountPercent, Math.max(0, Number(event.target.value))))}
                disabled={!maxSafeDiscountPercent || !cart.length}
                className="w-20 rounded border border-black/10 bg-white px-2 py-1 text-right text-sm text-ink disabled:opacity-50"
              />
            </label>
          </div>

          <div className="mt-5 space-y-2 border-t border-black/10 pt-4 text-sm">
            <div className="flex justify-between text-black/55"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            {discountAmount > 0 && <div className="flex justify-between text-green-700"><span>Discount ({appliedDiscountPercent}%)</span><span>−{money(discountAmount)}</span></div>}
            <div className="flex justify-between text-black/55"><span>Tax</span><span>{money(0)}</span></div>
            <div className="flex justify-between pt-1 text-lg font-bold"><span>Total due</span><span>{money(grandTotal)}</span></div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              disabled={!cart.length || busy || !customerLookupMatches || customerLookup.loading}
              onClick={() => settle("CASH")}
              className="flex items-center justify-center gap-2 rounded-xl border border-black/10 px-3 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CircleDollarSign size={17} /> {activePayment === "CASH" ? "Saving..." : "Cash"}
            </button>
            <button
              disabled={!cart.length || busy || !customerLookupMatches || customerLookup.loading}
              onClick={() => settle("UPI")}
              className="rounded-xl bg-forest px-3 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {activePayment === "UPI" ? "Saving..." : "Settle UPI"}
            </button>
          </div>
            </>
          ) : (
            <form onSubmit={saveBillEdit} className="mt-5">
              <p className="text-sm text-black/55">{lastOrder.order.customerName} · {lastOrder.order.customerPhone}</p>
              <label className="mt-4 block text-xs font-semibold text-black/55">
                ORDER NOTE
                <input value={billEdit.notes} maxLength={300} onChange={(event) => setBillEdit({ ...billEdit, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
              </label>
              <label className="mt-3 block text-xs font-semibold text-black/55">
                PAYMENT MODE
                <select value={billEdit.paymentMode} onChange={(event) => setBillEdit({ ...billEdit, paymentMode: event.target.value })} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                  <option value="CASH">Cash</option><option value="UPI">UPI</option>
                </select>
              </label>
              <div className="mt-5 space-y-4">
                {billEdit.items.map((item, index) => {
                  const unitPrice = products.find((product) => product.id === item.productId)?.price ?? item.unitPrice;
                  return (
                    <div key={`${item.productId}-${index}`} className="border-b border-black/5 pb-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{item.name}</p>
                          <p className="mt-1 text-xs text-black/50">{money(unitPrice)} each</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setBillEdit((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: String(Math.max(0, Number(entry.quantity) - 1)) } : entry) }))} aria-label={`Decrease ${item.name}`} className="grid h-7 w-7 place-items-center rounded-md border border-black/10"><Minus size={14} /></button>
                          <input aria-label={`${item.name} quantity`} type="number" min="0" max="999" step="1" value={item.quantity} onChange={(event) => setBillEdit((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: event.target.value } : entry) }))} className="h-8 w-14 rounded border border-black/10 px-2 text-center" />
                          <button type="button" onClick={() => setBillEdit((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: String(Math.min(999, Number(entry.quantity) + 1)) } : entry) }))} aria-label={`Increase ${item.name}`} className="grid h-7 w-7 place-items-center rounded-md border border-black/10"><Plus size={14} /></button>
                        </div>
                      </div>
                      <label className="mt-2 block text-xs font-semibold text-black/50">
                        SPECIAL NOTE FOR THIS ITEM
                        <input value={item.specialNote} maxLength={300} onChange={(event) => setBillEdit((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, specialNote: event.target.value } : entry) }))} placeholder={`e.g. less spicy, for ${item.name}`} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm text-ink outline-none focus:border-forest" />
                      </label>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-black/45">Tap menu items to add them to this order. Changed quantities use current menu prices and clear the previous discount.</p>
              <div className="mt-5 space-y-2 border-t border-black/10 pt-4 text-sm">
                <div className="flex justify-between text-black/55"><span>Subtotal</span><span>{money(billEditCompositionChanged ? billEditSubtotal : lastOrder.order.subtotal)}</span></div>
                {!billEditCompositionChanged && lastOrder.order.discountAmount > 0 && <div className="flex justify-between text-green-700"><span>Discount ({lastOrder.order.discountPercent}%)</span><span>−{money(lastOrder.order.discountAmount)}</span></div>}
                <div className="flex justify-between text-black/55"><span>Tax</span><span>{money(lastOrder.order.taxAmount)}</span></div>
                <div className="flex justify-between border-t border-black/10 pt-2 text-lg font-bold"><span>Total</span><span>{money(billEditTotal)}</span></div>
              </div>
              <button type="submit" disabled={busy || billEdit.items.every((item) => Number(item.quantity) <= 0)} className="mt-4 w-full rounded-xl bg-forest px-3 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? "Saving…" : "Save order changes"}
              </button>
            </form>
          )}
          {!billEdit && <div className="mt-2 grid grid-cols-3 gap-2">
            <button
              disabled={!lastOrder}
              onClick={() => setShowBill(true)}
              className="flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-black/55 hover:bg-paper disabled:opacity-40"
            >
              <Receipt size={15} /> View bill
            </button>
            <button
              disabled={!lastOrder}
              onClick={() => printLastOrder("bill")}
              className="flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-black/55 hover:bg-paper"
            >
              <Printer size={15} /> Manual print bill
            </button>
            <button
              disabled={!lastOrder}
              onClick={() => printLastOrder("kot")}
              className="flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-black/55 hover:bg-paper"
            >
              <Printer size={15} /> Manual print KOT
            </button>
            <button
              disabled={!lastOrder}
              onClick={() => setShowKot(true)}
              className="flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-black/55 hover:bg-paper"
            >
              <Eye size={15} /> View KOT
            </button>
          </div>}
          {status && <p role="status" className="mt-3 rounded-lg bg-paper p-3 text-xs text-black/70">{status}</p>}
        </aside>
      </div>

      {showBill && lastOrder && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowBill(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-title"
            className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="text-center">
              <h2 id="bill-title" className="text-xl font-bold">{lastOrder.branch.name || "Restaurant"}</h2>
              {lastOrder.branch.address && <p className="mt-1 text-sm text-black/55">{lastOrder.branch.address}</p>}
              {lastOrder.branch.gstin && <p className="mt-1 text-xs text-black/50">GSTIN: {lastOrder.branch.gstin}</p>}
              <p className="mt-3 text-xs font-bold uppercase tracking-widest text-forest">Order bill</p>
            </div>

            <div className="mt-5 flex justify-between border-y border-dashed border-black/20 py-3 text-sm">
              <div><p className="text-xs text-black/45">TOKEN NUMBER</p><p className="mt-1 text-xl font-bold">#{formatTokenNumber(lastOrder.order.tokenNumber)}</p></div>
              <div className="text-right"><p className="text-xs text-black/45">DATE & TIME</p><p className="mt-1">{new Date(lastOrder.order.createdAt).toLocaleString("en-IN")}</p></div>
            </div>
            <p className="mt-3 text-sm"><span className="text-black/50">Customer:</span> {lastOrder.order.customerName} · {lastOrder.order.customerPhone}</p>
            {billEdit ? (
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-semibold text-black/55">
                  ORDER NOTE
                  <input value={billEdit.notes} maxLength={300} onChange={(event) => setBillEdit({ ...billEdit, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs font-semibold text-black/55">
                  PAYMENT MODE
                  <select value={billEdit.paymentMode} onChange={(event) => setBillEdit({ ...billEdit, paymentMode: event.target.value })} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                    <option value="CASH">Cash</option><option value="UPI">UPI</option>
                  </select>
                </label>
              </div>
            ) : lastOrder.order.notes && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                <span className="font-semibold">Order note:</span> {lastOrder.order.notes}
              </p>
            )}
            {status && <p role="status" className="mt-3 rounded-lg bg-paper p-2 text-xs text-black/70">{status}</p>}

            <div className="mt-4">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-black/10 pb-2 text-xs font-semibold uppercase text-black/45">
                <span>Item</span><span className="text-right">Qty</span><span className="text-right">Amount</span>
              </div>
              <div className="divide-y divide-black/5">
                {(billEdit ? billEdit.items : lastOrder.order.items).map((item, index) => (
                  <div key={`${item.name}-${index}`} className="grid grid-cols-[1fr_auto_auto] gap-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-black/45">{money(item.unitPrice)} each</p>
                      {billEdit ? (
                        <input aria-label={`${item.name} special note`} maxLength={300} value={item.specialNote} onChange={(event) => setBillEdit({ ...billEdit, items: billEdit.items.map((entry) => entry.productId === item.productId ? { ...entry, specialNote: event.target.value } : entry) })} placeholder={`Special note for ${item.name}…`} className="mt-2 w-full rounded border border-black/10 px-2 py-1.5 text-xs" />
                      ) : item.specialNote && <p className="mt-1 text-xs text-amber-800">Special note: {item.specialNote}</p>}
                    </div>
                    {billEdit ? (
                      <input aria-label={`${item.name} quantity`} type="number" min="0" max="999" value={item.quantity} onChange={(event) => setBillEdit({ ...billEdit, items: billEdit.items.map((entry) => entry.productId === item.productId ? { ...entry, quantity: event.target.value } : entry) })} className="h-8 w-16 rounded border border-black/10 px-2 text-right" />
                    ) : <span className="text-right">{item.quantity}</span>}
                    <span className="text-right font-medium">{money(billEdit && billEditCompositionChanged ? (products.find((product) => product.id === item.productId)?.price ?? item.unitPrice) * Number(item.quantity || 0) : item.total)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 space-y-2 border-t border-dashed border-black/20 pt-3 text-sm">
              <div className="flex justify-between text-black/55"><span>Subtotal</span><span>{money(billEdit && billEditCompositionChanged ? billEditSubtotal : lastOrder.order.subtotal)}</span></div>
              {(!billEdit || !billEditCompositionChanged) && lastOrder.order.discountAmount > 0 && <div className="flex justify-between text-green-700"><span>Discount ({lastOrder.order.discountPercent}%)</span><span>−{money(lastOrder.order.discountAmount)}</span></div>}
              <div className="flex justify-between text-black/55"><span>Tax</span><span>{money(lastOrder.order.taxAmount)}</span></div>
              <div className="flex justify-between border-t border-black/10 pt-2 text-lg font-bold"><span>Total</span><span>{money(billEdit ? billEditTotal : lastOrder.order.grandTotal)}</span></div>
              <div className="flex justify-between text-xs text-black/55"><span>Paid by</span><span>{billEdit ? billEdit.paymentMode : lastOrder.order.paymentMode}</span></div>
              {billEdit && billEditCompositionChanged && <p className="text-xs text-black/45">Changing item quantities recalculates the total at current menu prices and clears the previous discount.</p>}
            </div>
            {!billEdit && qrDataUrl && (
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-paper p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt={`UPI payment QR for ${money(lastOrder.order.grandTotal)}`} className="h-28 w-28 rounded bg-white p-1" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-forest">Scan to pay</p>
                  <p className="mt-1 text-sm font-semibold">{money(lastOrder.order.grandTotal)}</p>
                  <p className="text-xs text-black/50">{lastOrder.branch.paymentSettings.upiPayerName}</p>
                </div>
              </div>
            )}
            {!billEdit && <p className="mt-5 text-center text-xs text-black/45">Thank you!</p>}

            <div className="mt-5 flex justify-end gap-2">
              {billEdit ? (
                <>
                  <button type="button" disabled={busy} onClick={() => setBillEdit(null)} className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-40">Cancel</button>
                  <button type="button" disabled={busy} onClick={saveBillEdit} className="rounded-lg bg-forest px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setShowBill(false)} className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold">Close</button>
                  <button onClick={beginBillEdit} className="rounded-lg border border-forest px-4 py-2 text-sm font-bold text-forest">Edit order</button>
                  <button onClick={() => printLastOrder("bill")} className="flex items-center gap-2 rounded-lg bg-forest px-4 py-2 text-sm font-bold text-white">
                    <Printer size={15} /> Print bill
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {showKot && lastOrder && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowKot(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="kot-title"
            className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-forest">Kitchen order ticket</p>
              <h2 id="kot-title" className="mt-1 text-xl font-bold">{lastOrder.branch.name || "Kitchen"}</h2>
            </div>
            <div className="mt-4 flex justify-between border-y border-dashed border-black/20 py-3 text-sm">
              <div>
                <p className="text-xs text-black/45">TOKEN NUMBER</p>
                <p className="mt-1 text-2xl font-bold">#{formatTokenNumber(lastOrder.order.tokenNumber)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-black/45">TIME</p>
                <p className="mt-1">{new Date(lastOrder.order.createdAt).toLocaleTimeString("en-IN")}</p>
              </div>
            </div>
            {lastOrder.order.customerName && (
              <p className="mt-3 text-sm"><span className="text-black/50">Customer:</span> {lastOrder.order.customerName}</p>
            )}
            <div className="mt-4 divide-y divide-black/10">
              {lastOrder.order.items.map((item, index) => (
                <div key={`${item.name}-${index}`} className="py-3">
                  <p className="font-semibold">{item.quantity} × {item.name}</p>
                  {item.specialNote && <p className="mt-1 whitespace-pre-wrap text-sm text-amber-800">Note: {item.specialNote}</p>}
                </div>
              ))}
            </div>
            {lastOrder.order.notes && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                <span className="font-semibold">Order note:</span> {lastOrder.order.notes}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowKot(false)} className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold">Close</button>
              <button onClick={() => printLastOrder("kot")} className="flex items-center gap-2 rounded-lg bg-forest px-4 py-2 text-sm font-bold text-white">
                <Printer size={15} /> Print KOT
              </button>
            </div>
          </section>
        </div>
      )}

      {showUpiWarning && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="upi-warning-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="upi-warning-title" className="text-lg font-bold">UPI payment details are not configured</h2>
            <p className="mt-2 text-sm text-black/60">The Owner has not set a valid UPI ID and payer name. Continue to create and print this bill without a payment QR?</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { setShowUpiWarning(false); setPendingPayment(""); }} className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold">Cancel</button>
              <button onClick={() => { const payment = pendingPayment; setShowUpiWarning(false); setPendingPayment(""); settle(payment, true); }} className="rounded-lg bg-forest px-4 py-2 text-sm font-bold text-white">Continue without QR</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
