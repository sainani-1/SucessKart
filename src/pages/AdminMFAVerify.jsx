import React, { useState, useRef, useEffect } from "react";
const LOGO_URL = import.meta.env.VITE_CERTIFICATE_LOGO || "/skillpro-logo.png";
import { supabase } from "../supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";
import AlertModal from "../components/AlertModal";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { LogOut, ShieldCheck, ArrowLeft } from "lucide-react";
import { logError } from "../utils/errorLogger";

export default function AdminMFAVerify() {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [alert, setAlert] = useState({ show: false, title: "", message: "", type: "error" });
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const inputRefs = useRef([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signOut } = useAuth();

  const codeStr = code.join("");
      const scope = searchParams.get("scope") || "";
      const nextPath = searchParams.get("next") || "/app";
  const isSensitivePasswordScope = scope === "sensitive-passwords";

  const resetCodeAndFocusFirst = () => {
    setCode(["", "", "", "", "", ""]);
    requestAnimationFrame(() => {
      const first = inputRefs.current[0];
      if (first) {
        first.focus();
        first.select();
      }
    });
  };

  useEffect(() => {
    if (!loading && codeStr.length === 6 && codeStr.split("").every((d) => d)) {
      verify(codeStr);
    }
  }, [codeStr, loading]);

  useEffect(() => {
    let active = true;

    const ensureSession = async () => {
      let restoredSession = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        restoredSession = data?.session || null;
        if (restoredSession?.user) break;
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      if (!active) return;

      if (!restoredSession?.user) {
        setAlert({
          show: true,
          title: "Session Expired",
          message: "Your admin login session is missing. Please login again.",
          type: "warning",
        });
        setTimeout(() => navigate("/login", { replace: true }), 1200);
        return;
      }

      setSessionReady(true);
    };

    ensureSession();
    return () => {
      active = false;
    };
  }, [navigate]);

  const handleChange = (e, idx) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 1);
    if (!val) return;

    const newCode = [...code];
    newCode[idx] = val;
    setCode(newCode);

    if (idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === "Backspace") {
      if (code[idx]) {
        const newCode = [...code];
        newCode[idx] = "";
        setCode(newCode);
      } else if (idx > 0) {
        inputRefs.current[idx - 1]?.focus();
        const newCode = [...code];
        newCode[idx - 1] = "";
        setCode(newCode);
      }
    }
  };

  const verify = async (codeValue) => {
    if (loading || !sessionReady) return;

    try {
      setLoading(true);
      const { data: sessionResp } = await supabase.auth.getSession();
      if (!sessionResp?.session?.user) {
        throw new Error("Your login session expired. Please login again.");
      }
      const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
      if (factorError) throw factorError;

      if (!factors.totp.length) {
        setAlert({ show: true, title: "MFA Not Registered", message: "You must register MFA first.", type: "warning" });
        setTimeout(() => navigate("/admin-mfa-setup"), 1200);
        return;
      }

      const factorId = factors.totp[0].id;
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: codeValue });
      if (verifyError) {
        setToast({ show: true, message: "Invalid MFA code. Try again.", type: "error" });
        resetCodeAndFocusFirst();
        return;
      }

      const { data: userResp } = await supabase.auth.getUser();
      sessionStorage.setItem("admin_mfa_verified", "true");
      if (userResp?.user?.id) {
        sessionStorage.setItem("admin_mfa_verified_user", userResp.user.id);
        if (isSensitivePasswordScope) {
          sessionStorage.setItem("admin_sensitive_mfa_verified_user", userResp.user.id);
          sessionStorage.setItem("admin_sensitive_mfa_verified_at", String(Date.now()));
          sessionStorage.setItem("admin_sensitive_mfa_verified_target", nextPath);
        }
      }
      setToast({
        show: true,
        message: isSensitivePasswordScope ? "Secure access verified. Redirecting..." : "MFA Verified! Redirecting...",
        type: "success",
      });
      setTimeout(() => navigate(nextPath, { replace: true }), 1200);
    } catch (err) {
      logError({ message: String(err), source: 'AdminMFAVerify', details: err });
      setAlert({ show: true, title: "Verification Failed", message: err.message || "Could not verify MFA code.", type: "error" });
      resetCodeAndFocusFirst();
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(37,99,235,0.18),_transparent_26%),linear-gradient(180deg,_#eff6ff_0%,_#dbeafe_48%,_#bfdbfe_100%)] px-4 py-8">
      <Toast show={toast.show} message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, show: false })} />
      <AlertModal show={alert.show} title={alert.title} message={alert.message} type={alert.type} onClose={() => setAlert({ ...alert, show: false })} />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="hidden rounded-[2rem] border border-blue-200/60 bg-slate-950 px-8 py-10 text-white shadow-[0_30px_80px_rgba(30,41,59,0.28)] lg:block">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-400/15 text-cyan-300">
              <ShieldCheck size={30} />
            </div>
            <h1 className="mt-8 text-4xl font-black tracking-tight">Secure admin checkpoint</h1>
            <p className="mt-4 text-base leading-7 text-slate-300">
              This step protects sensitive admin access. Enter the one-time code from your authenticator app to continue safely.
            </p>
            <div className="mt-8 space-y-4">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">Fast verification</p>
                <p className="mt-1 text-sm text-slate-400">Code verification runs automatically once all 6 digits are entered.</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">Session protection</p>
                <p className="mt-1 text-sm text-slate-400">If the admin session has expired, you will be redirected back to login.</p>
              </div>
            </div>
          </div>

          <div className="w-full rounded-[2rem] border border-white/70 bg-white/90 p-8 shadow-[0_30px_80px_rgba(37,99,235,0.18)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-blue-400/40 bg-white shadow-lg">
                  <img src={LOGO_URL} alt="Logo" className="h-16 w-16 rounded-full object-contain" />
                </div>
                <div>
                  <span className="text-2xl font-extrabold tracking-tight text-slate-900">SkillPro</span>
                  <p className="mt-1 text-sm text-slate-500">Admin verification</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>

            <div className="mt-8 rounded-[1.75rem] border border-blue-100 bg-[linear-gradient(135deg,rgba(239,246,255,0.95),rgba(219,234,254,0.92))] p-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white">
                <ShieldCheck size={14} />
                Protected step
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-blue-900">{isSensitivePasswordScope ? "Confirm Secure Access" : "Verify MFA"}</h2>
              <p className="mt-3 text-slate-600">
                {isSensitivePasswordScope
                  ? "Enter the 6-digit code from your authenticator app before opening password tools."
                  : "Enter the 6-digit code from your authenticator app to continue."}
              </p>
            </div>

            <div className="mt-8 flex justify-center gap-3">
          {[...Array(6)].map((_, i) => (
            <input
              key={i}
              ref={(el) => (inputRefs.current[i] = el)}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              className={`w-12 h-14 text-center text-2xl font-mono rounded-lg border-2 transition-all duration-150 outline-none
                ${code[i] ? "border-blue-600 bg-blue-50 text-blue-700 shadow" : "border-slate-300 bg-white text-slate-400"}`}
              value={code[i]}
              onChange={(e) => handleChange(e, i)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              disabled={loading}
              autoFocus={i === 0}
              style={{ imeMode: "disabled" }}
            />
          ))}
            </div>
            <button
              disabled={loading || !sessionReady || codeStr.length !== 6 || !codeStr.split("").every((d) => d)}
              onClick={() => verify(codeStr)}
              className={`mt-8 w-full rounded-2xl py-4 text-lg font-bold text-white transition-colors ${
                loading || !sessionReady || codeStr.length !== 6 || !codeStr.split("").every((d) => d) ? "bg-blue-300" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? "Verifying MFA..." : !sessionReady ? "Checking Session..." : "Verify MFA"}
            </button>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-700"
            >
              <ArrowLeft size={16} />
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
