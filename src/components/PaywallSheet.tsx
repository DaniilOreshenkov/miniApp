/**
 * PaywallSheet — shows when the user taps "Скачать PNG".
 *
 * Free plan downloads immediately (with watermark).
 * Paid plans show a "Скоро" badge — payment integration comes later.
 */

import React, { useEffect, useRef, useState } from "react";
import { ds } from "../design-system/tokens";
import { PLANS } from "../entities/subscription/plans";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called when the user chooses the free plan (download with watermark). */
  onDownloadFree: () => void;
}

const PaywallSheet: React.FC<Props> = ({ open, onClose, onDownloadFree }) => {
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Mount → render → next frame → visible (triggers CSS transition in)
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRendered(true);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setVisible(true));
      });
      return () => window.cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const id = window.setTimeout(() => setRendered(false), 340);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  if (!rendered) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleFreeDownload = () => {
    onDownloadFree();
    onClose();
  };

  return (
    <div
      ref={overlayRef}
      style={overlayStyle(visible)}
      onClick={handleOverlayClick}
    >
      <div style={sheetStyle(visible)}>
        {/* Handle */}
        <div style={handleWrapStyle}>
          <div style={handleBarStyle} />
        </div>

        {/* Header */}
        <div style={headerStyle}>
          <div style={headerTitleStyle}>Скачать проект</div>
          <button type="button" style={closeButtonStyle} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 3L13 13M13 3L3 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Plans */}
        <div style={plansWrapStyle}>
          {PLANS.map((plan, index) => {
            const isFree = plan.id === "starter";
            const isFirst = index === 0;

            return (
              <div
                key={plan.id}
                style={planCardStyle(isFree, isFirst)}
              >
                {/* Plan header */}
                <div style={planHeaderStyle}>
                  <div style={planNameRowStyle}>
                    <span style={planNameStyle(isFree)}>{plan.name}</span>

                  </div>
                  <div style={planPriceRowStyle}>
                    <span style={planPriceStyle(isFree)}>{plan.price}</span>
                    {plan.period && (
                      <span style={planPeriodStyle}> / {plan.period}</span>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div style={featuresListStyle}>
                  {(plan.features ?? []).map((feature) => (
                    <div key={feature} style={featureRowStyle}>
                      <span style={featureCheckStyle(isFree)}>✓</span>
                      <span style={featureTextStyle}>{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Action */}
                {isFree ? (
                  <button
                    type="button"
                    style={freeButtonStyle}
                    onClick={handleFreeDownload}
                  >
                    Скачать с водяным знаком
                  </button>
                ) : (
                  <div style={soonButtonStyle}>
                    <span style={soonButtonTextStyle}>
                      {plan.id === "starter" ? "Купить" : "Подключить"} — {plan.price}
                    </span>
                    <span style={soonButtonBadgeStyle}>Скоро</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Safe-area spacer */}
        <div style={safeBottomStyle} />
      </div>
    </div>
  );
};

export default PaywallSheet;

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const overlayStyle = (visible: boolean): React.CSSProperties => ({
  position: "fixed",
  inset: 0,
  zIndex: 200,
  backgroundColor: visible ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)",
  transition: "background-color 0.28s ease",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
});

const sheetStyle = (visible: boolean): React.CSSProperties => ({
  width: "100%",
  maxWidth: 480,
  background: ds.color.bgTop,
  borderRadius: `${ds.radius.sheet}px ${ds.radius.sheet}px 0 0`,
  boxShadow: ds.shadow.sheet,
  overflowY: "auto",
  maxHeight: "calc(var(--app-height, 100dvh) - var(--app-safe-top, 0px) - 8px)",
  transform: visible ? "translateY(0)" : "translateY(100%)",
  transition: visible
    ? "transform 0.36s cubic-bezier(0.32, 0, 0.15, 1)"
    : "transform 0.28s cubic-bezier(0.4, 0, 1, 1)",
  willChange: "transform",
  overscrollBehavior: "contain",
});

const handleWrapStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  paddingTop: 10,
  paddingBottom: 4,
};

const handleBarStyle: React.CSSProperties = {
  width: 36,
  height: 4,
  borderRadius: 99,
  background: "rgba(255,255,255,0.18)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 20px 8px",
};

const headerTitleStyle: React.CSSProperties = {
  fontSize: ds.font.titleMd,
  fontWeight: ds.weight.semibold,
  color: ds.color.textPrimary,
  letterSpacing: -0.2,
};

const closeButtonStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 99,
  background: ds.color.surfaceSoft,
  border: "none",
  cursor: "pointer",
  color: ds.color.textSecondary,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const plansWrapStyle: React.CSSProperties = {
  padding: "8px 16px 0",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const planCardStyle = (isFree: boolean, isFirst: boolean): React.CSSProperties => ({
  borderRadius: ds.radius.xl,
  padding: "14px 16px 14px",
  background: isFree
    ? "linear-gradient(135deg, rgba(130,96,242,0.18) 0%, rgba(110,79,215,0.10) 100%)"
    : ds.color.surfaceSoft,
  border: `1px solid ${isFree ? "rgba(130,96,242,0.30)" : ds.color.border}`,
  marginTop: isFirst ? 0 : 0,
});

const planHeaderStyle: React.CSSProperties = {
  marginBottom: 8,
};

const planNameRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 2,
};

const planNameStyle = (isFree: boolean): React.CSSProperties => ({
  fontSize: ds.font.titleSm,
  fontWeight: ds.weight.semibold,
  color: isFree ? ds.color.primary2 : ds.color.textPrimary,
  letterSpacing: -0.2,
});


const planPriceRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 0,
};

const planPriceStyle = (isFree: boolean): React.CSSProperties => ({
  fontSize: isFree ? ds.font.bodyMd : ds.font.bodyLg,
  fontWeight: ds.weight.medium,
  color: isFree ? ds.color.textSecondary : ds.color.textPrimary,
});

const planPeriodStyle: React.CSSProperties = {
  fontSize: ds.font.bodySm,
  color: ds.color.textTertiary,
};

const featuresListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  marginBottom: 12,
};

const featureRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
};

const featureCheckStyle = (isFree: boolean): React.CSSProperties => ({
  fontSize: 12,
  fontWeight: ds.weight.semibold,
  color: isFree ? ds.color.primary2 : ds.color.textTertiary,
  flexShrink: 0,
  marginTop: 1,
});

const featureTextStyle: React.CSSProperties = {
  fontSize: ds.font.bodySm,
  color: ds.color.textSecondary,
  lineHeight: 1.4,
};

const freeButtonStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  borderRadius: ds.radius.lg,
  background: ds.color.primaryButtonBg,
  color: ds.color.primaryButtonText,
  fontSize: ds.font.bodyLg,
  fontWeight: ds.weight.semibold,
  border: "none",
  cursor: "pointer",
  boxShadow: ds.shadow.button,
  letterSpacing: -0.2,
};

const soonButtonStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  borderRadius: ds.radius.lg,
  background: "rgba(255,255,255,0.05)",
  border: `1px solid ${ds.color.border}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const soonButtonTextStyle: React.CSSProperties = {
  fontSize: ds.font.bodyMd,
  fontWeight: ds.weight.medium,
  color: ds.color.textTertiary,
  letterSpacing: -0.2,
};

const soonButtonBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: ds.weight.semibold,
  color: ds.color.textQuaternary,
  background: ds.color.surfaceStrong,
  borderRadius: 99,
  padding: "2px 7px",
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

const safeBottomStyle: React.CSSProperties = {
  height: "max(16px, env(safe-area-inset-bottom, 8px))",
};
