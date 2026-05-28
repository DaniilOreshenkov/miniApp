/**
 * Subscription plan definitions.
 *
 * Payment is not yet integrated — paid plans are flagged `available: false`
 * and shown with a "Скоро" badge in the UI. When payment is added, flip the flag.
 */

export type PlanId = "free" | "basic" | "monthly" | "premium";

export type SubscriptionPlan = {
  id: PlanId;
  name: string;
  /** Price string shown in UI, e.g. "169 ₽" or "Бесплатно" */
  price: string;
  /** Period label shown below price, e.g. "в месяц" */
  period?: string;
  /** Short description shown on the plan card */
  description: string;
  /** Feature bullet points */
  features: string[];
  /** Whether payment is currently available. false → shows "Скоро" badge */
  available: boolean;
  /** Whether export watermark is removed for this plan */
  noWatermark: boolean;
  /** Whether screenshot capture is allowed for this plan */
  screenshotsAllowed: boolean;
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "free",
    name: "Бесплатно",
    price: "Бесплатно",
    description: "Базовый доступ к редактору",
    features: [
      "Создание и редактирование схем",
      "Скачивание с водяным знаком",
      "Одноразовая ссылка для просмотра",
    ],
    available: true,
    noWatermark: false,
    screenshotsAllowed: false,
  },
  {
    id: "basic",
    name: "Базовый",
    price: "169 ₽",
    description: "Скачивание без водяного знака",
    features: [
      "Скачивание без водяного знака",
      "Скриншоты разрешены",
    ],
    available: false,
    noWatermark: true,
    screenshotsAllowed: true,
  },
  {
    id: "monthly",
    name: "Подписка",
    price: "300 ₽",
    period: "в месяц",
    description: "Полный доступ к редактору",
    features: [
      "Скачивание без водяного знака",
      "Скриншоты разрешены",
      "Ссылка для просмотра схемы",
    ],
    available: false,
    noWatermark: true,
    screenshotsAllowed: true,
  },
  {
    id: "premium",
    name: "Персональный",
    price: "750 ₽",
    description: "Персонализация под вас",
    features: [
      "Скачивание без водяного знака",
      "Свой водяной знак на экспорте",
      "Смена фона приложения",
      "Скриншоты разрешены",
    ],
    available: false,
    noWatermark: true,
    screenshotsAllowed: true,
  },
];

export const getPlanById = (id: PlanId): SubscriptionPlan => {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === id) ?? SUBSCRIPTION_PLANS[0];
};
