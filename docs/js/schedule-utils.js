function resolveScheduleId(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const rawId = typeof meta.scheduleId === 'string'
    ? meta.scheduleId
    : typeof meta.scheduleKey === 'string'
      ? meta.scheduleKey
      : typeof meta.schedule === 'string'
        ? meta.schedule
        : null;
  const trimmed = typeof rawId === 'string' ? rawId.trim() : '';
  return trimmed || null;
}

function resolveGlobalConfig() {
  if (typeof window !== 'undefined' && window.CONFIG) return window.CONFIG;
  if (typeof globalThis !== 'undefined' && globalThis.CONFIG) return globalThis.CONFIG;
  return undefined;
}

function resolveScheduleLibrary(config) {
  const resolvedConfig = config || resolveGlobalConfig();
  if (!resolvedConfig || typeof resolvedConfig !== 'object') return {};
  if (resolvedConfig.schedules && typeof resolvedConfig.schedules === 'object') return resolvedConfig.schedules;
  if (resolvedConfig.schedulePresets && typeof resolvedConfig.schedulePresets === 'object') return resolvedConfig.schedulePresets;
  if (resolvedConfig.scheduleTemplates && typeof resolvedConfig.scheduleTemplates === 'object') return resolvedConfig.scheduleTemplates;
  return {};
}

export function resolveScheduleEntry(meta = {}, config) {
  if (!meta || typeof meta !== 'object') return null;
  const scheduleId = resolveScheduleId(meta);
  const library = resolveScheduleLibrary(config);
  const schedule = scheduleId ? library[scheduleId] : null;

  const scheduleHours = Array.isArray(schedule)
    ? schedule
    : Array.isArray(schedule?.hours)
      ? schedule.hours
      : Array.isArray(schedule?.scheduleHours)
        ? schedule.scheduleHours
        : null;

  const resolvedLabel = schedule && typeof schedule === 'object'
    ? (schedule.label ?? schedule.name ?? schedule.title ?? null)
    : null;

  if (Array.isArray(scheduleHours) && scheduleHours.length > 0) {
    return {
      id: scheduleId,
      hours: scheduleHours.slice(),
      label: resolvedLabel,
      hasSchedule: true,
    };
  }

  const fallbackHours = Array.isArray(meta.scheduleHours) ? meta.scheduleHours : null;
  if (fallbackHours && fallbackHours.length > 0) {
    return {
      id: scheduleId,
      hours: fallbackHours.slice(),
      label: meta.scheduleLabel ?? resolvedLabel ?? null,
      hasSchedule: true,
    };
  }

  return scheduleId || resolvedLabel
    ? { id: scheduleId, hours: [], label: resolvedLabel, hasSchedule: true }
    : null;
}

export function resolveScheduleHours(meta = {}, config) {
  const entry = resolveScheduleEntry(meta, config);
  return entry?.hours || [];
}

export function isScheduleActive(meta = {}, hour = null, config) {
  const entry = resolveScheduleEntry(meta, config);
  if (!entry) return true; // No schedule metadata means always active

  const hours = Array.isArray(entry.hours) ? entry.hours : [];
  if (hours.length === 0) return false; // Explicit schedule with no active hours
  if (!Number.isFinite(hour)) return false;
  return hours.includes(hour);
}

export function getCurrentGameHour(area = null, config) {
  const time24h = area?.background?.sky?.time24h;
  if (Number.isFinite(time24h)) {
    return Math.floor(time24h) % 24;
  }
  const resolvedConfig = config || resolveGlobalConfig();
  const fallbackHour = resolvedConfig?.scheduleDefaults?.fallbackHour;
  if (Number.isFinite(fallbackHour)) {
    return Math.floor(fallbackHour) % 24;
  }
  return null;
}
