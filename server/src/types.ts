export type StepType = "warmup" | "interval" | "recovery" | "cooldown" | "easy" | "rest";

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
