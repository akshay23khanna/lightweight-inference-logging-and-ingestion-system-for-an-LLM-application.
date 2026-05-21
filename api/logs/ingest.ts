import { parseLog, store, validateLogPayload } from '../_store';

export default function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const errors = validateLogPayload(req.body || {});
  if (errors.length > 0) {
    return res.status(400).json({
      status: 'rejected',
      reason: 'Schema validation failed',
      errors,
    });
  }

  const log = parseLog(req.body);
  store().logs.push(log);

  return res.status(201).json({
    status: 'ingested',
    id: log.id,
    latencyMs: log.latencyMs,
    totalTokens: log.tokenUsage.totalTokens,
  });
}
