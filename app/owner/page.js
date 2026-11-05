"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen, ClipboardList, CreditCard, KeyRound, LogOut,
  Package, Plus, RefreshCw, ShoppingBag,
  Save, Trash2, Users, Utensils,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTokenNumber } from "@/lib/order-token";
import { standardMenuCategories } from "@/lib/menu-categories";

const money = v =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v);

const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
};

// ── Shared UI ──────────────────────────────────────────────────────────────
function Btn({ children, variant = "primary", size = "md", ...p }) {
  const base = "rounded-lg font-semibold transition disabled:opacity-40 inline-flex items-center gap-1.5";
  const pad  = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const v    = {
    primary:   "bg-forest text-white hover:bg-green-800",
    secondary: "border border-black/10 bg-white hover:bg-gray-50 text-black",
    danger:    "bg-red-50 text-red-600 hover:bg-red-100",
    warning:   "bg-amber-50 text-amber-700 hover:bg-amber-100",
  };
  return <button className={`${base} ${pad} ${v[variant]}`} {...p}>{children}</button>;
}

function Inp({ label, ...p }) {
  return (
    <label className="block text-xs font-semibold text-black/55">
      {label}
      <input {...p} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-forest" />
    </label>
  );
}

function Sel({ label, children, ...p }) {
  return (
    <label className="block text-xs font-semibold text-black/55">
      {label}
      <select {...p} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-forest">
        {children}
      </select>
    </label>
  );
}

function Msg({ text, err }) {
  if (!text) return null;
  return (
    <p className={`mt-2 rounded-lg p-2.5 text-xs ${err ? "bg-red-50 text-red-600" : "bg-[#e7f2eb] text-green-800"}`}>
      {text}
    </p>
  );
}

function Card({ title, icon: Icon, children, action }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e7f2eb] text-forest">
            <Icon size={16} />
          </span>
          <h2 className="font-bold">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ConfirmDialog({ title, message, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div>
          <h2 id="confirm-title" className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-black/55">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Btn type="button" variant="secondary" onClick={onCancel}>Cancel</Btn>
          <Btn type="button" variant="danger" onClick={onConfirm}>Delete</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Stats Dashboard ────────────────────────────────────────────────────────
function Stats() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await api("/api/owner/summary"))); }
    catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = [
    { label: "Today's Orders",   value: loading ? "…" : (data?.todayOrders ?? 0),         sub: "orders placed today" },
    { label: "Today's Sales",    value: loading ? "…" : money(data?.todaySales ?? 0),      sub: `Cash ${money(data?.todayCash ?? 0)} · UPI ${money(data?.todayUpi ?? 0)}` },
    { label: "All-Time Orders",  value: loading ? "…" : (data?.totalOrders ?? 0),          sub: "total orders" },
    { label: "Staff (Captains)", value: loading ? "…" : (data?.staffCount ?? 0),           sub: "billing operators" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map(s => (
        <div key={s.label} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/40">{s.label}</p>
          <p className="mt-1 text-2xl font-bold">{s.value}</p>
          <p className="mt-1 text-xs text-black/40">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ── Orders ─────────────────────────────────────────────────────────────────
function Orders() {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setOrders((await api("/api/owner/orders")).orders); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Card title="Recent Orders (last 50)" icon={ClipboardList}
      action={<Btn variant="secondary" size="sm" onClick={load}><RefreshCw size={12} />Refresh</Btn>}>
      {loading ? <p className="py-6 text-center text-xs text-black/40">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs text-black/40">
                <th className="pb-2 pr-3">Token</th>
                <th className="pb-2 pr-3">Customer</th>
                <th className="pb-2 pr-3">Items</th>
                <th className="pb-2 pr-3">Total</th>
                <th className="pb-2 pr-3">Payment</th>
                <th className="pb-2">Date & Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o._id} className="border-b border-black/5 hover:bg-gray-50">
                  <td className="py-2 pr-3 font-mono font-bold">#{formatTokenNumber(o.tokenNumber)}</td>
                  <td className="py-2 pr-3 text-black/50">{o.customerName || "—"}</td>
                  <td className="py-2 pr-3 text-xs text-black/50">{o.items?.length} item(s)</td>
                  <td className="py-2 pr-3 font-semibold">{money(o.grandTotal)}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.paymentMode === "UPI" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                      {o.paymentMode}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-black/40">{new Date(o.createdAt).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orders.length && <p className="py-6 text-center text-xs text-black/40">No orders yet.</p>}
        </div>
      )}
    </Card>
  );
}

function PaymentSettings() {
  const [settings, setSettings] = useState({ upiId: "", upiPayerName: "", upiCurrency: "INR" });
  const [message, setMessage] = useState({ text: "", err: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/api/owner/payment-settings")
      .then((data) => setSettings(data.paymentSettings))
      .catch((error) => setMessage({ text: error.message, err: true }))
      .finally(() => setLoading(false));
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage({ text: "", err: false });
    try {
      const data = await api("/api/owner/payment-settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(data.paymentSettings);
      setMessage({ text: data.paymentSettings.upiId ? "UPI payment details saved." : "UPI payment QR disabled.", err: false });
    } catch (error) {
      setMessage({ text: error.message, err: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Customer UPI payment QR" icon={CreditCard}>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
        <Inp label="UPI ID" autoComplete="off" placeholder="payments@example" value={settings.upiId} onChange={(event) => setSettings({ ...settings, upiId: event.target.value })} />
        <Inp label="UPI payer name" autoComplete="name" placeholder="Restaurant name" value={settings.upiPayerName} onChange={(event) => setSettings({ ...settings, upiPayerName: event.target.value })} />
        <label className="block text-xs font-semibold text-black/55">
          UPI amount currency
          <select disabled className="mt-1 w-full rounded-lg border border-black/10 bg-gray-100 px-3 py-2 text-sm text-black">
            <option value="INR">INR — Indian Rupee (required by UPI)</option>
          </select>
        </label>
        <p className="text-xs text-black/45 sm:col-span-2">When configured, bills include a payment QR for the exact order total. Clear both UPI fields to disable QR payments.</p>
        <div className="flex items-end sm:justify-end">
          <Btn type="submit" disabled={saving || loading}><Save size={14} />{saving ? "Saving…" : "Save UPI details"}</Btn>
        </div>
      </form>
      <Msg {...message} />
    </Card>
  );
}

// ── Menu Tab (Categories + Products) ──────────────────────────────────────
function MenuTab({ branches }) {
  const [categories, setCategories] = useState([]);
  const [products,   setProducts]   = useState([]);
  const [catMsg,  setCatMsg]  = useState({ text: "", err: false });
  const [prodMsg, setProdMsg] = useState({ text: "", err: false });
  const [productSearch, setProductSearch] = useState("");
  const [catForm,  setCatForm]  = useState({ branchId: "", name: "", parentCategoryId: "" });
  const [prodForm, setProdForm] = useState({ branchId: "", categoryId: "", name: "", price: "", costPrice: "" });
  const [showCatForm,  setShowCatForm]  = useState(false);
  const [standardBranchId, setStandardBranchId] = useState("");
  const [showStandardCategories, setShowStandardCategories] = useState(false);
  const [addingStandardCategories, setAddingStandardCategories] = useState(false);
  const [showProdForm, setShowProdForm] = useState(false);
  const [editProd, setEditProd] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadCats  = useCallback(async () => {
    try { setCategories((await api("/api/owner/categories")).categories); } catch {}
  }, []);
  const loadProds = useCallback(async () => {
    try { setProducts((await api("/api/owner/products")).products); } catch {}
  }, []);

  useEffect(() => { loadCats(); loadProds(); }, [loadCats, loadProds]);

  // ── categories ──
  async function createCat(e) {
    e.preventDefault();
    try {
      await api("/api/owner/categories", { method: "POST", body: JSON.stringify({ ...catForm, parentCategoryId: catForm.parentCategoryId || null }) });
      setCatMsg({ text: `Category "${catForm.name}" created.`, err: false });
      setCatForm({ branchId: "", name: "", parentCategoryId: "" }); setShowCatForm(false); loadCats();
    } catch (err) { setCatMsg({ text: err.message, err: true }); }
  }
  async function addStandardCategories() {
    if (!standardBranchId || addingStandardCategories) return;
    setAddingStandardCategories(true);
    setCatMsg({ text: "", err: false });
    const branchCategories = categories.filter((category) =>
      String(category.branchId?._id ?? category.branchId) === standardBranchId,
    );
    const findCategory = (name, parentId = null) => branchCategories.find((category) =>
      category.name.trim().toLowerCase() === name.toLowerCase() &&
      String(category.parentCategoryId?._id ?? category.parentCategoryId ?? "") === (parentId || ""),
    );
    const createCategory = async (name, parentCategoryId = null) => {
      const existing = findCategory(name, parentCategoryId);
      if (existing) return String(existing._id);
      const { category } = await api("/api/owner/categories", {
        method: "POST",
        body: JSON.stringify({ branchId: standardBranchId, name, parentCategoryId }),
      });
      branchCategories.push(category);
      return String(category._id);
    };

    try {
      for (const section of standardMenuCategories) {
        const parentId = await createCategory(section.name);
        for (const child of section.children || []) await createCategory(child, parentId);
      }
      setCatMsg({ text: "Standard menu sections are ready for this branch.", err: false });
      await loadCats();
    } catch (err) {
      setCatMsg({ text: err.message, err: true });
      await loadCats();
    } finally {
      setAddingStandardCategories(false);
    }
  }
  // ── products ──
  const filteredCats = categories.filter(c => !prodForm.branchId || String(c.branchId?._id ?? c.branchId) === prodForm.branchId);
  const visibleProducts = products.filter((product) => {
    const category = categories.find((item) => item._id === product.categoryId?.toString());
    const categoryName = category ? `${category.parentCategoryId?.name || ""} ${category.name}` : "";
    return `${product.name} ${categoryName} ${product.branchId?.name || ""}`
      .toLowerCase()
      .includes(productSearch.trim().toLowerCase());
  });

  async function createProd(e) {
    e.preventDefault();
    try {
      await api("/api/owner/products", { method: "POST", body: JSON.stringify({ ...prodForm, price: Number(prodForm.price), costPrice: prodForm.costPrice === "" ? null : Number(prodForm.costPrice) }) });
      setProdMsg({ text: `"${prodForm.name}" added to menu.`, err: false });
      setProdForm({ branchId: "", categoryId: "", name: "", price: "", costPrice: "" }); setShowProdForm(false); loadProds();
    } catch (err) { setProdMsg({ text: err.message, err: true }); }
  }
  async function saveEdit() {
    if (!editProd) return;
    try {
      await api(`/api/owner/products/${editProd._id}`, { method: "PATCH", body: JSON.stringify({ name: editProd.name, price: Number(editProd.price), costPrice: editProd.costPrice === "" ? null : Number(editProd.costPrice) }) });
      setProdMsg({ text: "Item updated.", err: false }); setEditProd(null); loadProds();
    } catch (err) { setProdMsg({ text: err.message, err: true }); }
  }
  async function toggleAvail(p) {
    try { await api(`/api/owner/products/${p._id}`, { method: "PATCH", body: JSON.stringify({ isAvailable: !p.isAvailable }) }); loadProds(); }
    catch (err) { setProdMsg({ text: err.message, err: true }); }
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    const { type, id, name } = deleteTarget;
    try {
      await api(`/api/owner/${type === "category" ? "categories" : "products"}/${id}`, { method: "DELETE" });
      setDeleteTarget(null);
      if (type === "category") loadCats();
      else loadProds();
    } catch (err) {
      setDeleteTarget(null);
      if (type === "category") setCatMsg({ text: err.message, err: true });
      else setProdMsg({ text: err.message, err: true });
    }
  }

  return (
    <>
    <div className="space-y-5">
      {/* ── Categories ── */}
      <Card title="Menu Categories" icon={BookOpen}
        action={<div className="flex flex-wrap gap-2">
          <Btn variant="secondary" size="sm" disabled={!branches.length} onClick={() => {
            setStandardBranchId((current) => current || branches[0]?._id || "");
            setShowStandardCategories((current) => !current);
          }}>Standard Sections</Btn>
          <Btn size="sm" onClick={() => setShowCatForm(o => !o)}><Plus size={12} />{showCatForm ? "Cancel" : "Add Category"}</Btn>
        </div>}>
        {showStandardCategories && (
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-black/10 bg-gray-50 p-4">
            <Sel label="Branch for standard sections" required value={standardBranchId} onChange={(event) => setStandardBranchId(event.target.value)}>
              <option value="">Select branch…</option>
              {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
            </Sel>
            <Btn size="sm" disabled={addingStandardCategories || !standardBranchId} onClick={addStandardCategories}>
              {addingStandardCategories ? "Adding…" : "Add standard sections"}
            </Btn>
            <Btn variant="secondary" size="sm" onClick={() => { setShowStandardCategories(false); setStandardBranchId(""); }}>Cancel</Btn>
          </div>
        )}
        {showCatForm && (
          <form onSubmit={createCat} className="mb-4 grid gap-3 rounded-xl border border-black/10 bg-gray-50 p-4 sm:grid-cols-4">
            <Sel label="Branch" required value={catForm.branchId} onChange={e => setCatForm(f => ({ ...f, branchId: e.target.value, parentCategoryId: "" }))}>
              <option value="">Select branch…</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </Sel>
            <Sel label="Parent category" value={catForm.parentCategoryId} onChange={e => setCatForm(f => ({ ...f, parentCategoryId: e.target.value }))}>
              <option value="">Top-level category</option>
              {categories.filter((category) =>
                String(category.branchId?._id ?? category.branchId) === catForm.branchId && !category.parentCategoryId,
              ).map(category => <option key={category._id} value={category._id}>{category.name}</option>)}
            </Sel>
            <Inp label="Category Name" required value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} />
            <div className="flex items-end">
              <Btn size="sm" type="submit">Create</Btn>
            </div>
          </form>
        )}
        <Msg {...catMsg} />
        {categories.length === 0
          ? <p className="py-4 text-center text-xs text-black/40">No categories yet. Add one to start building your menu.</p>
          : (
            <div className="mt-1 flex flex-wrap gap-2">
              {categories.map(c => (
                <div key={c._id} className="flex items-center gap-1.5 rounded-full border border-black/10 bg-gray-50 px-3 py-1 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-black/40">· {c.branchId?.name}</span>
                  <button onClick={() => setDeleteTarget({ type: "category", id: c._id, name: c.name })} className="ml-1 text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
      </Card>

      {/* ── Products ── */}
      <Card title="Menu Items" icon={Utensils}
        action={<Btn size="sm" onClick={() => setShowProdForm(o => !o)}><Plus size={12} />{showProdForm ? "Cancel" : "Add Item"}</Btn>}>
        {showProdForm && (
          <form onSubmit={createProd} className="mb-4 grid gap-3 rounded-xl border border-black/10 bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <Sel label="Branch" required value={prodForm.branchId} onChange={e => setProdForm(f => ({ ...f, branchId: e.target.value, categoryId: "" }))}>
              <option value="">Select branch…</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </Sel>
            <Sel label="Category" required value={prodForm.categoryId} onChange={e => setProdForm(f => ({ ...f, categoryId: e.target.value }))}>
              <option value="">Select category…</option>
              {filteredCats.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </Sel>
            <Inp label="Item Name" required value={prodForm.name} onChange={e => setProdForm(f => ({ ...f, name: e.target.value }))} />
            <Inp label="Price (₹)" type="number" min="0" step="0.5" required value={prodForm.price} onChange={e => setProdForm(f => ({ ...f, price: e.target.value }))} />
            <Inp label="Cost price (₹)" type="number" min="0" step="0.01" value={prodForm.costPrice} onChange={e => setProdForm(f => ({ ...f, costPrice: e.target.value }))} />
            <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
              <Btn size="sm" type="submit">Add to Menu</Btn>
            </div>
          </form>
        )}
        <Msg {...prodMsg} />
        <input aria-label="Search menu items" type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search items, categories, or branches…" className="mb-3 w-full rounded-lg border border-black/10 px-3 py-2 text-sm sm:max-w-md" />

        {products.length === 0
          ? <p className="py-4 text-center text-xs text-black/40">No menu items yet. Add a category first, then add items.</p>
          : (
            <div className="mt-1 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs text-black/40">
                    <th className="pb-2 pr-3">Item Name</th>
                    <th className="pb-2 pr-3">Price</th>
                    <th className="pb-2 pr-3">Cost</th>
                    <th className="pb-2 pr-3">Branch</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map(p => (
                    editProd?._id === p._id ? (
                      <tr key={p._id} className="border-b border-forest/20 bg-[#f0faf4]">
                        <td className="py-2 pr-3">
                          <input value={editProd.name} onChange={e => setEditProd(d => ({ ...d, name: e.target.value }))}
                            className="w-full rounded border border-black/10 px-2 py-1 text-sm outline-none focus:border-forest" />
                        </td>
                        <td className="py-2 pr-3">
                          <input type="number" value={editProd.price} onChange={e => setEditProd(d => ({ ...d, price: e.target.value }))}
                            className="w-24 rounded border border-black/10 px-2 py-1 text-sm outline-none focus:border-forest" />
                        </td>
                        <td className="py-2 pr-3">
                          <input aria-label="Cost price" type="number" min="0" step="0.01" value={editProd.costPrice} onChange={e => setEditProd(d => ({ ...d, costPrice: e.target.value }))}
                            className="w-24 rounded border border-black/10 px-2 py-1 text-sm outline-none focus:border-forest" />
                        </td>
                        <td className="py-2 pr-3 text-xs text-black/40">{p.branchId?.name}</td>
                        <td className="py-2 pr-3"></td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Btn size="sm" onClick={saveEdit}>Save</Btn>
                            <Btn size="sm" variant="secondary" onClick={() => setEditProd(null)}>Cancel</Btn>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={p._id} className="border-b border-black/5 hover:bg-gray-50">
                        <td className="py-2 pr-3 font-semibold">{p.name}</td>
                        <td className="py-2 pr-3">{money(p.price)}</td>
                        <td className="py-2 pr-3">{p.costPrice == null ? "—" : money(p.costPrice)}</td>
                        <td className="py-2 pr-3 text-xs text-black/50">{p.branchId?.name}</td>
                        <td className="py-2 pr-3">
                          <button onClick={() => toggleAvail(p)}
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold transition ${p.isAvailable ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                            {p.isAvailable ? "✓ Available" : "✗ Hidden"}
                          </button>
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Btn size="sm" variant="secondary" onClick={() => setEditProd({ _id: p._id, name: p.name, price: p.price, costPrice: p.costPrice ?? "" })}>Edit</Btn>
                            <button onClick={() => setDeleteTarget({ type: "product", id: p._id, name: p.name })} className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
              {!visibleProducts.length && <p className="py-5 text-center text-sm text-black/45">No menu items match your search.</p>}
            </div>
          )}
      </Card>
    </div>
    {deleteTarget && (
      <ConfirmDialog
        title={`Delete ${deleteTarget.type === "category" ? "category" : "menu item"}?`}
        message={deleteTarget.type === "category"
          ? `Delete category "${deleteTarget.name}"? Products in it won't be deleted.`
          : `Delete "${deleteTarget.name}" from menu?`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    )}
    </>
  );
}

// ── Staff ──────────────────────────────────────────────────────────────────
function StaffTab({ branches }) {
  const [staff,     setStaff]     = useState([]);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState({ loginId: "", password: "", branchId: "" });
  const [resetId,   setResetId]   = useState(null);
  const [newPass,   setNewPass]   = useState("");
  const [msg,       setMsg]       = useState({ text: "", err: false });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    try { setStaff((await api("/api/owner/staff")).staff); }
    catch (err) { setMsg({ text: err.message, err: true }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    try {
      await api("/api/owner/staff", { method: "POST", body: JSON.stringify(form) });
      setMsg({ text: `Staff "${form.loginId}" created. They will be asked to set a new password on first login.`, err: false });
      setForm({ loginId: "", password: "", branchId: "" }); setShowForm(false); load();
    } catch (err) { setMsg({ text: err.message, err: true }); }
  }
  async function resetPass(id) {
    if (!newPass || newPass.length < 6) { setMsg({ text: "Password must be at least 6 characters.", err: true }); return; }
    try {
      await api(`/api/owner/staff/${id}`, { method: "PATCH", body: JSON.stringify({ password: newPass }) });
      setMsg({ text: "Password reset successfully.", err: false }); setResetId(null); setNewPass("");
    } catch (err) { setMsg({ text: err.message, err: true }); }
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/api/owner/staff/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteTarget(null);
      setMsg({ text: err.message, err: true });
    }
  }

  return (
    <Card title="Staff — Billing Operators (Captains)" icon={Users}
      action={<Btn size="sm" onClick={() => setShowForm(o => !o)}><Plus size={12} />{showForm ? "Cancel" : "Add Staff"}</Btn>}>
      {showForm && (
        <form onSubmit={create} className="mb-4 grid gap-3 rounded-xl border border-black/10 bg-gray-50 p-4 sm:grid-cols-3">
          <Inp label="Login ID" required value={form.loginId} onChange={e => setForm(f => ({ ...f, loginId: e.target.value }))} />
          <Inp label="Temporary Password" type="password" required value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          <Sel label="Assign to Branch" required value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}>
            <option value="">Select branch…</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </Sel>
          <div className="sm:col-span-3 flex justify-end">
            <Btn size="sm" type="submit">Create Staff</Btn>
          </div>
        </form>
      )}
      <Msg {...msg} />
      <table className="mt-1 w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-xs text-black/40">
            <th className="pb-2 pr-3">Login ID</th>
            <th className="pb-2 pr-3">Active</th>
            <th className="pb-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {staff.map(s => (
            <>
              <tr key={s._id} className="border-b border-black/5 hover:bg-gray-50">
                <td className="py-2 pr-3 font-semibold">{s.loginId}</td>
                <td className="py-2 pr-3">
                  <span className={`text-xs font-semibold ${s.isActive ? "text-green-600" : "text-red-500"}`}>
                    {s.isActive ? "Yes" : "No"}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Btn size="sm" variant="warning" onClick={() => { setResetId(resetId === s._id ? null : s._id); setNewPass(""); }}>
                      <KeyRound size={12} />Reset Pass
                    </Btn>
                    <button onClick={() => setDeleteTarget({ id: s._id, loginId: s.loginId })} className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
              {resetId === s._id && (
                <tr key={`reset-${s._id}`} className="bg-amber-50">
                  <td colSpan={3} className="px-3 py-2">
                    <div className="flex gap-2">
                      <input type="password" placeholder="New password (min 6 chars)" value={newPass}
                        onChange={e => setNewPass(e.target.value)}
                        className="flex-1 rounded-lg border border-black/10 px-3 py-1.5 text-sm outline-none focus:border-forest" />
                      <Btn size="sm" onClick={() => resetPass(s._id)}>Save</Btn>
                      <Btn size="sm" variant="secondary" onClick={() => { setResetId(null); setNewPass(""); }}>Cancel</Btn>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
      {!staff.length && <p className="py-4 text-center text-xs text-black/40">No staff yet. Add a captain above to allow billing at the counter.</p>}
      {deleteTarget && (
        <ConfirmDialog
          title="Remove staff member?"
          message={`Remove staff member "${deleteTarget.loginId}"?`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </Card>
  );
}

function CostPriceSettings() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState({});
  const [message, setMessage] = useState({ text: "", err: false });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setProducts((await api("/api/owner/products")).products);
    } catch (error) {
      setMessage({ text: error.message, err: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const visibleProducts = products.filter((product) =>
    `${product.name} ${product.branchId?.name || ""}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  async function save(product) {
    try {
      const value = editing[product._id];
      await api(`/api/owner/products/${product._id}`, {
        method: "PATCH",
        body: JSON.stringify({ costPrice: value === "" ? null : Number(value) }),
      });
      setMessage({ text: `Cost price saved for ${product.name}.`, err: false });
      await load();
    } catch (error) {
      setMessage({ text: error.message, err: true });
    }
  }

  return (
    <Card title="Menu item cost prices" icon={Utensils}>
      <p className="mb-3 text-xs text-black/50">Discounts are limited by each item’s cost price. Set accurate costs here; items without a cost price cannot be discounted.</p>
      <Msg {...message} />
    <input aria-label="Search menu item cost prices" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items or branches…" className="mb-3 w-full rounded-lg border border-black/10 px-3 py-2 text-sm sm:max-w-sm" />
    {loading ? <p className="py-5 text-center text-sm text-black/45">Loading menu costs…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-black/10 text-left text-xs text-black/45">
              <th className="pb-2 pr-3">Item</th><th className="pb-2 pr-3">Branch</th><th className="pb-2 pr-3">Selling price</th><th className="pb-2 pr-3">Cost price</th><th className="pb-2 pr-3">Max safe discount</th><th className="pb-2">Action</th>
            </tr></thead>
            <tbody>{visibleProducts.map((product) => {
              const value = editing[product._id] ?? (product.costPrice == null ? "" : String(product.costPrice));
              const cost = value === "" ? null : Number(value);
              const maxDiscount = cost == null || product.price <= 0
                ? 0
                : Math.max(0, Math.floor(((product.price - cost) / product.price) * 100));
              return (
                <tr key={product._id} className="border-b border-black/5">
                  <td className="py-2 pr-3 font-semibold">{product.name}</td>
                  <td className="py-2 pr-3 text-black/50">{product.branchId?.name || "—"}</td>
                  <td className="py-2 pr-3">{money(product.price)}</td>
                  <td className="py-2 pr-3"><input aria-label={`${product.name} cost price`} type="number" min="0" max={product.price} step="0.01" value={value} onChange={(event) => setEditing({ ...editing, [product._id]: event.target.value })} className="w-28 rounded-lg border border-black/10 px-2 py-1.5" /></td>
                  <td className="py-2 pr-3">{cost == null ? "Set cost to enable" : `${maxDiscount}%`}</td>
                  <td className="py-2"><Btn size="sm" onClick={() => save(product)}>Save</Btn></td>
                </tr>
              );
            })}</tbody>
          </table>
          {!products.length && <p className="py-5 text-center text-sm text-black/45">No menu items found.</p>}
          {products.length > 0 && !visibleProducts.length && <p className="py-5 text-center text-sm text-black/45">No menu items match your search.</p>}
        </div>
      )}
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function OwnerPage() {
  const [session,    setSession]    = useState(null);
  const [denied,     setDenied]     = useState(false);
  const [activePage, setActivePage] = useState("dashboard");
  const [branches,   setBranches]   = useState([]);
  const [branchId,   setBranchId]   = useState("");
  const [analytics,  setAnalytics]  = useState(null);
  const [orders,     setOrders]     = useState([]);
  const [ordersHasMore, setOrdersHasMore] = useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const ordersContext = useRef("");
  const [error,      setError]      = useState("");
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    api("/api/session")
      .then(d => {
        if (d.user?.role !== "OWNER") { setDenied(true); return; }
        setSession(d.user);
      })
      .catch(() => setDenied(true));
  }, []);

  useEffect(() => {
    if (!session) return;
    api("/api/owner/branches")
      .then(d => {
        setBranches(d.branches);
        setError("");
      })
      .catch(err => setError(err.message));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const branchQuery = branchId ? `&branchId=${encodeURIComponent(branchId)}` : "";
    let active = true;
    ordersContext.current = branchId;
    setOrders([]);
    setOrdersHasMore(false);
    setLoadingMoreOrders(false);
    setLoading(true);
    setError("");
    Promise.all([
      api(`/api/owner/summary${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""}`),
      api(`/api/owner/orders?skip=0&limit=50${branchQuery}`),
    ])
      .then(([summary, orderData]) => {
        if (!active) return;
        setAnalytics(summary);
        setOrders(orderData.orders);
        setOrdersHasMore(orderData.hasMore);
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session, branchId]);

  async function loadMoreOrders() {
    if (loadingMoreOrders || !ordersHasMore) return;
    const requestContext = branchId;
    setLoadingMoreOrders(true);
    try {
      const branchQuery = branchId ? `&branchId=${encodeURIComponent(branchId)}` : "";
      const data = await api(`/api/owner/orders?skip=${orders.length}&limit=50${branchQuery}`);
      if (ordersContext.current !== requestContext) return;
      setOrders((current) => [...current, ...data.orders]);
      setOrdersHasMore(data.hasMore);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      if (ordersContext.current === requestContext) setLoadingMoreOrders(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  if (denied) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f0]">
      <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
        <h1 className="text-lg font-bold">Access Denied</h1>
        <p className="mt-1 text-sm text-black/50">Owner access required.</p>
        <a href="/" className="mt-4 inline-block rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white">Go to Login</a>
      </div>
    </div>
  );

  if (!session) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f0]">
      <p className="text-sm text-black/40">Loading owner dashboard…</p>
    </div>
  );

  const summary = analytics?.summary || {};

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-forest text-white">
            <Package size={20} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-forest">Owner Panel</p>
            <h1 className="text-lg font-bold">Restaurant Dashboard</h1>
          </div>
        </div>
        <nav aria-label="Owner navigation" className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setActivePage("dashboard")} aria-current={activePage === "dashboard" ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${activePage === "dashboard" ? "bg-[#e7f2eb] text-forest" : "hover:bg-gray-50"}`}>
            Dashboard
          </button>
          <button type="button" onClick={() => setActivePage("payment-settings")} aria-current={activePage === "payment-settings" ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${activePage === "payment-settings" ? "bg-[#e7f2eb] text-forest" : "hover:bg-gray-50"}`}>
            Customer UPI payment QR
          </button>
          <button type="button" onClick={() => setActivePage("cost-prices")} aria-current={activePage === "cost-prices" ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${activePage === "cost-prices" ? "bg-[#e7f2eb] text-forest" : "hover:bg-gray-50"}`}>
            Menu item cost prices
          </button>
          <button onClick={logout}
            className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50">
            <LogOut size={15} /> Log out
          </button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 p-5">
        {activePage === "payment-settings" ? <PaymentSettings /> : activePage === "cost-prices" ? <CostPriceSettings /> : (
          <>
        <section className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-forest">ERP overview</p>
            <h2 className="mt-1 text-xl font-bold">All branch performance</h2>
            <p className="mt-1 text-sm text-black/50">View sales, orders, and menu coverage. Branch operations are managed by Branch Managers.</p>
          </div>
          <label className="min-w-52 text-xs font-semibold text-black/55">
            Branch
            <select value={branchId} onChange={event => setBranchId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black">
              <option value="">All branches</option>
              {branches.map(branch => <option key={branch._id} value={branch._id}>{branch.name} ({branch.code})</option>)}
            </select>
          </label>
        </section>

        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!branches.length && !loading && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No branches found for your restaurant yet.</p>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Today's sales", money(summary.todaySales || 0), `Cash ${money(summary.todayCash || 0)} · UPI ${money(summary.todayUpi || 0)}`],
            ["Today's orders", summary.todayOrders ?? "—", "orders placed today"],
            ["Total sales", money(summary.totalSales || 0), `${summary.totalOrders ?? 0} orders recorded`],
            ["Menu & team", `${summary.productCount ?? "—"} items`, `${summary.managerCount ?? 0} branch managers`],
          ].map(([label, value, sub]) => (
            <article key={label} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-black/40">{label}</p>
              <p className="mt-1 text-2xl font-bold">{loading ? "…" : value}</p>
              <p className="mt-1 text-xs text-black/45">{sub}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-bold">Branch performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-black/10 text-left text-xs text-black/45">
                <th className="pb-2 pr-3">Branch</th><th className="pb-2 pr-3">Today</th>
                <th className="pb-2 pr-3">All-time sales</th><th className="pb-2">Orders</th>
              </tr></thead>
              <tbody>
                {(analytics?.branches || []).map(branch => (
                  <tr key={branch._id} className="border-b border-black/5">
                    <td className="py-2 pr-3 font-semibold">{branch.name} <span className="text-xs text-black/40">({branch.code})</span></td>
                    <td className="py-2 pr-3">{money(branch.todaySales || 0)}</td>
                    <td className="py-2 pr-3">{money(branch.sales || 0)}</td>
                    <td className="py-2">{branch.orders || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !analytics?.branches?.length && <p className="py-5 text-center text-sm text-black/45">No branch data available.</p>}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-bold">Daily sales · last 14 days</h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.dailySales || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={date => date.slice(5)} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={value => `₹${value}`} tick={{ fontSize: 11 }} width={65} />
                  <Tooltip formatter={value => money(value)} labelFormatter={date => new Date(`${date}T00:00:00`).toLocaleDateString("en-IN")} />
                  <Bar dataKey="sales" fill="#285d43" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {(analytics?.dailySales || []).map(day => (
                <div key={day.date} className="flex justify-between border-b border-black/5 py-2 text-sm">
                  <span>{new Date(`${day.date}T00:00:00`).toLocaleDateString("en-IN")}</span>
                  <span className="font-semibold">{money(day.sales)} <span className="font-normal text-black/45">· {day.orders} orders</span></span>
                </div>
              ))}
              {!loading && !analytics?.dailySales?.length && <p className="py-5 text-center text-sm text-black/45">No sales recorded in this period.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-bold">Recent orders</h3>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-black/10 text-left text-xs text-black/45">
                  <th className="pb-2 pr-2">Branch</th><th className="pb-2 pr-2">Token</th>
                  <th className="pb-2 pr-2">Food dishes</th><th className="pb-2 pr-2">Total</th><th className="pb-2">Time</th>
                </tr></thead>
                <tbody>{orders.map(order => (
                  <tr key={order._id} className="border-b border-black/5">
                    <td className="py-2 pr-2">{order.branchId?.name || "—"}</td>
                    <td className="py-2 pr-2 font-mono">#{formatTokenNumber(order.tokenNumber)}</td>
                    <td className="py-2 pr-2 text-xs">
                      {order.items?.length
                        ? order.items.map((item, index) => (
                          <span key={`${order._id}-${item.productId || item.name}-${index}`} className="block">
                            {item.quantity > 1 ? `${item.quantity} × ` : ""}{item.name}
                            {item.specialNote && <span className="block text-amber-800">Note: {item.specialNote}</span>}
                          </span>
                        ))
                        : "—"}
                    </td>
                    <td className="py-2 pr-2 font-semibold">{money(order.grandTotal)}</td>
                    <td className="py-2 text-xs text-black/45">{new Date(order.createdAt).toLocaleString("en-IN")}</td>
                  </tr>
                ))}</tbody>
              </table>
              {!loading && !orders.length && <p className="py-5 text-center text-sm text-black/45">No orders yet.</p>}
            </div>
            {ordersHasMore && (
              <div className="mt-3 text-center">
                <Btn variant="secondary" onClick={loadMoreOrders} disabled={loadingMoreOrders}>
                  {loadingMoreOrders ? "Loading…" : "Show more orders"}
                </Btn>
              </div>
            )}
          </div>
        </section>
          </>
        )}
      </main>
    </div>
  );
}
