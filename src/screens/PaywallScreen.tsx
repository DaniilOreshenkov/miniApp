/**
 * PaywallScreen — полноэкранный экран выбора подписки.
 * Показывается когда пользователь пытается использовать функцию выше своего плана.
 */

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { ds } from "../design-system/tokens";
import { ui } from "../design-system/ui";
import { SUBSCRIPTION_PLANS, getActivePlan, setActivePlanId, type PlanId } from "../entities/subscription/plans";

interface Props {
  /** Какая функция заблокирована — показывается в заголовке */
  lockedFeature?: string;
  onClose: () => void;
  onPlanSelected?: (planId: PlanId) => void;
}

const CHECK = "✓";
const LOCK = "🔒";

const PaywallScreen: React.FC<Props> = ({ lockedFeature, onClose, onPlanSelected }) => {
  const [selected, setSelected] = useState<PlanId>(getActivePlan().id);

  const activePlan = getActivePlan();
  const isAlreadyActive = activePlan.id === selected;

  const handleActivate = () => {
    setActivePlanId(selected);
    onPlanSelected?.(selected);
    onClose();
  };

  const content = (
    <div style={rootStyle}>
      <div style={topBarStyle}>
        <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
        <div style={topTitleStyle}>Подписка</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={scrollStyle} className="app-scroll">
        {lockedFeature && (
          <div style={lockedBannerStyle}>
            {LOCK} Для этой функции нужен план <strong>Про</strong>:<br />
            <span style={{ opacity: 0.8, fontSize: 13 }}>{lockedFeature}</span>
          </div>
        )}

        <div style={plansListStyle}>
          {SUBSCRIPTION_PLANS.map((plan) => {
            const isActive = selected === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelected(plan.id)}
                style={{
                  ...planCardStyle,
                  border: isActive
                    ? `2px solid ${ds.color.primary}`
                    : `1.5px solid ${ds.color.border}`,
                  background: isActive ? `${ds.color.primary}14` : ds.color.surfaceSoft,
                }}
              >
                <div style={planHeaderStyle}>
                  <div style={planNameStyle}>{plan.name}</div>
                  <div style={planPriceWrapStyle}>
                    <span style={planPriceStyle}>{plan.price}</span>
                    {plan.period && <span style={planPeriodStyle}>{plan.period}</span>}
                  </div>
                </div>
                <div style={planFeaturesStyle}>
                  {plan.features.map((f) => (
                    <div key={f} style={planFeatureRowStyle}>
                      <span style={{ color: ds.color.primary, fontWeight: 700 }}>{CHECK}</span>
                      <span>{f}</span>
                    </div>
                  ))}
                  {!plan.canChangeBg && (
                    <div style={{ ...planFeatureRowStyle, opacity: 0.45 }}>
                      <span>{LOCK}</span><span>Фон и цвет бусин при создании</span>
                    </div>
                  )}
                  {!plan.canCustomWatermark && (
                    <div style={{ ...planFeatureRowStyle, opacity: 0.45 }}>
                      <span>{LOCK}</span><span>Свой водяной знак</span>
                    </div>
                  )}
                </div>
                {isActive && (
                  <div style={planSelectedBadgeStyle}>
                    {activePlan.id === plan.id ? "✓ Активен" : "Выбран"}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div style={freeInfoStyle}>
          <div style={freeInfoTitleStyle}>Без подписки (тест)</div>
          <div style={freeInfoItemStyle}>✓ Создать 1 проект</div>
          <div style={freeInfoItemStyle}>✓ Полный редактор бусин</div>
          <div style={freeInfoItemStyle}>✓ Линейка, фигуры, текст</div>
          <div style={freeInfoItemStyle}>✓ Импорт фото → схема</div>
          <div style={freeInfoItemStyle}>✓ Экспорт PNG с @skapova_studio</div>
          <div style={{ ...freeInfoItemStyle, opacity: 0.5 }}>✗ Фон и цвет бусин при создании</div>
          <div style={{ ...freeInfoItemStyle, opacity: 0.5 }}>✗ Фон холста в редакторе</div>
          <div style={{ ...freeInfoItemStyle, opacity: 0.5 }}>✗ Свой водяной знак</div>
        </div>

        <div style={noteStyle}>
          Демо-режим — оплата не подключена.<br />
          Выбери план чтобы проверить ограничения.
        </div>

        <button
          type="button"
          style={activateBtnStyle}
          onClick={handleActivate}
        >
          {isAlreadyActive ? "✓ Активен сейчас" : `Активировать: ${SUBSCRIPTION_PLANS.find(p => p.id === selected)?.name}`}
        </button>

        <div style={safeBottomStyle} />
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default PaywallScreen;

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const rootStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 99990,
  background: "var(--bg)",
  display: "flex",
  flexDirection: "column",
  maxWidth: 520,
  marginLeft: "auto",
  marginRight: "auto",
};

const topBarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "grid",
  gridTemplateColumns: "52px 1fr 52px",
  alignItems: "center",
  gap: 8,
  padding: "var(--app-safe-top, 0px) 12px 0",
  height: "calc(var(--app-safe-top, 0px) + 56px)",
  background: "var(--bg)",
  borderBottom: `1px solid ${ds.color.border}`,
};

const closeBtnStyle: React.CSSProperties = {
  ...ui.iconButton,
  width: 40,
  height: 40,
  borderRadius: ds.radius.md,
  fontSize: 18,
};

const topTitleStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold,
  color: ds.color.textPrimary,
};

const scrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "16px 16px 0",
  boxSizing: "border-box",
};

const lockedBannerStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 16,
  background: `${ds.color.primary}1a`,
  border: `1px solid ${ds.color.primary}44`,
  color: ds.color.textPrimary,
  fontSize: 14,
  lineHeight: 1.5,
};

const plansListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const planCardStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 20,
  padding: 16,
  textAlign: "left",
  cursor: "pointer",
  transition: "border 0.15s, background 0.15s",
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const planHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
};

const planNameStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: ds.weight.bold,
  color: ds.color.textPrimary,
};

const planPriceWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 1,
};

const planPriceStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  color: ds.color.textPrimary,
};

const planPeriodStyle: React.CSSProperties = {
  fontSize: 11,
  color: ds.color.textTertiary,
  fontWeight: ds.weight.medium,
};

const planFeaturesStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const planFeatureRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  fontSize: 13,
  color: ds.color.textSecondary,
  lineHeight: 1.4,
};

const planSelectedBadgeStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  background: ds.color.primary,
  color: "#fff",
  fontSize: 11,
  fontWeight: 800,
  padding: "3px 8px",
  borderRadius: 8,
};

const freeInfoStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 16,
  background: ds.color.surfaceSoft,
  border: `1px solid ${ds.color.border}`,
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const freeInfoTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.5,
  textTransform: "uppercase" as const,
  color: ds.color.textTertiary,
  marginBottom: 4,
};

const freeInfoItemStyle: React.CSSProperties = {
  fontSize: 13,
  color: ds.color.textSecondary,
  lineHeight: 1.4,
};

const noteStyle: React.CSSProperties = {
  fontSize: 12,
  color: ds.color.textTertiary,
  textAlign: "center",
  lineHeight: 1.5,
  padding: "0 8px",
};

const activateBtnStyle: React.CSSProperties = {
  ...ui.primaryButton,
  width: "100%",
  minHeight: 58,
  padding: "16px 18px",
  borderRadius: ds.radius.xxl,
  fontSize: ds.font.buttonMd,
  boxShadow: ds.shadow.button,
};

const safeBottomStyle: React.CSSProperties = {
  flexShrink: 0,
  height: "max(20px, var(--app-tg-safe-bottom, 0px))",
};
