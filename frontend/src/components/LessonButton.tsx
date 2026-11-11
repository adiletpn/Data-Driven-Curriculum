import { BookMarked, Check, Copy, Loader2, Printer, X } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { get } from "../lib/api";
import { useApp } from "../lib/app";
import { cx, Tag } from "./ui";

export default function LessonButton({ topicId, small }: { topicId: string; small?: boolean }) {
  const { t, subject, lang } = useApp();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ markdown: string; source: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const show = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
    setBusy(true);
    try {
      setData(await get(`/api/lesson?subject=${subject}&topic_id=${topicId}&lang=${lang}`));
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    const w = window.open("", "_blank");
    if (!w || !data) return;
    w.document.write(`<html><head><title>${t("ls_title")}</title><style>body{font-family:system-ui;max-width:720px;margin:32px auto;line-height:1.55;color:#0b1324}h1{font-size:22px}h2{font-size:16px;margin-top:22px}</style></head><body>${document.getElementById("lesson-md")?.innerHTML ?? ""}</body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <>
      <button onClick={show} className={cx("btn", small && "px-2 py-1 text-[12px]")}>
        <BookMarked className="h-3.5 w-3.5" />{t("ls_button")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div className="card relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <div className="flex items-center gap-2 font-semibold"><BookMarked className="h-4 w-4 text-accent" />{t("ls_title")}</div>
              <div className="flex items-center gap-2">
                {data && <Tag tone={data.source === "llm" ? "accent" : "slate"}>{data.source === "llm" ? t("ls_source_llm") : t("ls_source_template")}</Tag>}
                <button className="btn px-2 py-1" disabled={!data} onClick={() => { navigator.clipboard?.writeText(data?.markdown ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? t("ls_copied") : t("ls_copy")}
                </button>
                <button className="btn px-2 py-1" disabled={!data} onClick={print}><Printer className="h-3.5 w-3.5" /></button>
                <button className="rounded p-1 text-muted hover:bg-slate-100" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="overflow-y-auto px-6 py-5">
              {busy || !data ? (
                <div className="flex items-center gap-2 py-10 text-muted"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</div>
              ) : (
                <div id="lesson-md" className="markdown text-[14px] leading-relaxed"><ReactMarkdown>{data.markdown}</ReactMarkdown></div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
