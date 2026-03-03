export interface FeatureFlags {
  supabaseBackend: boolean;
  authGateV1: boolean;
  solverAsync: boolean;
  mobileV2: boolean;
}

function truthy(value: unknown): boolean {
  return String(value || '').toLowerCase() === 'true';
}

export function getFeatureFlags(): FeatureFlags {
  return {
    supabaseBackend: truthy(import.meta.env.VITE_FF_SUPABASE_BACKEND),
    authGateV1: truthy(import.meta.env.VITE_FF_AUTH_GATE_V1),
    solverAsync: truthy(import.meta.env.VITE_FF_SOLVER_ASYNC),
    mobileV2: truthy(import.meta.env.VITE_FF_MOBILE_V2),
  };
}

export const featureFlags = getFeatureFlags();
