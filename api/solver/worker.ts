import { claimNextQueuedJob, updateSolverJob } from '../../server/solver/jobs';
import { getWorkspaceState } from '../../server/db/workspaceStateStore';
import { normalizeSolvePayload, runSolve } from '../../server/core/solveEngine';
import { json } from '../_helpers';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });

  const requiredSecret = process.env.SOLVER_WORKER_SECRET || '';
  if (requiredSecret) {
    const provided = String(req.headers?.['x-worker-secret'] || '');
    if (provided !== requiredSecret) {
      return json(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid worker secret' } });
    }
  }

  const job = await claimNextQueuedJob();
  if (!job) {
    return json(res, 200, { ok: true, data: { processed: false, message: 'No queued jobs' } });
  }

  try {
    const state = await getWorkspaceState(job.workspaceId);
    const payload = normalizeSolvePayload(job.payload || {});
    const result = runSolve(payload, state);
    await updateSolverJob(job.id, { status: 'succeeded', result });
    return json(res, 200, { ok: true, data: { processed: true, jobId: job.id, status: 'succeeded' } });
  } catch (error: any) {
    await updateSolverJob(job.id, { status: 'failed', error: error?.message || 'Solver worker failed' });
    return json(res, 500, { ok: false, error: { message: error?.message || 'Solver worker failed' } });
  }
}
