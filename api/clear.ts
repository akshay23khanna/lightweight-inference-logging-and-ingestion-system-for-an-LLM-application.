import { store } from './_store';

export default function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const data = store();
  data.messages = [];
  data.logs = [];

  return res.status(200).json({ message: 'Database reset succeeded' });
}
