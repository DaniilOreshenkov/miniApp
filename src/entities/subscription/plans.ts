export type PlanId = "free" | "starter" | "monthly" | "pro";

export type Plan = {
  id: PlanId;
  name: string;
  price: string;
  period?: string;
  maxProjects: number;
  canBg: boolean;       // фон и цвет бусин при создании + фон в редакторе
  canWatermark: boolean; // свой водяной знак
  features: string[];
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Без плана",
    price: "Бесплатно",
    maxProjects: 0,
    canBg: false,
    canWatermark: false,
    features: [
      "Просмотр приложения",
    ],
  },
  {
    id: "starter",
    name: "Стартер",
    price: "169 ₽",
    maxProjects: 1,
    canBg: false,
    canWatermark: false,
    features: [
      "1 проект",
      "Полный редактор бусин",
      "Импорт фото → схема",
      "Экспорт PNG с брендом",
    ],
  },
  {
    id: "monthly",
    name: "Месячная",
    price: "300 ₽",
    period: "в месяц",
    maxProjects: Infinity,
    canBg: false,
    canWatermark: false,
    features: [
      "Безлимит проектов",
      "Полный редактор бусин",
      "Импорт фото → схема",
      "Экспорт PNG с брендом",
    ],
  },
  {
    id: "pro",
    name: "Про",
    price: "750 ₽",
    maxProjects: Infinity,
    canBg: true,
    canWatermark: true,
    features: [
      "Безлимит проектов",
      "Фон и цвет бусин при создании",
      "Фон холста в редакторе",
      "Свой водяной знак / отключить",
    ],
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
