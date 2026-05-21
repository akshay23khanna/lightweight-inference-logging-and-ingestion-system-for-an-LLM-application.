import { id, runGeminiChat, store } from './_store';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { conversationId, prompt, model } = req.body || {};

  if (!conversationId) {
    return res.status(400).json({ error: 'Missing conversationId' });
  }
  if (!prompt) {
    return res.status(400).json({ error: 'Missing user prompt' });
  }

  const data = store();
  const userMessage = {
    id: id(),
    conversationId,
    role: 'user' as const,
    content: prompt,
    timestamp: new Date().toISOString(),
  };

  const history = data.messages.filter(message => message.conversationId === conversationId);
  data.messages.push(userMessage);

  const reply = await runGeminiChat({
    conversationId,
    model: model || 'gemini-3.5-flash',
    prompt,
    history,
  });

  data.messages.push({
    id: id(),
    conversationId,
    role: 'model' as const,
    content: reply,
    timestamp: new Date().toISOString(),
  });

  return res.status(200).json({ reply });
}
