export type MotionTier = 'full' | 'balanced' | 'minimal' | 'off';

export type MotionProfile = 'reveal' | 'modal' | 'banner' | 'toast' | 'ambient' | 'magnetic';

export type MotionExceptionReason = 'accessibility' | 'system-native';

export interface MotionContext {
  prefersReducedMotion: boolean;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  saveData?: boolean;
  isTouch: boolean;
}
