export type StepType = "warmup" | "interval" | "recovery" | "cooldown" | "easy" | "rest";

export interface WorkoutStep {
  type: StepType;
  distanceMeters?: number;
  durationSeconds?: number;
  targetPace?: string;
  targetHeartRate?: string;
  repeat?: number;
  notes?: string;
}

export interface PlannedWorkout {
  date: string;
  title: string;
  steps: WorkoutStep[];
}

export interface TrainingPlan {
  name: string;
  workouts: PlannedWorkout[];
}

export interface SyncResult {
  date: string;
  title: string;
  ok: boolean;
  error?: string;
  workoutId?: string;
}

export interface DeleteResult {
  workoutId: string;
  ok: boolean;
  error?: string;
}
