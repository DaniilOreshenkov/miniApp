import { useState } from "react";
import { PLANS, getActivePlan, setActivePlan, type PlanId } from "../entities/subscription/plans";

interface Props {
  onClose: () => void;
  onActivated: () => void;
  lockedFeature?: string;
}

export default function PaywallScreen({ onClose, onActivated, lockedFeature }: Props) {
  const active = getActivePlan();
  const [selected, setSelected] = useState<PlanId>(active.id);
  const isDark = document.documentElement.dataset.theme !== "light";

  const bg     = isDark ? "#0b0e14" : "#f2f2f7";
  const card   = isDark ? "#151820" : "#ffffff";
  const text   = isDark ? "#f7f7fb" : "#1c1c1e";
  const sub    = isDark ? "rgba(247,247,251,0.56)" : "rgba(28,28,30,0.56)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const accent = "#7756df";

  function handleActivate() {
    setActivePlan(selected);
    onActivated();
    onClose();
  }

  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, zIndex:99999,
      background:bg, display:"flex", flexDirection:"column" }}>

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
            🔒 Для этого нужен план <b>Про</b>: {lockedFeature}
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

        {/* Карточки планов */}
        {PLANS.map(plan => {
          const isSelected = selected === plan.id;
          const isCurrent  = active.id === plan.id;
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
                  {isCurrent && (
                    <span style={{ fontSize:11, fontWeight:700, background:accent,
                      color:"#fff", padding:"2px 7px", borderRadius:8 }}>Активен</span>
                  )}
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:17, fontWeight:900, color:text }}>{plan.price}</div>
                  {plan.period && <div style={{ fontSize:11, color:sub }}>{plan.period}</div>}
                </div>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ fontSize:13, color:sub, display:"flex", gap:7 }}>
                    <span style={{ color:accent, fontWeight:700 }}>✓</span>{f}
                  </div>
                ))}
                {!plan.canBg && (
                  <div style={{ fontSize:13, color:sub, display:"flex", gap:7, opacity:0.5 }}>
                    <span>✗</span>Фон и цвет бусин
                  </div>
                )}
                {!plan.canWatermark && (
                  <div style={{ fontSize:13, color:sub, display:"flex", gap:7, opacity:0.5 }}>
                    <span>✗</span>Свой водяной знак
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {/* Кнопка */}
        <button onClick={handleActivate}
          style={{ width:"100%", minHeight:56, borderRadius:18, border:"none", cursor:"pointer",
            background: selected === active.id
              ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)")
              : `linear-gradient(135deg,#8260f2,#6e4fd7)`,
            color: selected === active.id ? sub : "#ffffff",
            fontSize:16, fontWeight:700, boxSizing:"border-box" }}>
          {selected === active.id
            ? `✓ Активен (${PLANS.find(p=>p.id===selected)?.name})`
            : `Активировать «${PLANS.find(p=>p.id===selected)?.name}»`}
        </button>

        <div style={{ height:"max(20px,var(--app-tg-safe-bottom,0px))", flexShrink:0 }} />
      </div>
    </div>
  );
}
