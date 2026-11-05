"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  GitBranch,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

// ─── helpers ───────────────────────────────────────────────────────────────
const api = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
};

// ─── small shared components ───────────────────────────────────────────────
function Card({ title, icon: Icon, children }) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e7f2eb] text-forest">
          <Icon size={17} />
        </span>
        <h2 className="font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Badge({ role }) {
  const colours = {
    SUPERADMIN: "bg-purple-100 text-purple-700",
    OWNER: "bg-blue-100 text-blue-700",
    BRANCH_MANAGER: "bg-green-100 text-green-700",
    CAPTAIN: "bg-green-100 text-green-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colours[role] || "bg-gray-100 text-gray-600"}`}>
      {role}
    </span>
  );
}

function Msg({ text, err }) {
  if (!text) return null;
  return (
    <p className={`mt-3 rounded-lg p-3 text-xs ${err ? "bg-red-50 text-red-600" : "bg-[#e7f2eb] text-green-800"}`}>
      {text}
    </p>
  );
}

function Input({ label, ...props }) {
  return (
    <label className="block text-xs font-semibold text-black/55">
      {label}
      <input
        {...props}
        className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm text-black outline-none focus:border-forest"
      />
    </label>
  );
}

function Btn({ children, variant = "primary", size = "md", ...props }) {
  const base = "rounded-lg font-semibold transition disabled:opacity-40";
  const pad = size === "sm" ? "px-2 py-1 text-xs" : "px-4 py-2 text-sm";
  const styles = {
    primary:   "bg-forest text-white hover:bg-green-800",
    secondary: "border border-black/10 bg-white hover:bg-gray-50",
    danger:    "bg-red-50 text-red-600 hover:bg-red-100",
    warning:   "bg-amber-50 text-amber-700 hover:bg-amber-100",
  };
  return <button className={`${base} ${pad} ${styles[variant]}`} {...props}>{children}</button>;
}

// ─── Reset Password Modal ──────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState({ text: "", err: false });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ text: "", err: false });
    try {
      await api(`/api/superadmin/users/${user._id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setMsg({ text: `✅ Password reset for "${user.loginId}"`, err: false });
      onDone(`Password reset for "${user.loginId}" — new password set.`);
      setTimeout(onClose, 1200);
    } catch (err) {
      setMsg({ text: err.message, err: true });
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="font-bold">Reset Password</h3>
        <p className="mt-1 text-xs text-black/50">
          Setting new password for <span className="font-semibold text-black">{user.loginId}</span> <Badge role={user.role} />
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Input
            label="New Password (min 6 chars)"
            type="password"
            minLength={6}
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <Msg {...msg} />
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
            <Btn type="submit" disabled={busy}>{busy ? "Saving..." : "Reset Password"}</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ title, message, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div>
          <h3 id="delete-confirm-title" className="font-bold">{title}</h3>
          <p className="mt-1 text-sm text-black/55">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" type="button" onClick={onCancel}>Cancel</Btn>
          <Btn variant="danger" type="button" onClick={onConfirm}>Delete</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Users Section ─────────────────────────────────────────────────────────
function UsersSection() {
  const [users, setUsers]     = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm]       = useState({ loginId: "", password: "", role: "OWNER", orgId: "", branchId: "" });
  const [msg, setMsg]         = useState({ text: "", err: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [userData, orgData, branchData] = await Promise.all([
        api("/api/superadmin/users"),
        api("/api/superadmin/orgs"),
        api("/api/superadmin/branches"),
      ]);
      setUsers(userData.users);
      setOrgs(orgData.orgs);
      setBranches(branchData.branches);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createUser(e) {
    e.preventDefault();
    try {
      await api("/api/superadmin/users", { method: "POST", body: JSON.stringify(form) });
      setMsg({ text: `User "${form.loginId}" created.`, err: false });
      setForm({ loginId: "", password: "", role: "OWNER", orgId: "", branchId: "" });
      setShowForm(false);
      load();
    } catch (err) { setMsg({ text: err.message, err: true }); }
  }

  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    try {
      await api(`/api/superadmin/users/${deleteTarget._id}`, { method: "DELETE" });
      setMsg({ text: `Deleted "${deleteTarget.loginId}".`, err: false });
      setDeleteTarget(null);
      load();
    } catch (err) { setDeleteTarget(null); setMsg({ text: err.message, err: true }); }
  }

  return (
    <Card title="Users" icon={Users}>
      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={text => setMsg({ text, err: false })}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          title="Delete user?"
          message={`Delete user "${deleteTarget.loginId}"?`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteUser}
        />
      )}

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-black/40">{users.length} users</span>
        <div className="flex gap-2">
          <Btn variant="secondary" size="sm" onClick={load}><RefreshCw size={12} className="inline mr-1" />Refresh</Btn>
          <Btn size="sm" onClick={() => setShowForm(o => !o)}><Plus size={12} className="inline mr-1" />New User</Btn>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createUser} className="mb-4 grid gap-3 rounded-xl border border-black/10 bg-gray-50 p-4 sm:grid-cols-2">
          <Input label="Login ID" required value={form.loginId} onChange={e => setForm(f => ({ ...f, loginId: e.target.value }))} />
          <Input label="Temporary Password (min 10 chars)" type="password" minLength={10} required value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          <label className="block text-xs font-semibold text-black/55">
            Role
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-forest bg-white">
              <option value="OWNER">OWNER</option>
              <option value="BRANCH_MANAGER">BRANCH_MANAGER</option>
              <option value="SUPERADMIN">SUPERADMIN</option>
            </select>
          </label>
          {form.role !== "SUPERADMIN" && (
            <label className="block text-xs font-semibold text-black/55">
              Restaurant
              <select required value={form.orgId} onChange={e => setForm(f => ({ ...f, orgId: e.target.value, branchId: "" }))}
                className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-forest">
                <option value="">Select restaurant…</option>
                {orgs.map(org => <option key={org._id} value={org._id}>{org.name}</option>)}
              </select>
            </label>
          )}
          {form.role === "BRANCH_MANAGER" && (
            <label className="block text-xs font-semibold text-black/55">
              Assigned Branch
              <select required value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-forest">
                <option value="">Select branch…</option>
                {branches.filter(branch => String(branch.orgId) === form.orgId).map(branch => (
                  <option key={branch._id} value={branch._id}>{branch.name} ({branch.code})</option>
                ))}
              </select>
            </label>
          )}
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <Btn variant="secondary" size="sm" type="button" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn size="sm" type="submit">Create</Btn>
          </div>
        </form>
      )}

      <Msg {...msg} />

      {loading ? (
        <p className="py-6 text-center text-xs text-black/40">Loading…</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs text-black/40">
                <th className="pb-2 pr-3">Login ID</th>
                <th className="pb-2 pr-3">Role</th>
                <th className="pb-2 pr-3">Restaurant / Branch</th>
                <th className="pb-2 pr-3">Active</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id} className="border-b border-black/5 hover:bg-gray-50">
                  <td className="py-2 pr-3 font-semibold">{u.loginId}</td>
                  <td className="py-2 pr-3"><Badge role={u.role} /></td>
                  <td className="py-2 pr-3 text-xs text-black/55">
                    {orgs.find(org => org._id === String(u.orgId))?.name || "—"}
                    {u.branchId && ` / ${branches.find(branch => branch._id === String(u.branchId))?.name || "Branch"}`}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`text-xs font-semibold ${u.isActive ? "text-green-600" : "text-red-500"}`}>
                      {u.isActive ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Btn size="sm" variant="warning" onClick={() => setResetTarget(u)}>
                        <KeyRound size={12} className="inline mr-1" />Reset Pass
                      </Btn>
                      <button onClick={() => setDeleteTarget(u)}
                        className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!users.length && <p className="py-6 text-center text-xs text-black/40">No users found.</p>}
        </div>
      )}
    </Card>
  );
}

// ─── Orgs Section ──────────────────────────────────────────────────────────
function OrgsSection() {
  const [orgs, setOrgs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName]       = useState("");
  const [ownerCredentials, setOwnerCredentials] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [msg, setMsg]         = useState({ text: "", err: false });

  const load = useCallback(async () => {
    setLoading(true);
    try { setOrgs((await api("/api/superadmin/orgs")).orgs); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createOrg(e) {
    e.preventDefault();
    try {
      const result = await api("/api/superadmin/orgs", { method: "POST", body: JSON.stringify({ name }) });
      setOwnerCredentials({ organization: result.org.name, ...result.ownerCredentials });
      setMsg({ text: `Restaurant "${name}" created with an Owner account.`, err: false });
      setName(""); setShowForm(false); load();
    } catch (err) { setMsg({ text: err.message, err: true }); }
  }

  async function confirmDeleteOrg() {
    if (!deleteTarget) return;
    try {
      await api(`/api/superadmin/orgs/${deleteTarget._id}`, { method: "DELETE" });
      setMsg({ text: `Deleted "${deleteTarget.name}".`, err: false });
      setDeleteTarget(null);
      load();
    } catch (err) { setDeleteTarget(null); setMsg({ text: err.message, err: true }); }
  }

  return (
    <Card title="Restaurants" icon={Building2}>
      {deleteTarget && (
        <DeleteConfirmModal
          title="Delete restaurant?"
          message={`Delete "${deleteTarget.name}"?`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteOrg}
        />
      )}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-black/40">{orgs.length} restaurants</span>
        <div className="flex gap-2">
          <Btn variant="secondary" size="sm" onClick={load}><RefreshCw size={12} className="inline mr-1" />Refresh</Btn>
          <Btn size="sm" onClick={() => setShowForm(o => !o)}><Plus size={12} className="inline mr-1" />New Restaurant</Btn>
        </div>
      </div>

      {ownerCredentials && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold">Owner login for {ownerCredentials.organization} — save these credentials now</p>
              <p className="mt-2">Login ID: <code className="select-all rounded bg-white px-2 py-1">{ownerCredentials.loginId}</code></p>
              <p className="mt-1">Temporary password: <code className="select-all rounded bg-white px-2 py-1">{ownerCredentials.temporaryPassword}</code></p>
              <p className="mt-2 text-xs text-amber-800">The Owner must change this password at first sign-in. It will not be shown again.</p>
            </div>
            <button type="button" onClick={() => setOwnerCredentials(null)} className="rounded px-2 py-1 text-xs font-semibold hover:bg-amber-100">Dismiss</button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={createOrg} className="mb-4 flex flex-wrap gap-3 rounded-xl border border-black/10 bg-gray-50 p-4">
          <div className="flex-1 min-w-[180px]">
            <Input label="Restaurant Name" required value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Btn variant="secondary" size="sm" type="button" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn size="sm" type="submit">Create</Btn>
          </div>
        </form>
      )}

      <Msg {...msg} />

      {loading ? <p className="py-6 text-center text-xs text-black/40">Loading…</p> : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-black/40">
              <th className="pb-2 pr-3">Name</th>
              <th className="pb-2 pr-3">ID (copy to use in users/branches)</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {orgs.map(o => (
              <tr key={o._id} className="border-b border-black/5 hover:bg-gray-50">
                <td className="py-2 pr-3 font-semibold">{o.name}</td>
                <td className="py-2 pr-3 font-mono text-xs text-black/50 select-all">{o._id}</td>
                <td className="py-2 text-right">
                  <button onClick={() => setDeleteTarget(o)}
                    className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && !orgs.length && <p className="py-6 text-center text-xs text-black/40">No organizations yet.</p>}
    </Card>
  );
}

// ─── Branches Section ──────────────────────────────────────────────────────
function BranchesSection() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ orgId: "", name: "", code: "", address: "" });
  const [msg, setMsg]           = useState({ text: "", err: false });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setBranches((await api("/api/superadmin/branches")).branches); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createBranch(e) {
    e.preventDefault();
    try {
      await api("/api/superadmin/branches", { method: "POST", body: JSON.stringify(form) });
      setMsg({ text: `Branch "${form.name}" created.`, err: false });
      setForm({ orgId: "", name: "", code: "", address: "" }); setShowForm(false); load();
    } catch (err) { setMsg({ text: err.message, err: true }); }
  }

  async function confirmDeleteBranch() {
    if (!deleteTarget) return;
    try {
      await api(`/api/superadmin/branches/${deleteTarget._id}`, { method: "DELETE" });
      setMsg({ text: `Deleted "${deleteTarget.name}".`, err: false });
      setDeleteTarget(null);
      load();
    } catch (err) { setDeleteTarget(null); setMsg({ text: err.message, err: true }); }
  }

  return (
    <Card title="Branches" icon={GitBranch}>
      {deleteTarget && (
        <DeleteConfirmModal
          title="Delete branch?"
          message={`Delete branch "${deleteTarget.name}"?`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteBranch}
        />
      )}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-black/40">{branches.length} branches</span>
        <div className="flex gap-2">
          <Btn variant="secondary" size="sm" onClick={load}><RefreshCw size={12} className="inline mr-1" />Refresh</Btn>
          <Btn size="sm" onClick={() => setShowForm(o => !o)}><Plus size={12} className="inline mr-1" />New Branch</Btn>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createBranch} className="mb-4 grid gap-3 rounded-xl border border-black/10 bg-gray-50 p-4 sm:grid-cols-2">
          <Input label="Org ID (paste from Organizations above)" required value={form.orgId} onChange={e => setForm(f => ({ ...f, orgId: e.target.value }))} />
          <Input label="Branch Name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Branch Code (unique, e.g. MAIN)" required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
          <Input label="Address (optional)" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <Btn variant="secondary" size="sm" type="button" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn size="sm" type="submit">Create</Btn>
          </div>
        </form>
      )}

      <Msg {...msg} />

      {loading ? <p className="py-6 text-center text-xs text-black/40">Loading…</p> : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-black/40">
              <th className="pb-2 pr-3">Name</th>
              <th className="pb-2 pr-3">Code</th>
              <th className="pb-2 pr-3">Branch ID (assign to Branch Manager)</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {branches.map(b => (
              <tr key={b._id} className="border-b border-black/5 hover:bg-gray-50">
                <td className="py-2 pr-3 font-semibold">{b.name}</td>
                <td className="py-2 pr-3 font-mono text-xs">{b.code}</td>
                <td className="py-2 pr-3 font-mono text-xs text-black/50 select-all">{b._id}</td>
                <td className="py-2 text-right">
                  <button onClick={() => setDeleteTarget(b)}
                    className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && !branches.length && <p className="py-6 text-center text-xs text-black/40">No branches yet.</p>}
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const [ready, setReady]       = useState(false);
  const [denied, setDenied]     = useState(false);

  useEffect(() => {
    api("/api/session")
      .then(d => {
        if (d.user?.role !== "SUPERADMIN") setDenied(true);
        else setReady(true);
      })
      .catch(() => setDenied(true));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  if (denied) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f0]">
        <div className="rounded-2xl border border-black/10 bg-white p-10 text-center shadow-sm">
          <ShieldCheck size={40} className="mx-auto mb-3 text-red-400" />
          <h1 className="text-lg font-bold">Access Denied</h1>
          <p className="mt-1 text-sm text-black/50">SuperAdmin access required.</p>
          <a href="/" className="mt-4 inline-block rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white">
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f0]">
        <p className="text-sm text-black/40">Loading SuperAdmin panel…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <header className="flex items-center justify-between border-b border-black/10 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-forest text-white">
            <ShieldCheck size={21} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-forest">SuperAdmin</p>
            <h1 className="text-lg font-bold">Restaurant POS — Control Panel</h1>
          </div>
        </div>
        <button onClick={logout}
          className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50">
          <LogOut size={15} /> Log out
        </button>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 p-5">
        <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-700">
          <ShieldCheck size={14} className="mr-1 inline" />
          Signed in as <strong>SUPERADMIN</strong> — register restaurants, manage branches, and create user accounts below.
        </div>
        <OrgsSection />
        <BranchesSection />
        <UsersSection />
      </main>
    </div>
  );
}
