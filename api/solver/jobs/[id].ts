import { getSolverJob } from '../../../server/solver/jobs';
import { json, requireWorkspaceAccess } from '../../_helpers';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });
  const access = requireWorkspaceAccess(req, res);
  if (!access) return;

  const jobId = String(req.query?.id || '');
  const job = await getSolverJob(jobId);
  if (!job || job.workspaceId !== access.workspaceId) {
    return json(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
  }

  return json(res, 200, {
    ok: true,
    data: {
      jobId: job.id,
      status: job.status,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    },
  });
}
