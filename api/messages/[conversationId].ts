import { store } from '../_store';

export default function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { conversationId } = req.query || {};
  const messages = store().messages.filter(message => message.conversationId === conversationId);

  return res.status(200).json(messages);
}
