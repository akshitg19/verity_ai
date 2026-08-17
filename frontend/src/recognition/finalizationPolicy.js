export const RECOGNITION_INPUT_MODES = Object.freeze({
  IMAGE: "image",
  VECTOR: "vector",
});

export const VECTOR_FINALIZATION_POLICY = Object.freeze({
  inputMode: RECOGNITION_INPUT_MODES.VECTOR,
  quietPeriodMs: 350,
  provisionalAfterStroke: true,
  autoFinalize: true,
});

export const IMAGE_FINALIZATION_POLICY = Object.freeze({
  inputMode: RECOGNITION_INPUT_MODES.IMAGE,
  quietPeriodMs: 750,
  provisionalAfterStroke: false,
  autoFinalize: true,
});

export function finalizationPolicyForRecognizer(recognizer) {
  if (recognizer?.inputMode !== RECOGNITION_INPUT_MODES.VECTOR) {
    return IMAGE_FINALIZATION_POLICY;
  }
  return Object.freeze({
    ...VECTOR_FINALIZATION_POLICY,
    provisionalAfterStroke: recognizer.supportsProvisional !== false,
    autoFinalize: recognizer.autoFinalize !== false,
  });
}

export function cancelRowFinalization(timers, row, clearTimer = clearTimeout) {
  const timer = timers.get(row);
  if (timer === undefined) return false;
  clearTimer(timer);
  timers.delete(row);
  return true;
}

export function cancelAllFinalizations(timers, clearTimer = clearTimeout) {
  for (const timer of timers.values()) clearTimer(timer);
  timers.clear();
}

export function scheduleRowFinalization(
  timers,
  row,
  policy,
  onFinalize,
  { setTimer = setTimeout, clearTimer = clearTimeout } = {}
) {
  cancelRowFinalization(timers, row, clearTimer);
  if (policy?.autoFinalize === false) return null;
  const quietPeriodMs = Number.isFinite(policy?.quietPeriodMs)
    ? Math.max(0, policy.quietPeriodMs)
    : IMAGE_FINALIZATION_POLICY.quietPeriodMs;
  const timer = setTimer(() => {
    if (timers.get(row) !== timer) return;
    timers.delete(row);
    onFinalize(row);
  }, quietPeriodMs);
  timers.set(row, timer);
  return timer;
}
