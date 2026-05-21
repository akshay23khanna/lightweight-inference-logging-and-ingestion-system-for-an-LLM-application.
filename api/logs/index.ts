import { store } from '../_store';

export default function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { model, status, search, limit = '50' } = req.query || {};
  let logs = [...store().logs];

  if (model && model !== 'all') {
    logs = logs.filter(log => log.model === model);
  }
  if (status && status !== 'all') {
    logs = logs.filter(log => log.status === status);
  }
  if (search) {
    const query = String(search).toLowerCase();
    logs = logs.filter(log =>
      log.conversationId.toLowerCase().includes(query) ||
      log.inputPreview.toLowerCase().includes(query) ||
      log.outputPreview.toLowerCase().includes(query) ||
      Boolean(log.errorMsg?.toLowerCase().includes(query))
    );
  }

  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return res.status(200).json({
    total: logs.length,
    logs: logs.slice(0, parseInt(String(limit), 10)),
  });
}
