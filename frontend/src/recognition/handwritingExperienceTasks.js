export const HANDWRITING_EXPERIMENT_TASKS = Object.freeze([
  ["linear-01", "3x + 2 = 5"],
  ["linear-02", "3x = 3"],
  ["linear-03", "x = 1"],
  ["linear-04", "2(x - 3) = 10"],
  ["linear-05", "2x - 6 = 10"],
  ["linear-06", "2x = 16"],
  ["linear-07", "x = 8"],
  ["linear-08", "4 - x = 9"],
  ["linear-09", "-x = 5"],
  ["linear-10", "x = -5"],
  ["linear-11", "0.5x + 1 = 3"],
  ["linear-12", "x/2 + 3 = 7"],
].map(([id, prompt]) => Object.freeze({ id, prompt })));

export const HANDWRITING_EXPERIMENT_TASK_IDS = Object.freeze(
  HANDWRITING_EXPERIMENT_TASKS.map(({ id }) => id)
);
