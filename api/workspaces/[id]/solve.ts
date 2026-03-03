import solveHandler from '../../solve';

export default function handler(req: any, res: any) {
  req.query = { ...(req.query || {}), workspaceId: String(req.query?.id || 'default') };
  return solveHandler(req, res);
}
