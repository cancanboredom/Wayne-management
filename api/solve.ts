import { json } from './_helpers';
import { readState } from './_state';
import { enqueueSolverJob } from '../server/solver/jobs';
import { normalizeSolvePayload, runSolve } from '../server/core/solveEngine';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: { message: 'Method not allowed' } });

  try {
    const { workspaceId, state } = await readState(req);
    const payload = normalizeSolvePayload(req.body);

    if (!Number.isInteger(payload.year) || !Number.isInteger(payload.month)) {
      return json(res, 400, { ok: false, error: { message: 'year and month are required' } });
    }

    const ffAsync = String(process.env.FF_SOLVER_ASYNC || process.env.VITE_FF_SOLVER_ASYNC || '').toLowerCase() === 'true';
    if (ffAsync) {
      const job = await enqueueSolverJob(workspaceId, req.body || {});
      return json(res, 202, {
        ok: true,
        data: {
          async: true,
          jobId: job.id,
          status: job.status,
          message: 'Solver job queued',
        },
      });
    }

    const rawPeople = Array.isArray(state.people) ? state.people : [];
    if (rawPeople.length === 0) {
      return json(res, 400, { ok: false, error: { message: 'No personnel found. Please add team members first.' } });
    }

    const result = runSolve(payload, state);
    return json(res, 200, { ok: true, data: result });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: { message: `Solver failed: ${error?.message || error}` } });
  }
}
