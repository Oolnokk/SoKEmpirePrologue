import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_EXTENSIONS = ['.json', '.structure.json', '.prefab.json'];

export async function createDirectoryPrefabResolver(prefabIds, options = {}) {
  const ids = Array.from(prefabIds || []).filter(Boolean);
  if (!ids.length) {
    return {
      resolver: () => null,
      warnings: [],
      loaded: new Map(),
    };
  }

  const {
    root = 'prefabs/structures',
    logger = console,
    extensions = DEFAULT_EXTENSIONS,
  } = options;

  const resolvedRoot = path.resolve(root);
  const warnings = [];
  const warn = createLogger(logger);
  try {
    await access(resolvedRoot);
  } catch (error) {
    const message = `Prefab directory not found: ${resolvedRoot}`;
    warn(message);
    warnings.push(message);
    return {
      resolver: () => null,
      warnings,
      loaded: new Map(),
    };
  }

  const cache = new Map();
  for (const prefabId of ids) {
    try {
      const result = await loadPrefab(resolvedRoot, prefabId, extensions);
      if (result) {
        cache.set(prefabId, result.prefab);
        if (result.prefab.structureId && result.prefab.structureId !== prefabId) {
          const mismatch = `Prefab "${prefabId}" resolved from ${result.filePath} has mismatched structureId "${result.prefab.structureId}"`;
          warn(mismatch);
          warnings.push(mismatch);
        }
      } else {
        const missing = `Prefab "${prefabId}" not found under ${resolvedRoot}`;
        warn(missing);
        warnings.push(missing);
      }
    } catch (error) {
      const wrapped = `Failed to load prefab "${prefabId}": ${error.message}`;
      warn(wrapped);
      warnings.push(wrapped);
    }
  }

  return {
    resolver: (prefabId) => cache.get(prefabId) ?? null,
    warnings,
    loaded: cache,
  };
}

async function loadPrefab(root, prefabId, extensions) {
  const normalized = prefabId.replace(/\\/g, '/').replace(/^\.\/?/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length) return null;

  const fileName = parts.pop();
  const baseDir = path.join(root, ...parts);
  const candidates = buildCandidatePaths(baseDir, fileName, extensions);

  for (const candidate of candidates) {
    const data = await readJson(candidate);
    if (data) {
      return { prefab: data, filePath: candidate };
    }
  }
  return null;
}

function createLogger(logger) {
  if (logger && typeof logger.warn === 'function') {
    return (message) => logger.warn(`[prefab-resolver] ${message}`);
  }
  return () => {};
}

function buildCandidatePaths(baseDir, fileName, extensions) {
  const candidates = new Set();
  const direct = path.join(baseDir, fileName);
  candidates.add(direct);

  const hasExtension = path.extname(fileName) !== '';
  if (!hasExtension) {
    for (const ext of extensions) {
      candidates.add(path.join(baseDir, `${fileName}${ext}`));
    }
  }

  return candidates;
}

async function readJson(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      return null;
    }
    throw error;
  }
}

export default createDirectoryPrefabResolver;
