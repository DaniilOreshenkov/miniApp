import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PLANS } from './lib/yukassa.js'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=3600') // кэш CDN на 1 час
  return res.status(200).json({ plans: Object.values(PLANS) })
}
