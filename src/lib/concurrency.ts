interface TaskLimiter {
  tryAcquire: () => boolean;
  release: () => void;
}

export function createTaskLimiter(maxActiveTasks: number): TaskLimiter {
  let activeTasks = 0;
  return {
    tryAcquire(): boolean {
      if (activeTasks >= maxActiveTasks) {
        return false;
      }
      activeTasks += 1;
      return true;
    },
    release(): void {
      if (activeTasks > 0) {
        activeTasks -= 1;
      }
    },
  };
}
