// Удалено — диагностический endpoint был временным
import type { VercelRequest, VercelResponse } from "@vercel/node";
export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(404).end();
}
