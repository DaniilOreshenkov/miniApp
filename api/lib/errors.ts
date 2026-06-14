export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const Errors = {
  MISSING_USER_ID: new AppError('MISSING_USER_ID', 'userId обязателен', 400),
  MISSING_PLAN: new AppError('MISSING_PLAN', 'plan обязателен', 400),
  INVALID_PLAN: new AppError('INVALID_PLAN', 'Недопустимый план подписки', 400),
  PAYMENT_CREATE_FAILED: new AppError('PAYMENT_CREATE_FAILED', 'Ошибка создания платежа', 502),
  WEBHOOK_INVALID_SIGNATURE: new AppError('WEBHOOK_INVALID_SIGNATURE', 'Недействительная подпись вебхука', 401),
  WEBHOOK_INVALID_BODY: new AppError('WEBHOOK_INVALID_BODY', 'Некорректное тело вебхука', 400),
  SUBSCRIPTION_NOT_FOUND: new AppError('SUBSCRIPTION_NOT_FOUND', 'Подписка не найдена', 404),
  REDIS_ERROR: new AppError('REDIS_ERROR', 'Ошибка базы данных', 503),
  METHOD_NOT_ALLOWED: new AppError('METHOD_NOT_ALLOWED', 'Метод не разрешён', 405),
} as const

export function toErrorResponse(err: unknown): { code: string; message: string } {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message }
  }
  if (err instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: err.message }
  }
  return { code: 'INTERNAL_ERROR', message: 'Неизвестная ошибка' }
}
