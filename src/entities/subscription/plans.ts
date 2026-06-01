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
  canResize: boolean;   // изменение размера сетки в редакторе
  canBg: boolean;       // фон и цвет бусин при создании + фон в редакторе
  canWatermark: boolean; // свой водяной знак / отключение
  features?: string[];  // список фич для PaywallScreen
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Без плана",
    price: "Бесплатно",
    maxProjects: 0,  // только просмотр существующих проектов
    canResize: false,
    canBg: false,
    canWatermark: false,
  },
  {
    id: "starter",
    name: "Стартер",
    price: "169 ₽",
    maxProjects: 1,
    canResize: false, // изменение размера заблокировано
    canBg: false,
    canWatermark: false,
  },
  {
    id: "monthly",
    name: "Месячная",
    price: "300 ₽",
    period: "в месяц",
    maxProjects: Infinity,
    canResize: true,  // изменение размера доступно
    canBg: false,     // фон холста заблокирован
    canWatermark: false,
  },
  {
    id: "pro",
    name: "Про",
    price: "750 ₽",
    maxProjects: Infinity,
    canResize: true,
    canBg: true,
    canWatermark: true,
  },
];

const KEY = "beadly-plan-v1";

export function getActivePlan(): Plan {
  try {
    const saved = localStorage.getItem(KEY) as PlanId | null;
    return PLANS.find(p => p.id === saved) ?? PLANS.find(p => p.id === "starter")!;
  } catch {
    return PLANS.find(p => p.id === "starter")!;
  }
}

export function setActivePlan(id: PlanId): void {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}
