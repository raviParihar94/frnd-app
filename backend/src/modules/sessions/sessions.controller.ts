import { Request, Response } from 'express';
import { listHistoryForUser } from './sessionHistory.repository';

export async function listHistoryHandler(req: Request, res: Response): Promise<void> {
  const history = await listHistoryForUser(req.user!.id);
  res.status(200).json({ history });
}
