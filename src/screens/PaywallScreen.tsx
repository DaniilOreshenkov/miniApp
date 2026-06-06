import { useState, useEffect, useSyncExternalStore } from "react";
import { PLANS, PLAN_RANK, getActivePlan, setActivePlan, type PlanId } from "../entities/subscription/plans";

const PAYMENT_ID_KEY = "beadly-payment-id-v1";

const getTelegramUserId = (): string => {
  try {
    const tg = (window as Window & { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } } } } }).Telegram?.WebApp;
    const id = tg?.initDataUnsafe?.user?.id;
    if (id) return String(id);
  } catch { /* ignore */ }
  return "dev-" + (localStorage.getItem("beadly-dev-uid") ?? (() => {
    const uid = Math.random().toString(36).slice(2);
    localStorage.setItem("beadly-dev-uid", uid);
    return uid;
  })());
};

interface Props {
  onClose: () => void;
  onActivated: () => void;
  lockedFeature?: string;
}

/** Определяет минимальный план для разблокировки функции */
const getMinPlanForFeature = (feature?: string): PlanId => {
  if (!feature) return "starter";
  const f = feature.toLowerCase();
  if (f.includes("фон") || f.includes("водяной") || f.includes("watermark")) return "pro";
  if (f.includes("размер") || f.includes("resize")) return "monthly";
  return "starter";
};

export default function PaywallScreen({ onClose, onActivated, lockedFeature }: Props) {
  const active = getActivePlan();
  const suggestedPlanId = getMinPlanForFeature(lockedFeature);
  const [selected, setSelected] = useState<PlanId>(
    active.id === "free" ? suggestedPlanId : active.id
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRenewal, setAutoRenewal] = useState<boolean | null>(null);
  const [nextChargeAt, setNextChargeAt] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // Реактивная подписка на смену темы через MutationObserver → useSyncExternalStore
  const isDark = useSyncExternalStore(
    (onStoreChange) => {
      const obs = new MutationObserver(onStoreChange);
      obs.observe(document.documentElement, { attributeFilter: ["data-theme"] });
      return () => obs.disconnect();
    },
    () => document.documentElement.dataset.theme !== "light",
    () => true, // SSR: предполагаем тёмную тему
  );

  // Загружаем статус автоподписки
  useEffect(() => {
    const userId = getTelegramUserId();
    fetch(`/api/check-plan?userId=${userId}`)
      .then(r => r.json())
      .then((d: { autoRenewal?: boolean; nextChargeAt?: number }) => {
        setAutoRenewal(d.autoRenewal ?? false);
        setNextChargeAt(d.nextChargeAt ?? null);
      })
      .catch(() => {});
  }, []);

  const handleCancelSubscription = async () => {
    if (!window.confirm("Отменить автопродление? Подписка останется активной до конца оплаченного периода.")) return;
    setCancelling(true);
    try {
      await fetch("/api/cancel-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": import.meta.env.VITE_CLIENT_API_SECRET ?? "",
        },
        body: JSON.stringify({ userId: getTelegramUserId() }),
      });
      setAutoRenewal(false);
    } catch { /* ignore */ }
    finally { setCancelling(false); }
  };

  const bg     = isDark ? "#0b0e14" : "#f2f2f7";
  const card   = isDark ? "#151820" : "#ffffff";
  const text   = isDark ? "#f7f7fb" : "#1c1c1e";
  const sub    = isDark ? "rgba(247,247,251,0.56)" : "rgba(28,28,30,0.56)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const accent = "#7756df";


  async function handleActivate() {
    if (selected === "free") return;

    setLoading(true);
    setError(null);

    try {
      const userId    = getTelegramUserId();
      const returnUrl = "https://t.me/Beadlybot?startapp";

      const res = await fetch("/api/create-payment", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ planId: selected, userId, returnUrl }),
      });

      const data = await res.json() as { paymentId?: string; confirmationUrl?: string; error?: unknown };

      if (!data.confirmationUrl || !data.paymentId) {
        setError("Не удалось создать платёж. Попробуй ещё раз.");
        return;
      }

      localStorage.setItem(PAYMENT_ID_KEY, data.paymentId);
      localStorage.setItem("beadly-payment-ts-v1", String(Date.now()));

      const tg = (window as Window & {
        Telegram?: { WebApp?: { openLink?: (url: string) => void } };
      }).Telegram?.WebApp;

      if (tg?.openLink) {
        tg.openLink(data.confirmationUrl);
      } else {
        window.open(data.confirmationUrl, "_blank");
      }

      onClose();
    } catch {
      setError("Ошибка соединения. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, zIndex:99999,
      background:bg,
      animation:"ui-sheet-in 360ms cubic-bezier(0.32, 0.72, 0, 1) both" }}>
    <div style={{ maxWidth:520, width:"100%", margin:"0 auto", height:"100%", display:"flex", flexDirection:"column" }}>

      {/* Шапка */}
      <div style={{ display:"flex", alignItems:"center", padding:"var(--app-safe-top,0px) 16px 0",
        height:"calc(var(--app-safe-top,0px) + 56px)", borderBottom:`1px solid ${border}`, flexShrink:0 }}>
        <button onClick={onClose} style={{ background:"none", border:"none", color:text,
          fontSize:20, cursor:"pointer", width:40, height:40, display:"flex",
          alignItems:"center", justifyContent:"center" }}>✕</button>
        <div style={{ flex:1, textAlign:"center", fontSize:17, fontWeight:700, color:text }}>Подписка</div>
        <div style={{ width:40 }} />
      </div>

      {/* Контент */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 0", display:"flex",
        flexDirection:"column", gap:12, boxSizing:"border-box" }}>

        {/* Баннер заблокированной функции */}
        {lockedFeature && (
          <div style={{ padding:"12px 14px", borderRadius:14, border:`1px solid ${accent}44`,
            background:`${accent}18`, color:text, fontSize:14, lineHeight:1.5 }}>
            🔒 Для этого нужен план <b>{PLANS.find(p => p.id === suggestedPlanId)?.name ?? "Про"}</b>: {lockedFeature}
          </div>
        )}

        {/* Текущий план + быстрый сброс */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}>
          <div style={{ color:sub, fontSize:13 }}>
            Активен: <b style={{ color:text }}>{active.name}</b>
          </div>
          {active.id !== "free" && (
            <button onClick={() => { setActivePlan("free"); onActivated(); onClose(); }}
              style={{ background:"rgba(255,59,48,0.10)", border:"1px solid rgba(255,59,48,0.25)", borderRadius:8,
                padding:"4px 10px", fontSize:12, color:"#ff3b30", cursor:"pointer", fontWeight:600 }}>
              🧪 Без плана
            </button>
          )}
        </div>

        {/* Активный план — если не free */}
        {active.id !== "free" && (
          <div style={{ padding:"12px 16px", borderRadius:16, border:`1px solid ${accent}`,
            background:`${accent}12`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:13, color:sub, marginBottom:2 }}>Текущий план</div>
              <div style={{ fontSize:16, fontWeight:700, color:text }}>{active.name}</div>
            </div>
            <span style={{ fontSize:11, fontWeight:700, background:accent,
              color:"#fff", padding:"4px 10px", borderRadius:8 }}>Активен ✓</span>
          </div>
        )}

        {/* Статус автоподписки */}
        {active.id !== "free" && active.id !== "starter" && autoRenewal !== null && (
          <div style={{ padding:"12px 14px", borderRadius:14,
            background: autoRenewal ? "rgba(52,199,89,0.08)" : "rgba(255,59,48,0.08)",
            border: `1px solid ${autoRenewal ? "rgba(52,199,89,0.25)" : "rgba(255,59,48,0.20)"}`,
            display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color: autoRenewal ? "#34c759" : "#ff3b30" }}>
                {autoRenewal ? "Автопродление включено" : "Автопродление отключено"}
              </div>
              {autoRenewal && nextChargeAt && (
                <div style={{ fontSize:12, color:sub, marginTop:2 }}>
                  Следующее списание: {new Date(nextChargeAt).toLocaleDateString("ru-RU", { day:"numeric", month:"long" })}
                </div>
              )}
              {!autoRenewal && (
                <div style={{ fontSize:12, color:sub, marginTop:2 }}>
                  Подписка не продлится автоматически
                </div>
              )}
            </div>
            {autoRenewal && (
              <button onClick={handleCancelSubscription} disabled={cancelling}
                style={{ background:"none", border:`1px solid rgba(255,59,48,0.3)`,
                  borderRadius:8, padding:"5px 10px", fontSize:12, color:"#ff3b30",
                  cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
                {cancelling ? "…" : "Отменить"}
              </button>
            )}
          </div>
        )}

        {/* Карточки для апгрейда */}
        {(() => {
          const upgradePlans = PLANS.filter(p =>
            p.id !== "free" && PLAN_RANK[p.id] > PLAN_RANK[active.id]
          );

          if (upgradePlans.length === 0) {
            return (
              <div style={{ textAlign:"center", padding:"24px 0", color:sub, fontSize:14 }}>
                🎉 У тебя максимальный план!
              </div>
            );
          }

          return upgradePlans.map(plan => {
            const isSelected = selected === plan.id;
            return (
              <button key={plan.id} onClick={() => setSelected(plan.id)}
                style={{ width:"100%", textAlign:"left", cursor:"pointer", borderRadius:18,
                  padding:"14px 16px", boxSizing:"border-box",
                  background: isSelected ? `${accent}18` : card,
                  border: `${isSelected ? 2 : 1}px solid ${isSelected ? accent : border}`,
                  display:"flex", flexDirection:"column", gap:8 }}>

                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:16, fontWeight:700, color:text }}>{plan.name}</span>
                    {plan.id === "pro" && (
                      <span style={{ fontSize:10, fontWeight:700, background:"linear-gradient(135deg,#f5a623,#e8612c)",
                        color:"#fff", padding:"2px 7px", borderRadius:8 }}>⭐ Лучший</span>
                    )}
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:17, fontWeight:900, color:text }}>{plan.price}</div>
                    {plan.period && <div style={{ fontSize:11, color:sub }}>{plan.period}</div>}
                  </div>
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  {(plan.features ?? []).map(f => (
                    <div key={f} style={{ fontSize:13, color:sub, display:"flex", gap:7 }}>
                      <span style={{ color:accent, fontWeight:700 }}>✓</span>{f}
                    </div>
                  ))}
                </div>
              </button>
            );
          });
        })()}

        {/* Ошибка */}
        {error && (
          <div style={{ padding:"10px 14px", borderRadius:12, background:"rgba(255,59,48,0.10)",
            border:"1px solid rgba(255,59,48,0.25)", color:"#ff3b30", fontSize:13 }}>
            {error}
          </div>
        )}

        {/* Кнопка оплаты */}
        {PLAN_RANK[active.id] < PLAN_RANK["pro"] && (
          <button onClick={handleActivate} disabled={loading || selected === "free"}
            style={{ width:"100%", minHeight:56, borderRadius:18, border:"none",
              cursor: loading || selected === "free" ? "not-allowed" : "pointer",
              opacity: selected === "free" ? 0.4 : 1,
              background: `linear-gradient(135deg,#8260f2,#6e4fd7)`,
              color: "#ffffff", fontSize:16, fontWeight:700, boxSizing:"border-box",
              display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
            {loading ? (
              <>
                <span style={{ width:18, height:18, borderRadius:"50%",
                  border:"2.5px solid rgba(255,255,255,0.3)", borderTopColor:"#fff",
                  animation:"spin 0.7s linear infinite", display:"inline-block" }} />
                Создаём платёж…
              </>
            ) : selected === "free"
              ? "Выбери план выше"
              : `Оплатить «${PLANS.find(p=>p.id===selected)?.name}»`}
          </button>
        )}

        <div style={{ height:"max(20px,var(--app-tg-safe-bottom,0px))", flexShrink:0 }} />
      </div>
    </div>{/* maxWidth wrapper */}
    </div>{/* backdrop */}

    </>
  );
}
