export type StepType = "warmup" | "interval" | "recovery" | "cooldown" | "easy" | "rest";

/** Mirrors garmin-connect's IGarminTokens shape (not exported from the package's public entry point). */
export interface GarminSessionTokens {
  oauth1: { oauth_token: string; oauth_token_secret: string };
  oauth2: {
    scope: string;
    jti: string;
    access_token: string;
    token_type: string;
    refresh_token: string;
    expires_in: number;
    refresh_token_expires_in: number;
    expires_at: number;
    refresh_token_expires_at: number;
    last_update_date: string;
    expires_date: string;
  };
}

export interface WorkoutStep {
  type: StepType;
  /** meters, omit for time-based steps */
  distanceMeters?: number;
  /** seconds, omit for distance-based steps */
  durationSeconds?: number;
  /** e.g. "5:30/km" or free text target description */
  targetPace?: string;
  /** e.g. "150-160" or "<145" bpm */
  targetHeartRate?: string;
  repeat?: number;
  notes?: string;
}

export interface PlannedWorkout {
  /** ISO date YYYY-MM-DD */
  date: string;
  title: string;
  steps: WorkoutStep[];
}

export interface TrainingPlan {
  name: string;
  workouts: PlannedWorkout[];
}
