export type PlanId = "free" | "starter" | "monthly" | "pro";

export const PLAN_RANK: Record<PlanId, number> = {
  free:    0,
  starter: 1,
  monthly: 2,
  pro:     3,
};

export type Plan = {
  id: PlanId;
  name: string;
  price: string;
  period?: string;
  maxProjects: number;
  canResize: boolean;
  canBg: boolean;
  canWatermark: boolean;
  features?: string[];
};

export const STUDIO_FEATURES = [
  "Безлимит проектов",
  "Безлимит генерации схем из изображений",
  "Собственный водяной знак",
  "Собственный логотип",
  "Загрузка собственного фона",
  "Полная персонализация схем",
  "Карта цветов",
  "Экспорт в высоком качестве",
];

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Без плана",
    price: "Бесплатно",
    maxProjects: 0,
    canResize: false,
    canBg: false,
    canWatermark: false,
  },
  {
    id: "starter",
    name: "Стартер",
    price: "169 ₽",
    maxProjects: 1,
    canResize: false,
    canBg: false,
    canWatermark: false,
  },
  {
    id: "monthly",
    name: "Студия",
    price: "349 ₽",
    period: "в месяц",
    maxProjects: Infinity,
    canResize: true,
    canBg: true,
    canWatermark: true,
    features: STUDIO_FEATURES,
  },
  {
    id: "pro",
    name: "Студия (год)",
    price: "2 990 ₽",
    period: "в год",
    maxProjects: Infinity,
    canResize: true,
    canBg: true,
    canWatermark: true,
    features: STUDIO_FEATURES,
  },
];

const KEY = "beadly-plan-v1";

export function getActivePlan(): Plan {
  try {
    const saved = localStorage.getItem(KEY) as PlanId | null;
    // Новый пользователь без записи в localStorage получает "free" — не "starter".
    // "starter" появляется только после реальной покупки, которая пишет KEY в localStorage.
    return PLANS.find(p => p.id === saved) ?? PLANS.find(p => p.id === "free")!;
  } catch {
    return PLANS.find(p => p.id === "free")!;
  }
}

export function setActivePlan(id: PlanId): void {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}
