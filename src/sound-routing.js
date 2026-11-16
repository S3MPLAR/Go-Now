const BUILTIN_SOUND_IDS = new Set(['soft', 'pixel', 'bell', 'pulse', 'chime', 'click']);

function normalizeTagKey(tag) {
  const value = String(tag || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return value ? `tag:${value}` : null;
}

function soundExists(id, settings, availableIds) {
  if (typeof id !== 'string' || !id) return false;
  if (availableIds) return availableIds.has(id);
  if (BUILTIN_SOUND_IDS.has(id)) return true;
  return Array.isArray(settings && settings.customSounds)
    && settings.customSounds.some((item) => item && item.id === id);
}

function bindingFor(key, settings, availableIds) {
  const bindings = settings && settings.notificationTagSounds;
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) return null;
  const id = bindings[key];
  return soundExists(id, settings, availableIds) ? id : null;
}

function resolveTaskSound(task, settings, availableIds) {
  const fallback = settings && typeof settings.notificationSound === 'string'
    ? settings.notificationSound
    : 'soft';
  if (task && task.important) {
    const important = bindingFor('important', settings, availableIds);
    if (important) return important;
  }
  const tags = Array.isArray(task && task.tags) ? task.tags : [];
  for (const tag of tags) {
    const key = normalizeTagKey(tag);
    if (!key) continue;
    const bound = bindingFor(key, settings, availableIds);
    if (bound) return bound;
  }
  return soundExists(fallback, settings, availableIds) ? fallback : 'soft';
}

module.exports = { BUILTIN_SOUND_IDS, normalizeTagKey, resolveTaskSound };
