import { X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp, type Role } from "../lib/app";

interface Step { target?: string; route?: string; ru: [string, string]; kz: [string, string] }

const REGION_STEPS: Step[] = [
  { route: "/", ru: ["Добро пожаловать!", "За минуту покажем, как платформа помогает принимать решения об учебниках и часах на основе данных."],
    kz: ["Қош келдіңіз!", "Платформа оқулықтар мен сағаттар туралы шешімдерді деректер негізінде қабылдауға қалай көмектесетінін бір минутта көрсетеміз."] },
  { route: "/", target: "subject", ru: ["Предмет", "Переключайте предмет — вся аналитика пересчитается."], kz: ["Пән", "Пәнді ауыстырыңыз — бүкіл талдау қайта есептеледі."] },
  { route: "/", target: "hero", ru: ["Главное за 5 секунд", "Средний балл, доля усвоенных тем и самый важный вывод по предмету."],
    kz: ["5 секундта ең бастысы", "Орташа балл, меңгерілген тақырыптар үлесі және пән бойынша ең маңызды қорытынды."] },
  { route: "/", target: "findings", ru: ["Ключевые выводы", "Сформированы автоматически: у каждого — цифры и ссылка «Подробнее» на доказательства."],
    kz: ["Негізгі қорытындылар", "Автоматты түрде құрастырылған: әрқайсысында сандар және дәлелге «Толығырақ» сілтемесі бар."] },
  { route: "/", target: "nav-/textbooks", ru: ["Честное сравнение учебников", "Отделяем эффект учебника от силы школ, которые его выбрали, + анализ «до и после» смены учебника."],
    kz: ["Оқулықтарды әділ салыстыру", "Оқулық әсерін оны таңдаған мектептердің күшінен ажыратамыз + ауыстыруға «дейін және кейін» талдауы."] },
  { route: "/", target: "nav-/hours", ru: ["Учебные часы", "Куда перенести часы без увеличения нагрузки — с прогнозом эффекта и режимом «что если»."],
    kz: ["Оқу сағаттары", "Жүктемені арттырмай сағаттарды қайда ауыстыру керек — әсер болжамы және «егер» режимімен."] },
  { route: "/", target: "nav-/pilot", ru: ["Как доказать эффект", "Планировщик пилота: сколько школ нужно и какие пары школ взять."],
    kz: ["Әсерді қалай дәлелдеу", "Пилот жоспарлаушы: қанша мектеп керек және қай мектеп жұптарын алу керек."] },
  { route: "/", target: "nav-/validation", ru: ["Почему нам можно верить", "Метод проверен на данных с заранее известным ответом — здесь видна точность."],
    kz: ["Неліктен бізге сенуге болады", "Әдіс жауабы алдын ала белгілі деректерде тексерілген — мұнда дәлдік көрінеді."] },
  { route: "/", target: "lang", ru: ["Қазақша да бар", "Весь интерфейс и отчёты — на казахском и русском. Экскурсию можно повторить кнопкой «?»."],
    kz: ["Орысша да бар", "Бүкіл интерфейс пен есептер — қазақ және орыс тілдерінде. Экскурсияны «?» батырмасымен қайталауға болады."] },
];

const DIRECTOR_STEPS: Step[] = [
  { route: "/school", ru: ["Добро пожаловать!", "Это кабинет вашей школы: где она сильнее и слабее региона и что делать в следующей четверти."],
    kz: ["Қош келдіңіз!", "Бұл сіздің мектебіңіздің кабинеті: аймақтан қай жерде күшті не әлсіз және келесі тоқсанда не істеу керек."] },
  { route: "/school", target: "school-hero", ru: ["Честная оценка школы", "Добавленная ценность: насколько школа лучше или хуже ожидаемого для своего состава учеников."],
    kz: ["Мектептің әділ бағасы", "Қосылған құн: мектеп өз оқушылар құрамы үшін күтілгеннен қаншалықты жақсы не нашар."] },
  { route: "/school", target: "focus", ru: ["Фокус на четверть", "Темы, где школа отстаёт сильнее всего. Кнопка «Методичка» — готовый план урока."],
    kz: ["Тоқсанға назар", "Мектеп ең көп артта қалған тақырыптар. «Әдістеме» батырмасы — дайын сабақ жоспары."] },
  { route: "/school", target: "risk", ru: ["Ученики в зоне риска", "Кто, скорее всего, не усвоит следующую тему и почему — помощь до провала."],
    kz: ["Тәуекел аймағындағы оқушылар", "Келесі тақырыпты кім меңгермеуі мүмкін және неге — сәтсіздікке дейін көмек."] },
  { route: "/school", target: "school-report", ru: ["Для педсовета", "Карточка школы одним нажатием — распечатайте или сохраните в PDF."],
    kz: ["Педкеңес үшін", "Мектеп картасы бір батырмамен — басып шығарыңыз немесе PDF-ке сақтаңыз."] },
];

const KEY = (role: Role) => `ddc.tour.v1.${role}`;
export const TOUR_EVENT = "ddc:tour-start";

export default function Tour() {
  const { user, lang } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const steps = user?.role === "director" ? DIRECTOR_STEPS : REGION_STEPS;
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!user) return;
    let seen = false;
    try { seen = !!localStorage.getItem(KEY(user.role)); } catch { /* ignore */ }
    if (!seen && !new URLSearchParams(window.location.search).has("notour")) {
      const id = setTimeout(() => setI(0), 900);
      return () => clearTimeout(id);
    }
  }, [user]);

  useEffect(() => {
    const start = () => setI(0);
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, []);

  const step = i != null ? steps[i] : null;

  useEffect(() => {
    if (step?.route && loc.pathname !== step.route) nav(step.route);
  }, [step, loc.pathname, nav]);

  const measure = useCallback(() => {
    if (!step?.target) return setRect(null);
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    let tries = 0;
    const tick = () => {
      const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      if (step.target && !el && tries++ < 30) return void setTimeout(tick, 120);  // wait for lazy pages / data
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(measure, 380);
    };
    tick();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  if (!step || !user) return null;
  const [title, text] = lang === "kz" ? step.kz : step.ru;
  const finish = () => {
    try { localStorage.setItem(KEY(user.role), "1"); } catch { /* ignore */ }
    setI(null);
  };
  const pad = 8;
  const W = 340;
  const vw = window.innerWidth, vh = window.innerHeight;
  let pos: React.CSSProperties = { left: vw / 2 - W / 2, top: vh / 2 - 90 };
  if (rect) {
    const below = rect.bottom + 12 + 170 < vh;
    const rightSide = rect.width < 320 && rect.right + 12 + W < vw;
    pos = rightSide
      ? { left: rect.right + 14, top: Math.max(12, Math.min(vh - 200, rect.top - 8)) }
      : { left: Math.max(12, Math.min(vw - W - 12, rect.left)), top: below ? rect.bottom + 12 : Math.max(12, rect.top - 182) };
  }
  const L = lang === "kz";

  return createPortal(
    <div className="no-print fixed inset-0 z-[60]">
      {rect ? (
        <div className="pointer-events-none fixed rounded-2xl transition-all duration-300"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(24,24,27,.45), 0 0 0 2px #4f52d1" }} />
      ) : (
        <div className="fixed inset-0 bg-zinc-900/45" />
      )}
      <div className="fixed rounded-2xl border border-black/[0.08] bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,.18)] transition-all duration-300"
        style={{ width: W, ...pos }}>
        <button className="absolute right-3 top-3 rounded-lg p-1 text-muted hover:bg-black/5" onClick={finish} aria-label="close"><X className="h-4 w-4" /></button>
        <div className="text-[11.5px] font-semibold uppercase tracking-wider text-accent">{i! + 1} / {steps.length}</div>
        <div className="mt-1 font-display text-[17px] font-semibold">{title}</div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">{text}</p>
        <div className="mt-4 flex items-center justify-between">
          <button className="text-[13px] text-muted hover:text-ink" onClick={finish}>{L ? "Өткізіп жіберу" : "Пропустить"}</button>
          <div className="flex gap-2">
            {i! > 0 && <button className="btn" onClick={() => setI(i! - 1)}>{L ? "Артқа" : "Назад"}</button>}
            <button className="btn btn-primary" onClick={() => (i! + 1 < steps.length ? setI(i! + 1) : finish())}>
              {i! + 1 < steps.length ? (L ? "Әрі қарай" : "Далее") : (L ? "Бастау" : "Начать работу")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
