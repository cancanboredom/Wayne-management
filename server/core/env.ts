export function env(name: string, fallback = ''): string {
  const value = process.env[name];
  if (typeof value === 'string' && value.length > 0) return value;
  return fallback;
}

export function envBool(name: string, fallback = false): boolean {
  const value = env(name, String(fallback));
  return value.toLowerCase() === 'true';
}
