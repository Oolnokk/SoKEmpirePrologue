(function initEntryConfigHelper() {
  const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

  window.getEntrySkipKey = function getEntrySkipKey() {
    try {
      const configuredKey = window.CONFIG?.entry?.skipKey;
      return isNonEmptyString(configuredKey) ? configuredKey.trim() : '';
    } catch (err) {
      console.warn('Unable to read CONFIG.entry.skipKey', err);
      return '';
    }
  };
})();
