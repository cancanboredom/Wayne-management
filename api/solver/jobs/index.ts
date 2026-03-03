import { enqueueSolverJob } from '../../../server/solver/jobs';
import { json, requireWorkspaceAccess } from '../../_helpers';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  const access = requireWorkspaceAccess(req, res);
  if (!access) return;

  const payload = (req.body && typeof req.body === 'object') ? req.body : {};
  const job = await enqueueSolverJob(access.workspaceId, payload);

  return json(res, 202, {
    ok: true,
    data: { jobId: job.id, status: job.status },
    meta: { queuedAt: job.createdAt },
  });
}
