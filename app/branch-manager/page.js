"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, LogOut, Plus, Store, Trash2, Utensils } from "lucide-react";
import QRCode from "qrcode";
import { isBranchManagerRole } from "@/lib/roles";
import { formatTokenNumber } from "@/lib/order-token";
import { standardMenuCategories } from "@/lib/menu-categories";

const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
}).format(value || 0);

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => null);
  if (!data) throw new Error("Server returned an invalid response.");
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function Field({ label, ...props }) {
  return (
    <label className="block text-xs font-semibold text-black/55">
      {label}
      <input {...props} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black outline-none focus:border-forest" />
    </label>
  );
}

function OrderPaymentQr({ paymentSettings, amount, tokenNumber }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState("");

  useEffect(() => {
    if (!paymentSettings?.upiId || !paymentSettings?.upiPayerName) {
      setQrDataUrl("");
      setQrError("UPI payment details are not configured.");
      return;
    }

    let active = true;
    setQrDataUrl("");
    setQrError("");
    const upiUri = `upi://pay?pa=${encodeURIComponent(paymentSettings.upiId)}&pn=${encodeURIComponent(paymentSettings.upiPayerName)}&am=${amount.toFixed(2)}&cu=${paymentSettings.upiCurrency || "INR"}&tn=Order_${formatTokenNumber(tokenNumber)}`;
    QRCode.toDataURL(upiUri, { width: 220, margin: 1 })
      .then((dataUrl) => { if (active) setQrDataUrl(dataUrl); })
      .catch((error) => { if (active) setQrError(`Could not create payment QR: ${error.message}`); });

    return () => { active = false; };
  }, [amount, paymentSettings, tokenNumber]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#f5f5f0] p-3">
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt={`UPI payment QR for ${money(amount)}`} className="h-28 w-28 rounded bg-white p-1" />
      ) : (
        <p role={qrError ? "alert" : undefined} className={`text-sm ${qrError ? "text-red-700" : "text-black/50"}`}>
          {qrError || "Updating payment QR…"}
        </p>
      )}
      <div>
        <p className="text-xs font-semibold text-black/50">Scan to pay</p>
        <p className="text-lg font-bold">{money(amount)}</p>
      </div>
    </div>
  );
}

function BranchManagerPage() {
  const [branch, setBranch] = useState(null);
  const [paymentSettings, setPaymentSettings] = useState(null);
  const [tab, setTab] = useState("menu");
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [orders, setOrders] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [productForm, setProductForm] = useState({ categoryId: "", name: "", price: "" });
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [addingStandardCategories, setAddingStandardCategories] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [newOrderProduct, setNewOrderProduct] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadMenu = useCallback(async () => {
    const [categoryData, productData] = await Promise.all([
      api("/api/owner/categories"),
      api("/api/owner/products"),
    ]);
    setCategories(categoryData.categories);
    setProducts(productData.products);
    setProductForm((current) => ({
      ...current,
      categoryId: current.categoryId || categoryData.categories[0]?._id || "",
    }));
  }, []);

  const loadOrders = useCallback(async () => {
    setOrders((await api("/api/branch-manager/orders")).orders);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [sessionData, settingsData] = await Promise.all([
          api("/api/session"),
          api("/api/branch-manager/settings"),
        ]);
        if (!isBranchManagerRole(sessionData.user?.role)) {
          setError("Branch Manager access required.");
          return;
        }
        setBranch(settingsData.branch);
        setPaymentSettings(sessionData.paymentSettings);
        await Promise.all([loadMenu(), loadOrders()]);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [loadMenu, loadOrders]);

  async function createCategory(event) {
    event.preventDefault();
    try {
      await api("/api/owner/categories", {
        method: "POST",
        body: JSON.stringify({ branchId: branch._id, name: categoryName, parentCategoryId: parentCategoryId || null }),
      });
      setCategoryName("");
      setParentCategoryId("");
      setMessage("Category added.");
      await loadMenu();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function addStandardCategories() {
    if (!branch || addingStandardCategories) return;
    setAddingStandardCategories(true);
    setError("");
    try {
      const branchCategories = [...categories];
      const findCategory = (name, parentId = null) => branchCategories.find((category) =>
        category.name.trim().toLowerCase() === name.toLowerCase() &&
        String(category.parentCategoryId?._id ?? category.parentCategoryId ?? "") === (parentId || ""),
      );
      const createCategoryIfMissing = async (name, parentCategoryId = null) => {
        const existing = findCategory(name, parentCategoryId);
        if (existing) return String(existing._id);
        const { category } = await api("/api/owner/categories", {
          method: "POST",
          body: JSON.stringify({ branchId: branch._id, name, parentCategoryId }),
        });
        branchCategories.push(category);
        return String(category._id);
      };

      for (const section of standardMenuCategories) {
        const parentId = await createCategoryIfMissing(section.name);
        for (const child of section.children || []) await createCategoryIfMissing(child, parentId);
      }
      setMessage("Standard menu sections are ready.");
      await loadMenu();
    } catch (loadError) {
      setError(loadError.message);
      await loadMenu();
    } finally {
      setAddingStandardCategories(false);
    }
  }

  async function createProduct(event) {
    event.preventDefault();
    try {
      await api("/api/owner/products", {
        method: "POST",
        body: JSON.stringify({ ...productForm, branchId: branch._id, price: Number(productForm.price) }),
      });
      setProductForm((current) => ({ ...current, name: "", price: "" }));
      setMessage("Menu item added.");
      await loadMenu();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  function beginEditProduct(product) {
    setEditingProduct({ _id: product._id, name: product.name, price: String(product.price) });
    setError("");
  }

  async function saveProduct(event) {
    event.preventDefault();
    try {
      await api(`/api/owner/products/${editingProduct._id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editingProduct.name, price: Number(editingProduct.price) }),
      });
      setEditingProduct(null);
      setMessage("Menu item updated.");
      await loadMenu();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    try {
      await api(`/api/owner/categories/${editingCategory._id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editingCategory.name }),
      });
      setEditingCategory(null);
      setMessage("Category updated.");
      await loadMenu();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  function beginEditCategory(category) {
    setEditingCategory({ _id: category._id, name: category.name });
    setError("");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const { type, item } = deleteTarget;
      const endpoint = type === "category"
        ? `/api/owner/categories/${item._id}`
        : `/api/owner/products/${item._id}`;
      await api(endpoint, { method: "DELETE" });
      setDeleteTarget(null);
      setMessage(type === "category" ? "Category deleted." : "Menu item deleted.");
      await loadMenu();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  function beginEditOrder(order) {
    setEditingOrder({
      _id: order._id,
      notes: order.notes || "",
      paymentMode: order.paymentMode,
      taxAmount: order.taxAmount || 0,
      tokenNumber: order.tokenNumber,
      items: order.items.map((item) => ({
        productId: item.productId.toString(),
        name: item.name,
        quantity: String(item.quantity),
        unitPrice: item.unitPrice,
        specialNote: item.specialNote || "",
      })),
    });
    setNewOrderProduct("");
    setError("");
  }

  function addOrderProduct() {
    const product = products.find((item) => item._id === newOrderProduct && item.isAvailable);
    if (!product || !editingOrder) return;
    const existing = editingOrder.items.find((item) => item.productId === product._id);
    setEditingOrder((current) => ({
      ...current,
      items: existing
        ? current.items.map((item) => item.productId === product._id
          ? { ...item, quantity: String(Number(item.quantity) + 1), unitPrice: product.price }
          : item)
        : [...current.items, { productId: product._id, name: product.name, quantity: "1", unitPrice: product.price, specialNote: "" }],
    }));
  }

  async function saveOrder(event) {
    event.preventDefault();
    try {
      const items = editingOrder.items
        .filter((item) => Number(item.quantity) > 0)
        .map((item) => ({ productId: item.productId, quantity: Number(item.quantity), specialNote: item.specialNote }));
      await api(`/api/branch-manager/orders/${editingOrder._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          notes: editingOrder.notes,
          paymentMode: editingOrder.paymentMode,
          items,
        }),
      });
      setEditingOrder(null);
      setMessage("Order updated. The total was recalculated from the current branch menu prices.");
      await loadOrders();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f5f5f0] text-sm text-black/50">Loading Branch Manager workspace…</main>;
  if (error && !branch) return <main className="grid min-h-screen place-items-center bg-[#f5f5f0] p-5"><p role="alert" className="rounded-xl bg-red-50 p-5 text-red-700">{error}</p></main>;

  const tabs = [
    { id: "menu", label: "Branch menu", icon: Utensils },
    { id: "orders", label: "Orders", icon: ClipboardList },
  ];
  const editingSubtotal = editingOrder
    ? Math.round(editingOrder.items.reduce((sum, item) => {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) return sum;
      const currentPrice = products.find((product) => product._id === item.productId)?.price ?? item.unitPrice;
      return sum + Math.round(currentPrice * quantity * 100) / 100;
    }, 0) * 100) / 100
    : 0;
  const editingTotal = editingOrder ? editingSubtotal + editingOrder.taxAmount : 0;
  const visibleProducts = products.filter((product) => {
    const category = categories.find((item) => item._id === product.categoryId?.toString());
    const categoryName = category ? `${category.parentCategoryId?.name || ""} ${category.name}` : "";
    return `${product.name} ${categoryName}`.toLowerCase().includes(productSearch.trim().toLowerCase());
  });

  return (
    <main className="min-h-screen bg-[#f5f5f0]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-forest text-white"><Store size={20} /></span>
          <div><p className="text-xs font-bold uppercase tracking-widest text-forest">Branch Manager</p><h1 className="font-bold">{branch?.name} · {branch?.code}</h1></div>
        </div>
        <div className="flex gap-2">
          <a href="/pos" className="rounded-lg bg-forest px-4 py-2 text-sm font-bold text-white hover:bg-green-800">Open Restaurant POS</a>
          <button onClick={logout} className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold"><LogOut size={15} /> Log out</button>
        </div>
      </header>

      <nav className="border-b border-black/10 bg-white px-5">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setTab(id); setMessage(""); setError(""); }}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${tab === id ? "border-forest text-forest" : "border-transparent text-black/50"}`}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl space-y-5 p-5">
        {message && <p className="rounded-lg bg-[#e7f2eb] p-3 text-sm text-green-800">{message}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {tab === "menu" && (
          <div className="space-y-5">
            <section className="grid gap-5 lg:grid-cols-2">
              <form onSubmit={createCategory} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-bold">Add menu category</h2>
                <div className="grid gap-2">
                  <input required value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="e.g. Starters" className="min-w-0 flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm" />
                  <select value={parentCategoryId} onChange={(event) => setParentCategoryId(event.target.value)} className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                    <option value="">Top-level category</option>
                    {categories.filter((category) => !category.parentCategoryId).map((category) => <option key={category._id} value={category._id}>Under {category.name}</option>)}
                  </select>
                  <button className="rounded-lg bg-forest px-3 py-2 text-sm font-bold text-white"><Plus size={15} className="inline" /> Add</button>
                </div>
              </form>
              <form onSubmit={createProduct} className="grid gap-3 rounded-2xl border border-black/10 bg-white p-5 shadow-sm sm:grid-cols-2">
                <h2 className="font-bold sm:col-span-2">Add menu item</h2>
                <label className="text-xs font-semibold text-black/55">Category
                  <select required value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
                    <option value="">Select category…</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.parentCategoryId ? `${category.parentCategoryId.name} → ` : ""}{category.name}</option>)}
                  </select>
                </label>
                <Field label="Name" required value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} />
                <Field label="Price" required min="0" step="0.01" type="number" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} />
                <div className="flex items-end"><button disabled={!categories.length} className="w-full rounded-lg bg-forest px-3 py-2 text-sm font-bold text-white disabled:opacity-40"><Plus size={15} className="inline" /> Add item</button></div>
              </form>
            </section>

            <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-bold">Categories</h2>
                <button type="button" disabled={addingStandardCategories} onClick={addStandardCategories}
                  className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50">
                  {addingStandardCategories ? "Adding sections…" : "Add standard sections"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <div key={category._id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span className="font-semibold">{category.parentCategoryId ? `${category.parentCategoryId.name} → ` : ""}{category.name}</span>
                    <button onClick={() => beginEditCategory(category)} className="text-xs text-forest underline">Rename</button>
                    <button onClick={() => setDeleteTarget({ type: "category", item: category })} aria-label={`Delete ${category.name}`} className="text-red-500"><Trash2 size={13} /></button>
                  </div>
                ))}
                {!categories.length && <p className="text-sm text-black/45">Add a category before creating menu items.</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-bold">Menu items</h2>
                <input aria-label="Search menu items" type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search items or categories…" className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm sm:w-72" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm"><thead><tr className="border-b border-black/10 text-left text-xs text-black/45"><th className="pb-2 pr-3">Item</th><th className="pb-2 pr-3">Category</th><th className="pb-2 pr-3">Price</th><th className="pb-2 pr-3">Availability</th><th className="pb-2 text-right">Actions</th></tr></thead>
                  <tbody>{visibleProducts.map((product) => (
                    <tr key={product._id} className="border-b border-black/5">
                      <td className="py-2 pr-3 font-semibold">{product.name}</td>
                      <td className="py-2 pr-3">{(() => {
                        const category = categories.find((item) => item._id === product.categoryId?.toString());
                        return category ? `${category.parentCategoryId ? `${category.parentCategoryId.name} → ` : ""}${category.name}` : "—";
                      })()}</td>
                      <td className="py-2 pr-3">{money(product.price)}</td>
                      <td className="py-2 pr-3"><button onClick={async () => { try { await api(`/api/owner/products/${product._id}`, { method: "PATCH", body: JSON.stringify({ isAvailable: !product.isAvailable }) }); await loadMenu(); } catch (e) { setError(e.message); } }} className={`rounded-full px-2 py-1 text-xs font-semibold ${product.isAvailable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{product.isAvailable ? "Available" : "Hidden"}</button></td>
                      <td className="py-2 text-right"><button onClick={() => beginEditProduct(product)} className="mr-3 text-xs font-semibold text-forest">Edit</button><button onClick={() => setDeleteTarget({ type: "product", item: product })} aria-label={`Delete ${product.name}`} className="text-red-500"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}</tbody>
                </table>
                {!products.length && <p className="py-5 text-center text-sm text-black/45">No items in this branch menu yet.</p>}
                {products.length > 0 && !visibleProducts.length && <p className="py-5 text-center text-sm text-black/45">No menu items match your search.</p>}
              </div>
            </section>
          </div>
        )}

        {tab === "orders" && (
          <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Branch orders · latest 50</h2><button onClick={() => loadOrders().catch((e) => setError(e.message))} className="text-sm font-semibold text-forest">Refresh</button></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm"><thead><tr className="border-b border-black/10 text-left text-xs text-black/45"><th className="pb-2 pr-3">Token</th><th className="pb-2 pr-3">Customer</th><th className="pb-2 pr-3">Items</th><th className="pb-2 pr-3">Total</th><th className="pb-2 pr-3">Payment</th><th className="pb-2 pr-3">Time</th><th className="pb-2 text-right">Action</th></tr></thead>
                <tbody>{orders.map((order) => <tr key={order._id} className="border-b border-black/5"><td className="py-2 pr-3 font-mono font-bold">#{formatTokenNumber(order.tokenNumber)}</td><td className="py-2 pr-3">{order.customerName || "—"}</td><td className="py-2 pr-3">{order.items.length}</td><td className="py-2 pr-3 font-semibold">{money(order.grandTotal)}</td><td className="py-2 pr-3">{order.paymentMode}</td><td className="py-2 pr-3 text-xs text-black/45">{new Date(order.createdAt).toLocaleString("en-IN")}</td><td className="py-2 text-right"><button onClick={() => beginEditOrder(order)} className="text-xs font-semibold text-forest">Edit order</button></td></tr>)}</tbody>
              </table>
              {!orders.length && <p className="py-5 text-center text-sm text-black/45">No orders recorded for this branch.</p>}
            </div>
          </section>
        )}

      </div>

      {editingCategory && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
          <form onSubmit={saveCategory} className="my-8 w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <div>
              <h2 className="text-lg font-bold">Edit category</h2>
              <p className="text-xs text-black/50">Update the menu category name.</p>
            </div>
            <Field label="Category name" required maxLength={80} value={editingCategory.name} onChange={(event) => setEditingCategory({ ...editingCategory, name: event.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingCategory(null)} className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold">Cancel</button>
              <button className="rounded-lg bg-forest px-4 py-2 text-sm font-bold text-white">Save category</button>
            </div>
          </form>
        </div>
      )}

      {editingProduct && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
          <form onSubmit={saveProduct} className="my-8 w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <div>
              <h2 className="text-lg font-bold">Edit menu item</h2>
              <p className="text-xs text-black/50">Update the menu item name and price.</p>
            </div>
            <Field label="Menu item name" required maxLength={100} value={editingProduct.name} onChange={(event) => setEditingProduct({ ...editingProduct, name: event.target.value })} />
            <Field label="Price (₹)" required min="0" step="0.01" type="number" value={editingProduct.price} onChange={(event) => setEditingProduct({ ...editingProduct, price: event.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingProduct(null)} className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold">Cancel</button>
              <button className="rounded-lg bg-forest px-4 py-2 text-sm font-bold text-white">Save item</button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <div>
              <h2 id="delete-title" className="text-lg font-bold">Delete {deleteTarget.type === "category" ? "category" : "menu item"}?</h2>
              <p className="mt-1 text-sm text-black/55">
                Are you sure you want to delete “{deleteTarget.item.name}”?
                {deleteTarget.type === "category" && " Products in this category will not be deleted."}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={confirmDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {editingOrder && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
          <form onSubmit={saveOrder} className="my-8 w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <div><h2 className="text-lg font-bold">Update customer order</h2><p className="text-xs text-black/50">Item prices are recalculated using this branch's current menu.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-black/55">Payment mode<select value={editingOrder.paymentMode} onChange={(event) => setEditingOrder({ ...editingOrder, paymentMode: event.target.value })} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"><option value="CASH">Cash</option><option value="UPI">UPI</option></select></label>
            </div>
            <Field label="Customer notes" value={editingOrder.notes} onChange={(event) => setEditingOrder({ ...editingOrder, notes: event.target.value })} />
            <div className="space-y-2">
              {editingOrder.items.map((item) => {
                const currentPrice = products.find((product) => product._id === item.productId)?.price ?? item.unitPrice;
                return <div key={item.productId} className="space-y-2 rounded-lg bg-gray-50 p-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>{item.name} · {money(currentPrice)}</span>
                    <input aria-label={`${item.name} quantity`} type="number" min="0" max="999" value={item.quantity} onChange={(event) => setEditingOrder({ ...editingOrder, items: editingOrder.items.map((entry) => entry.productId === item.productId ? { ...entry, quantity: event.target.value } : entry) })} className="w-20 rounded border border-black/10 px-2 py-1" />
                  </div>
                  <input aria-label={`${item.name} special note`} maxLength={300} placeholder={`Special note for ${item.name}…`} value={item.specialNote} onChange={(event) => setEditingOrder({ ...editingOrder, items: editingOrder.items.map((entry) => entry.productId === item.productId ? { ...entry, specialNote: event.target.value } : entry) })} className="w-full rounded border border-black/10 px-2 py-1.5 text-xs" />
                </div>;
              })}
            </div>
            <div className="space-y-3">
              <p className="text-right text-sm font-bold">Updated total: {money(editingTotal)}</p>
              {editingOrder.paymentMode === "UPI" && (
                <OrderPaymentQr paymentSettings={paymentSettings} amount={editingTotal} tokenNumber={editingOrder.tokenNumber} />
              )}
            </div>
            <div className="flex gap-2">
              <select value={newOrderProduct} onChange={(event) => setNewOrderProduct(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"><option value="">Add an available menu item…</option>{products.filter((product) => product.isAvailable).map((product) => <option key={product._id} value={product._id}>{product.name} · {money(product.price)}</option>)}</select>
              <button type="button" onClick={addOrderProduct} className="rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold"><Plus size={14} className="inline" /> Add</button>
            </div>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingOrder(null)} className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold">Cancel</button><button className="rounded-lg bg-forest px-4 py-2 text-sm font-bold text-white">Save order</button></div>
          </form>
        </div>
      )}
    </main>
  );
}

export default BranchManagerPage;
