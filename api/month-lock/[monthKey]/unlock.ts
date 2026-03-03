import baseHandler from '../unlock';

export default function handler(req: any, res: any) {
  req.query = { ...(req.query || {}), monthKey: String(req.query?.monthKey || '') };
  return baseHandler(req, res);
}
