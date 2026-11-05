"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { displayRole } from "@/lib/roles";

function redirectForRole(role) {
  if (role === "SUPERADMIN") return "/superadmin";
  if (role === "OWNER")      return "/owner";
  if (displayRole(role) === "BRANCH_MANAGER") return "/branch-manager";
  return "/";
}

export default function ForcePasswordChangePage() {
  const [password, setPassword] = useState("");
  const [loginId, setLoginId] = useState("");
  const [currentLoginId, setCurrentLoginId] = useState("");
  const [message,  setMessage]  = useState("");
  const [busy,     setBusy]     = useState(false);
  const [role,     setRole]     = useState(null);

  useEffect(() => {
    fetch("/api/session")
      .then(r => r.json())
      .then(d => {
        setRole(d?.user?.role);
        setCurrentLoginId(d?.user?.loginId || "");
      })
      .catch(() => {});
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, ...(role === "OWNER" ? { loginId } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Password update failed");
      window.location.assign(redirectForRole(role));
    } catch (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  const dest = redirectForRole(role);
  const destLabel =
    role === "SUPERADMIN" ? "SuperAdmin Panel" :
    role === "OWNER"      ? "Owner Dashboard" :
    "Branch POS";

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f5f0] p-5">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-[#e7f2eb] text-forest">
          <KeyRound size={22} />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-forest">Account Security</p>
        <h1 className="mt-2 text-2xl font-bold">{role === "OWNER" ? "Update your login details" : "Set a new password"}</h1>
        <p className="mt-2 text-sm text-black/55">
          {role === "OWNER"
            ? <>Replace your temporary login ID and password before continuing to <strong>{destLabel}</strong>.</>
            : <>Your temporary password must be replaced before continuing to <strong>{destLabel}</strong>.</>}
        </p>

        {role === "OWNER" && (
          <div className="mt-6">
            {currentLoginId && <p className="mb-2 text-sm text-black/55">Temporary login ID: <strong>{currentLoginId}</strong></p>}
            <label className="block text-sm font-semibold">
              New login ID (3–40 characters)
              <input
                autoComplete="username"
                minLength={3}
                maxLength={40}
                pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}"
                required
                value={loginId}
                onChange={e => setLoginId(e.target.value)}
                className="mt-2 w-full rounded-lg border border-black/15 px-3 py-2.5 outline-none focus:border-forest"
              />
            </label>
          </div>
        )}

        <label className="mt-6 block text-sm font-semibold">
          New password (min 10 characters)
          <input
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            required
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="mt-2 w-full rounded-lg border border-black/15 px-3 py-2.5 outline-none focus:border-forest"
          />
        </label>

        <button
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-forest px-4 py-3 font-bold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : role === "OWNER" ? `Update details & go to ${destLabel}` : `Set password & go to ${destLabel}`}
        </button>

        {message && <p role="alert" className="mt-3 text-sm text-red-700">{message}</p>}

      </form>
    </main>
  );
}
