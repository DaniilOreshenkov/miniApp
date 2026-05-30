/**
 * Subscription plan definitions.
 *
 * Tier structure:
 *   starter  — 169 ₽ one-time, max 1 project
 *   monthly  — 300 ₽/month, unlimited projects
 *   pro      — 750 ₽, everything unlocked
 *
 * starter + monthly: no bg/bead color at creation, no custom watermark
 * pro: all features
 */

export type PlanId = "starter" | "monthly" | "pro";

export type SubscriptionPlan = {
  id: PlanId;
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  /** Max number of saved projects (Infinity = unlimited) */
  maxProjects: number;
  /** Can change background color/image when creating a project */
  canChangeBg: boolean;
  /** Can change bead color when creating a project */
  canChangeBeadColor: boolean;
  /** Can use custom watermark text / disable brand watermark */
  canCustomWatermark: boolean;
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Стартер",
    price: "169 ₽",
    description: "Попробуй бесплатно",
    features: [
      "1 проект",
      "Базовый редактор",
      "Экспорт PNG с брендом @skapova_studio",
    ],
    maxProjects: 1,
    canChangeBg: false,
    canChangeBeadColor: false,
    canCustomWatermark: false,
  },
  {
    id: "monthly",
    name: "Месячная",
    price: "300 ₽",
    period: "в месяц",
    description: "Безлимитные проекты",
    features: [
      "Безлимитные проекты",
      "Полный редактор",
      "Экспорт PNG с брендом @skapova_studio",
    ],
    maxProjects: Infinity,
    canChangeBg: false,
    canChangeBeadColor: false,
    canCustomWatermark: false,
  },
  {
    id: "pro",
    name: "Про",
    price: "750 ₽",
    description: "Полный контроль",
    features: [
      "Безлимитные проекты",
      "Выбор фона и цвета бусин при создании",
      "Свой водяной знак или отключить",
      "Полный редактор",
    ],
    maxProjects: Infinity,
    canChangeBg: true,
    canChangeBeadColor: true,
    canCustomWatermark: true,
  },
];

export const getPlanById = (id: PlanId): SubscriptionPlan =>
  SUBSCRIPTION_PLANS.find((p) => p.id === id) ?? SUBSCRIPTION_PLANS[0];

/* ─── Subscription storage ─────────────────────────────────────────────── */

const SUBSCRIPTION_KEY = "beadly-subscription-v1";

export const getActivePlan = (): SubscriptionPlan => {
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_KEY);
    if (raw) {
      const id = JSON.parse(raw) as PlanId;
      return getPlanById(id);
    }
  } catch { /* ignore */ }
  return SUBSCRIPTION_PLANS[0]; // default: starter
};

export const setActivePlanId = (id: PlanId) => {
  try { localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(id)); } catch { /* ignore */ }
};
