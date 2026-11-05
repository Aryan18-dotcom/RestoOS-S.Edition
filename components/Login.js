"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck, Store, Utensils } from "lucide-react";
import { displayRole } from "@/lib/roles";

const ROLES = [
  {
    id: "SUPERADMIN",
    label: "Super Admin",
    desc: "Manage all restaurants & users",
    icon: ShieldCheck,
    color: "bg-purple-100 text-purple-700 border-purple-200",
    active: "ring-2 ring-purple-400 bg-purple-50 border-purple-300",
  },
  {
    id: "OWNER",
    label: "Owner",
    desc: "Restaurant ERP & analytics",
    icon: Store,
    color: "bg-blue-100 text-blue-700 border-blue-200",
    active: "ring-2 ring-blue-400 bg-blue-50 border-blue-300",
  },
  {
    id: "BRANCH_MANAGER",
    label: "Branch Manager",
    desc: "Branch menu, orders & POS",
    icon: Utensils,
    color: "bg-green-100 text-green-700 border-green-200",
    active: "ring-2 ring-forest bg-[#e7f2eb] border-forest/40",
  },
];

function redirectForRole(role) {
  if (role === "SUPERADMIN") return "/superadmin";
  if (role === "OWNER")      return "/owner";
  if (displayRole(role) === "BRANCH_MANAGER") return "/branch-manager";
  return "/";
}

export default function Login() {
  const [selectedRole, setSelectedRole] = useState("BRANCH_MANAGER");
  const [loginId,  setLoginId]  = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [busy,     setBusy]     = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password }),
      });
      const result = await response.json().catch(() => null);
      if (!result) throw new Error("Server returned an invalid response.");
      if (!response.ok) throw new Error(result.error || "Unable to sign in");

      // Validate the role matches what user selected (optional safety check)
      if (displayRole(result.role) !== selectedRole) {
        setError(`This account is a ${displayRole(result.role)}, not a ${selectedRole}. Redirecting…`);
        setTimeout(() => {
          window.location.assign(
            result.isTemporaryPass ? "/force-password-change" : redirectForRole(result.role)
          );
        }, 1500);
        return;
      }

      window.location.assign(
        result.isTemporaryPass ? "/force-password-change" : redirectForRole(result.role)
      );
    } catch (loginError) {
      setError(loginError.message);
      setBusy(false);
    }
  }

  const activeRoleObj = ROLES.find(r => r.id === selectedRole);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f5f0] p-5">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-forest text-white shadow">
            <KeyRound size={26} />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-forest">Restaurant POS</p>
          <h1 className="mt-1 text-2xl font-bold">Sign in</h1>
          <p className="mt-1 text-sm text-black/50">Select your role and enter your credentials</p>
        </div>

        {/* Role Selector */}
        <div className="mb-5 grid grid-cols-3 gap-2">
          {ROLES.map(role => {
            const Icon = role.icon;
            const isActive = selectedRole === role.id;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => { setSelectedRole(role.id); setError(""); }}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition ${isActive ? role.active : "border-black/10 bg-white hover:bg-gray-50"}`}
              >
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${isActive ? role.color : "bg-gray-100 text-gray-500"}`}>
                  <Icon size={18} />
                </span>
                <span className="text-xs font-bold leading-tight">{role.label}</span>
                <span className="text-[10px] leading-tight text-black/40">{role.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Login Form */}
        <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-black/60">
            Signing in as <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${activeRoleObj?.color}`}>{activeRoleObj?.label}</span>
          </p>

          <label className="block text-sm font-semibold">
            Login ID
            <input
              autoComplete="username"
              required
              value={loginId}
              onChange={e => setLoginId(e.target.value)}
              placeholder={selectedRole === "SUPERADMIN" ? "e.g. root" : selectedRole === "OWNER" ? "Owner login ID" : "Branch Manager login ID"}
              className="mt-2 w-full rounded-lg border border-black/15 px-3 py-2.5 text-sm outline-none focus:border-forest"
            />
          </label>

          <label className="mt-4 block text-sm font-semibold">
            Password
            <input
              autoComplete="current-password"
              required
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-2 w-full rounded-lg border border-black/15 px-3 py-2.5 text-sm outline-none focus:border-forest"
            />
          </label>

          <button
            disabled={busy}
            className="mt-5 w-full rounded-lg bg-forest px-4 py-3 font-bold text-white transition hover:bg-green-800 disabled:opacity-50"
          >
            {busy ? "Signing in…" : `Sign in as ${activeRoleObj?.label}`}
          </button>

          {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </form>

        {/* Quick reference */}
        <div className="mt-4 rounded-xl border border-black/10 bg-white p-4 text-xs text-black/50">
          <p className="font-semibold text-black/70 mb-2">Quick reference:</p>
          <div className="space-y-1">
            <p>🛡️ <strong>Super Admin</strong> → <code className="bg-gray-100 px-1 rounded">localhost:3000/superadmin</code></p>
            <p>🏪 <strong>Owner</strong> → <code className="bg-gray-100 px-1 rounded">localhost:3000/owner</code></p>
            <p>🍽️ <strong>Branch Manager</strong> → <code className="bg-gray-100 px-1 rounded">localhost:3000/branch-manager</code></p>
          </div>
        </div>
      </div>
    </main>
  );
}
