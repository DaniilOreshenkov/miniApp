import { useState, useEffect, useSyncExternalStore } from "react";
import { STUDIO_FEATURES, getActivePlan, setActivePlan } from "../entities/subscription/plans";
import type { PlanId } from "../entities/subscription/plans";

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

export default function PaywallScreen({ onClose, onActivated, lockedFeature }: Props) {
  const active = getActivePlan();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRenewal, setAutoRenewal] = useState<boolean | null>(null);
  const [nextChargeAt, setNextChargeAt] = useState<number | null>(null);
  const [isTrial, setIsTrial] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isDark = useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb);
      obs.observe(document.documentElement, { attributeFilter: ["data-theme"] });
      return () => obs.disconnect();
    },
    () => document.documentElement.dataset.theme !== "light",
    () => true,
  );

  const isActive = active.id === "monthly" || active.id === "pro";
  const selectedPlanId: PlanId = billing === "yearly" ? "pro" : "monthly";

  useEffect(() => {
    const userId = getTelegramUserId();
    fetch(`/api/check-plan?userId=${userId}`)
      .then(r => r.json())
      .then((d: { autoRenewal?: boolean; nextChargeAt?: number; isTrial?: boolean; trialEndsAt?: number | null }) => {
        setAutoRenewal(d.autoRenewal ?? false);
        setNextChargeAt(d.nextChargeAt ?? null);
        setIsTrial(d.isTrial ?? false);
        setTrialEndsAt(d.trialEndsAt ?? null);
      })
      .catch(() => {});
  }, []);

  const handleCancelSubscription = () => setConfirmCancel(true);

  const handleConfirmCancel = async () => {
    setConfirmCancel(false);
    setCancelling(true);
    try {
      await fetch("/api/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-secret": import.meta.env.VITE_CLIENT_API_SECRET ?? "" },
        body: JSON.stringify({ userId: getTelegramUserId() }),
      });
      setAutoRenewal(false);
    } catch { /* ignore */ }
    finally { setCancelling(false); }
  };

  async function handleActivate() {
    setLoading(true);
    setError(null);
    try {
      const userId = getTelegramUserId();
      const returnUrl = "https://t.me/Beadlybot?startapp";
      const res = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlanId, userId, returnUrl }),
      });
      const data = await res.json() as { paymentId?: string; confirmationUrl?: string; error?: unknown };
      if (!data.confirmationUrl || !data.paymentId) { setError("Не удалось создать платёж. Попробуй ещё раз."); return; }
      localStorage.setItem(PAYMENT_ID_KEY, data.paymentId);
      localStorage.setItem("beadly-payment-ts-v1", String(Date.now()));
      // telegram-web-app.js подключён всегда, поэтому tg.openLink существует и в
      // обычном браузере, но вне Telegram он не работает. Определяем «реальный»
      // Telegram по непустому initData — иначе делаем обычный редирект браузера.
      const tg = (window as Window & {
        Telegram?: { WebApp?: { openLink?: (url: string) => void; initData?: string } };
      }).Telegram?.WebApp;
      const inTelegram = typeof tg?.openLink === "function" && !!tg.initData;
      if (inTelegram) {
        tg!.openLink!(data.confirmationUrl);
        onClose();
      } else {
        // Полный редирект надёжнее window.open: не блокируется попап-блокером
        // после await. После оплаты ЮKassa вернёт по returnUrl.
        window.location.href = data.confirmationUrl;
      }
    } catch {
      setError("Ошибка соединения. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  const bg     = isDark ? "#0b0e14" : "#f2f2f7";
  const card   = isDark ? "#151820" : "#ffffff";
  const text   = isDark ? "#f7f7fb" : "#1c1c1e";
  const sub    = isDark ? "rgba(247,247,251,0.56)" : "rgba(28,28,30,0.56)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const accent = "#7756df";

  return (
    <div style={{ position:"fixed", inset:0, zIndex:99999, background:bg,
      animation:"ui-sheet-in 360ms cubic-bezier(0.32,0.72,0,1) both", display:"flex", flexDirection:"column",
      borderRadius:"var(--tg-border-radius, 12px)", overflow:"hidden" }}>
      <div style={{ maxWidth:520, width:"100%", margin:"0 auto", height:"100%", display:"flex", flexDirection:"column" }}>

        {/* Top bar */}
        <div style={{ display:"flex", alignItems:"center", padding:"var(--app-safe-top,0px) 16px 0",
          height:"calc(var(--app-safe-top,0px) + 56px)", borderBottom:`1px solid ${border}`, flexShrink:0 }}>
          <button onClick={onClose} style={{ background:"none", border:"none", color:text,
            cursor:"pointer", width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:12 }}>
            <svg width="11" height="18" viewBox="0 0 11 18" fill="none">
              <path d="M9.5 1.5L2 9L9.5 16.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ flex:1, textAlign:"center", fontSize:17, fontWeight:700, color:text }}>Подписка</div>
          <div style={{ width:40 }} />
        </div>

        {/* Scroll content */}
        <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column",
          padding:"20px 16px 0", gap:16, boxSizing:"border-box" }}>

          {/* Hero */}
          <div style={{ borderRadius:24, background:`linear-gradient(135deg, #6e4fd7 0%, #9b59d4 50%, #c77ddf 100%)`,
            padding:"32px 20px 28px", display:"flex", flexDirection:"column", alignItems:"center", gap:12,
            position:"relative", overflow:"clip", minHeight:160, flexShrink:0 }}>
            {/* Декоративные пузырьки — внутри границ */}
            <div style={{ position:"absolute", top:0, right:0, width:130, height:130, borderRadius:"50%",
              background:"rgba(255,255,255,0.07)", transform:"translate(40px,-40px)", pointerEvents:"none" }} />
            <div style={{ position:"absolute", bottom:0, left:0, width:90, height:90, borderRadius:"50%",
              background:"rgba(255,255,255,0.05)", transform:"translate(-30px,30px)", pointerEvents:"none" }} />
            {/* Иконка */}
            <div style={{ position:"relative", zIndex:1, width:68, height:68, borderRadius:22,
              background:"rgba(255,255,255,0.18)", border:"1.5px solid rgba(255,255,255,0.3)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:34, boxShadow:"0 8px 24px rgba(0,0,0,0.18)" }}>
              ✦
            </div>
            <div style={{ textAlign:"center", position:"relative", zIndex:1 }}>
              <div style={{ fontSize:28, fontWeight:900, color:"#fff", letterSpacing:-0.5, lineHeight:1.1 }}>
                Студия
              </div>
              <div style={{ fontSize:14, color:"rgba(255,255,255,0.80)", marginTop:6, fontWeight:500 }}>
                Полный доступ к Beadly
              </div>
            </div>
          </div>

          {/* Заблокированная функция */}
          {lockedFeature && (
            <div style={{ padding:"12px 16px", borderRadius:16, border:`1px solid ${accent}44`,
              background:`${accent}14`, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:`${accent}20`,
                border:`1px solid ${accent}40`, display:"flex", alignItems:"center",
                justifyContent:"center", flexShrink:0, color:accent }}>
                <svg width="18" height="18" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                  <path d="M9 12V9.6C9 6.85 11.05 4.9 14 4.9C16.95 4.9 19 6.85 19 9.6V12"
                    stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"/>
                  <rect x="7.2" y="11.6" width="13.6" height="10.8" rx="3"
                    stroke="currentColor" strokeWidth="2.25"/>
                  <path d="M14 16.1V18.2" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:text, marginBottom:2 }}>
                  Нужна подписка Студия
                </div>
                <div style={{ fontSize:12, color:sub, lineHeight:1.4 }}>
                  Для доступа к <b style={{ color:text }}>{lockedFeature}</b>
                </div>
              </div>
            </div>
          )}

          {/* Активный план + автопродление */}
          {isActive && (
            <>
              <div style={{ padding:"12px 16px", borderRadius:16, border:`1px solid ${accent}`,
                background:`${accent}12`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:12, color:sub, marginBottom:2 }}>Текущий план</div>
                  <div style={{ fontSize:16, fontWeight:700, color:text }}>Студия ✓</div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => { setActivePlan("free"); onActivated(); onClose(); }}
                    style={{ background:"rgba(255,59,48,0.10)", border:"1px solid rgba(255,59,48,0.25)",
                      borderRadius:8, padding:"4px 10px", fontSize:12, color:"#ff3b30", cursor:"pointer", fontWeight:600 }}>
                    🧪 Без плана
                  </button>
                </div>
              </div>

              {autoRenewal !== null && (
                <div style={{ padding:"12px 14px", borderRadius:14,
                  background: isTrial ? "rgba(119,86,223,0.08)" : autoRenewal ? "rgba(52,199,89,0.08)" : "rgba(255,59,48,0.08)",
                  border: `1px solid ${isTrial ? "rgba(119,86,223,0.30)" : autoRenewal ? "rgba(52,199,89,0.25)" : "rgba(255,59,48,0.20)"}`,
                  display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600,
                      color: isTrial ? "#7756df" : autoRenewal ? "#34c759" : "#ff3b30" }}>
                      {isTrial ? "✦ Пробный период активен" : autoRenewal ? "Автопродление включено" : "Автопродление отключено"}
                    </div>
                    {isTrial && trialEndsAt && (
                      <div style={{ fontSize:12, color:sub, marginTop:2 }}>
                        Бесплатно до {new Date(trialEndsAt).toLocaleDateString("ru-RU", { day:"numeric", month:"long" })}
                        {" · "}затем {active.id === "pro" ? "2 990 ₽/год" : "349 ₽/мес"}
                      </div>
                    )}
                    {!isTrial && autoRenewal && nextChargeAt && (
                      <div style={{ fontSize:12, color:sub, marginTop:2 }}>
                        Следующее списание: {new Date(nextChargeAt).toLocaleDateString("ru-RU", { day:"numeric", month:"long" })}
                      </div>
                    )}
                  </div>
                  {autoRenewal && !confirmCancel && (
                    <button onClick={handleCancelSubscription} disabled={cancelling}
                      style={{ background:"none", border:"1px solid rgba(255,59,48,0.3)", borderRadius:8,
                        padding:"5px 10px", fontSize:12, color:"#ff3b30", cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
                      {cancelling ? "…" : "Отменить"}
                    </button>
                  )}
                </div>
              )}
              {/* Inline-подтверждение отмены — без window.confirm */}
              {confirmCancel && (
                <div style={{ padding:"12px 14px", borderRadius:14,
                  background:"rgba(255,59,48,0.08)", border:"1px solid rgba(255,59,48,0.25)",
                  display:"flex", flexDirection:"column", gap:8 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:text }}>
                    Отменить автопродление?
                  </div>
                  <div style={{ fontSize:12, color:sub, lineHeight:1.4 }}>
                    Подписка останется активной до конца оплаченного периода.
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => setConfirmCancel(false)}
                      style={{ flex:1, height:34, borderRadius:9, border:`1px solid ${border}`,
                        background:"none", color:text, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                      Нет
                    </button>
                    <button onClick={handleConfirmCancel}
                      style={{ flex:1, height:34, borderRadius:9, border:"none",
                        background:"rgba(255,59,48,0.15)", color:"#ff3b30",
                        fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      Да, отменить
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Переключатель месяц / год */}
          {!isActive && (
            <div style={{ display:"flex", gap:4, padding:4, borderRadius:16,
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
              border:`1px solid ${border}` }}>
              {(["monthly", "yearly"] as const).map((b) => (
                <button key={b} onClick={() => setBilling(b)}
                  style={{ flex:1, height:40, borderRadius:12, border:"none", cursor:"pointer",
                    fontSize:14, fontWeight:700, transition:"background 160ms, color 160ms",
                    background: billing === b ? accent : "transparent",
                    color: billing === b ? "#fff" : sub,
                    position:"relative" as const }}>
                  {b === "monthly" ? "349 ₽ / месяц" : "2 990 ₽ / год"}
                  {b === "yearly" && (
                    <span style={{ position:"absolute", top:-8, right:6, fontSize:9, fontWeight:900,
                      background:"#34c759", color:"#fff", borderRadius:6, padding:"1px 5px", letterSpacing:0.2 }}>
                      −29%
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Фичи */}
          {!isActive && (
            <div style={{ borderRadius:20, background:card, border:`1px solid ${border}`,
              padding:"4px 16px", display:"flex", flexDirection:"column" }}>
              {STUDIO_FEATURES.map((f, i) => (
                <div key={f}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0" }}>
                    <span style={{ width:22, height:22, borderRadius:"50%", background:`${accent}20`,
                      border:`1px solid ${accent}50`, display:"flex", alignItems:"center",
                      justifyContent:"center", flexShrink:0 }}>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span style={{ fontSize:14, color:text, fontWeight:500 }}>{f}</span>
                  </div>
                  {i < STUDIO_FEATURES.length - 1 && (
                    <div style={{ height:1, background:border, marginLeft:34 }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Ошибка */}
          {error && (
            <div style={{ padding:"10px 14px", borderRadius:12, background:"rgba(255,59,48,0.10)",
              border:"1px solid rgba(255,59,48,0.25)", color:"#ff3b30", fontSize:13 }}>
              {error}
            </div>
          )}

          {/* CTA */}
          {!isActive && (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button onClick={handleActivate} disabled={loading}
                style={{ width:"100%", minHeight:58, borderRadius:20, border:"none",
                  cursor: loading ? "not-allowed" : "pointer",
                  background:"linear-gradient(135deg, #8260f2, #6e4fd7)",
                  color:"#ffffff", fontSize:16, fontWeight:700,
                  boxShadow:"0 8px 24px rgba(119,86,223,0.4)",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                {loading ? (
                  <>
                    <span style={{ width:18, height:18, borderRadius:"50%",
                      border:"2.5px solid rgba(255,255,255,0.3)", borderTopColor:"#fff",
                      animation:"spin 0.7s linear infinite", display:"inline-block" }} />
                    Создаём платёж…
                  </>
                ) : (
                  <>
                    ✦ 3 дня бесплатно → затем {billing === "monthly" ? "349 ₽/мес" : "2 990 ₽/год"}
                  </>
                )}
              </button>
              <div style={{ textAlign:"center", fontSize:12, color:sub, lineHeight:1.5 }}>
                Отменить можно в любой момент · Без скрытых платежей
              </div>
            </div>
          )}

          <div style={{ height:"max(20px,var(--app-tg-safe-bottom,0px))", flexShrink:0 }} />
        </div>
      </div>
    </div>
  );
}
