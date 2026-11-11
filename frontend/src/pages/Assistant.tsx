import { usePersistentState } from "../lib/persist";
import { Bot, Loader2, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Card, cx, PageHeader, Tag } from "../components/ui";
import { post, useApi } from "../lib/api";
import { useApp } from "../lib/app";

interface Msg { role: "user" | "assistant"; content: string; mode?: string }

export default function Assistant() {
  const { t, subject, lang } = useApp();
  const { data: status } = useApi<{ available: boolean }>("/api/ai/status");
  const [msgs, setMsgs] = usePersistentState<Msg[]>(`assistant.${subject}`, []);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    const history = msgs.map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setQ("");
    setBusy(true);
    try {
      const r = await post<{ answer: string; mode: string }>("/api/ai/ask", { subject, question, lang, history });
      setMsgs((m) => [...m, { role: "assistant", content: r.answer, mode: r.mode }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = [t("ai_q1"), t("ai_q2"), t("ai_q3"), t("ai_q4")];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("ai_title")} sub={t("ai_sub")}
        right={<div className="flex items-center gap-2">
          {status && <Tag tone={status.available ? "good" : "warn"}>{status.available ? t("ai_online") : t("ai_offline")}</Tag>}
          {msgs.length > 0 && <button className="btn px-2.5 py-1 text-[12px]" onClick={() => setMsgs([])}>{t("ai_clear")}</button>}
        </div>} />
      <Card pad={false}>
        <div className="flex h-[calc(100vh-280px)] min-h-[420px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {msgs.length === 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="rounded-xl border border-line bg-slate-50 p-3 text-left text-[13.5px] text-slate-700 transition hover:border-accent/40 hover:bg-accent-soft/40">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cx("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                <div className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full", m.role === "user" ? "bg-slate-200" : "bg-accent text-white")}>
                  {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className={cx("max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed",
                  m.role === "user" ? "bg-accent text-white" : "border border-line bg-white")}>
                  {m.role === "assistant" ? <div className="markdown"><ReactMarkdown>{m.content}</ReactMarkdown></div> : m.content}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-[13px] text-muted"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</div>}
            <div ref={end} />
          </div>
          <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ai_placeholder")}
              className="flex-1 rounded-xl border border-line px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <button className="btn btn-primary" disabled={busy || !q.trim()}><Send className="h-4 w-4" />{t("ai_send")}</button>
          </form>
        </div>
      </Card>
    </div>
  );
}
