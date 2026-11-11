import { ArrowRight, BookOpenCheck, Building2, Clock, GraduationCap, Loader2, Lock, Network, ShieldCheck, User } from "lucide-react";
import { useState } from "react";
import { Segmented } from "../components/ui";
import { useApp } from "../lib/app";

const DEMO = [
  { username: "metodist", password: "demo2026", icon: <GraduationCap className="h-4 w-4" />, key: "lg_role_methodologist" as const, hint: "lg_role_methodologist_hint" as const },
  { username: "director", password: "demo2026", icon: <Building2 className="h-4 w-4" />, key: "lg_role_director" as const, hint: "lg_role_director_hint" as const },
  { username: "admin", password: "admin2026", icon: <ShieldCheck className="h-4 w-4" />, key: "lg_role_admin" as const, hint: "lg_role_admin_hint" as const },
];

export default function Login() {
  const { t, login, lang, setLang } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (u: string, p: string) => {
    setBusy(u);
    setError(null);
    try {
      await login(u, p);
    } catch {
      setError(t("lg_error"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* brand panel */}
      <div className="brand-panel relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col">
        <div className="relative z-10 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <svg viewBox="0 0 32 32" className="h-6 w-6"><path d="M8 24V14M14 24V8M20 24v-8M26 24V12" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /></svg>
          </div>
          <div className="text-lg font-semibold tracking-tight">Data-Driven Curriculum</div>
        </div>
        <div className="relative z-10 mt-auto max-w-xl">
          <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight">{t("lg_hero")}</h1>
          <p className="mt-4 text-[16px] leading-relaxed text-white/75">{t("lg_hero_sub")}</p>
          <div className="mt-10 grid gap-4">
            {[
              [<BookOpenCheck key="a" className="h-5 w-5" />, t("lg_f1"), t("lg_f1d")],
              [<Network key="b" className="h-5 w-5" />, t("lg_f2"), t("lg_f2d")],
              [<Clock key="c" className="h-5 w-5" />, t("lg_f3"), t("lg_f3d")],
            ].map(([icon, title, desc], i) => (
              <div key={i} className="flex gap-4 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">{icon}</div>
                <div>
                  <div className="font-semibold">{title}</div>
                  <div className="mt-0.5 text-[14px] text-white/70">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 mt-10 flex gap-8 text-[13px] text-white/60">
          <div><div className="text-2xl font-semibold text-white">1,2 {t("pp")}</div>{t("lg_stat1")}</div>
          <div><div className="text-2xl font-semibold text-white">100%</div>{t("lg_stat2")}</div>
          <div><div className="text-2xl font-semibold text-white">RU · KZ</div>{t("lg_stat3")}</div>
        </div>
      </div>

      {/* form */}
      <div className="flex flex-col bg-white px-6 py-8 sm:px-12">
        <div className="flex justify-end">
          <Segmented size="sm" value={lang} onChange={setLang} options={[{ value: "ru", label: "РУС" }, { value: "kz", label: "ҚАЗ" }]} />
        </div>
        <div className="m-auto w-full max-w-sm py-10">
          <div className="mb-8 lg:hidden">
            <div className="text-lg font-semibold">Data-Driven Curriculum</div>
            <div className="text-[14px] text-muted">{t("lg_hero")}</div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{t("lg_title")}</h2>
          <p className="mt-1 text-[14px] text-muted">{t("lg_sub")}</p>

          <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); go(username, password); }}>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t("lg_username")}</span>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username"
                  className="input pl-9" placeholder="metodist" />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t("lg_password")}</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                  className="input pl-9" placeholder="••••••••" />
              </div>
            </label>
            {error && <div className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</div>}
            <button className="btn btn-primary w-full justify-center py-2.5" disabled={!!busy || !username || !password}>
              {busy === username ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("lg_submit")} <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="my-8 flex items-center gap-3 text-[12px] font-medium uppercase tracking-wider text-slate-400">
            <div className="h-px flex-1 bg-line" />{t("lg_demo")}<div className="h-px flex-1 bg-line" />
          </div>
          <div className="space-y-2">
            {DEMO.map((d) => (
              <button key={d.username} onClick={() => go(d.username, d.password)} disabled={!!busy}
                className="group flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left transition hover:border-accent/40 hover:bg-accent-soft/40">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent">{busy === d.username ? <Loader2 className="h-4 w-4 animate-spin" /> : d.icon}</div>
                <div className="flex-1">
                  <div className="text-[14px] font-semibold">{t(d.key)}</div>
                  <div className="text-[12px] text-muted">{t(d.hint)}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-accent" />
              </button>
            ))}
          </div>
          <p className="mt-6 text-center text-[12px] text-slate-400">metodist / demo2026 · director / demo2026 · admin / admin2026</p>
        </div>
      </div>
    </div>
  );
}
