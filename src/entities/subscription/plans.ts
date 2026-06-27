export type PlanId = "free" | "monthly" | "pro";

export const PLAN_RANK: Record<PlanId, number> = {
  free:    0,
  monthly: 1,
  pro:     2,
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

// Подписка удалена — все функции открыты для всех пользователей.
const FULL_PLAN: Plan = {
  id: "pro",
  name: "Студия",
  price: "",
  maxProjects: Infinity,
  canResize: true,
  canBg: true,
  canWatermark: true,
  features: STUDIO_FEATURES,
};

export const PLANS: Plan[] = [FULL_PLAN];

export function getActivePlan(): Plan {
  return FULL_PLAN;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setActivePlan(_id: PlanId): void {
  // no-op: подписка удалена
}
