(function initEntryConfigHelper() {
  const DEFAULT_ENTRY_SKIP_KEY = 'sok-entry-mode';
  const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

  window.getEntrySkipKey = function getEntrySkipKey() {
    try {
      const configuredKey = window.CONFIG?.entry?.skipKey;
      return isNonEmptyString(configuredKey) ? configuredKey.trim() : DEFAULT_ENTRY_SKIP_KEY;
    } catch (err) {
      console.warn('Falling back to default entry skip key due to error reading CONFIG.entry.skipKey', err);
      return DEFAULT_ENTRY_SKIP_KEY;
    }
  };
})();
