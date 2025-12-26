(function registerAbilitiesFromJson() {
  if (typeof window?.registerAbility !== 'function') return;

  const basePath = typeof document !== 'undefined'
    ? './config/abilities/'
    : `${typeof process !== 'undefined' ? process.cwd() : ''}/docs/config/abilities/`;

  const readJson = (fileName) => {
    const path = `${basePath}${fileName}`;
    if (typeof XMLHttpRequest !== 'undefined') {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', path, false);
        xhr.overrideMimeType?.('application/json');
        xhr.send(null);
        if (xhr.status >= 200 && xhr.status < 300) {
          return JSON.parse(xhr.responseText || '{}');
        }
      } catch (err) {
        console.warn('Failed to load ability json', fileName, err);
      }
      return {};
    }

    if (typeof require === 'function') {
      try {
        const fs = require('fs');
        return JSON.parse(fs.readFileSync(path, 'utf8'));
      } catch (err) {
        console.warn('Failed to load ability json in Node', fileName, err);
      }
    }
    return {};
  };

  const abilityLibrary = readJson('ability-library.json');
  Object.entries(abilityLibrary || {}).forEach(([id, def]) => {
    const prepared = JSON.parse(JSON.stringify(def));
    if (prepared.onHit && typeof prepared.onHit === 'object' && typeof prepared.onHit.knockback === 'number') {
      const { knockback, clamp } = prepared.onHit;
      prepared.onHit = window.abilityKnockback?.(knockback, { clamp });
    }
    if (typeof prepared.charge?.stageMultipliers === 'string') {
      const stageMultipliers = prepared.charge.stageMultipliers;
      // eslint-disable-next-line no-new-func
      prepared.charge.stageMultipliers = new Function('stage', `return (${stageMultipliers})(stage);`);
    }
    window.registerAbility(id, prepared);
  });
})();
