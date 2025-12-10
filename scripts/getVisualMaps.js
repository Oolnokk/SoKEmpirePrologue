// Helper to list and validate "visual maps" from docs/config/maps/visualsmaps
// Node.js (ESM) - adjust allowedExt or validation rules for your "correct format"
import fs from 'fs/promises';
import path from 'path';

const DEFAULT_MAPS_DIR = path.join(process.cwd(), 'docs', 'config', 'maps', 'visualsmaps');
// Allowed extensions (tweak to match your project's accepted map file types)
const allowedExt = new Set(['.gltf', '.glb', '.json']);

/**
 * Quickly checks whether a .glb file has the "glTF" magic in the header.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function isValidGlb(filePath) {
  const fh = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(4);
    await fh.read(buffer, 0, 4, 0);
    const magic = buffer.toString('utf8', 0, 4);
    return magic === 'glTF';
  } finally {
    await fh.close();
  }
}

/**
 * Quickly validates a .gltf/.json by trying to parse and checking minimal fields.
 * You can extend this to check a schema or fields you require.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function isValidGltfJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    // basic sanity check: top-level asset.version should exist in valid glTF
    return !!(data && data.asset && typeof data.asset.version === 'string');
  } catch (err) {
    return false;
  }
}

/**
 * List importable visual maps from the configured directory.
 * Returns objects with name, fullPath, ext, and valid boolean.
 *
 * @param {string} [mapsDir=DEFAULT_MAPS_DIR]
 * @returns {Promise<Array<{name:string, fullPath:string, ext:string, valid:boolean}>>}
 */
export async function listVisualMaps(mapsDir = DEFAULT_MAPS_DIR) {
  let entries;
  try {
    entries = await fs.readdir(mapsDir, { withFileTypes: true });
  } catch (err) {
    // Directory not found or unreadable
    throw new Error(`Unable to read maps directory "${mapsDir}": ${err.message}`);
  }

  const candidates = entries
    .filter(e => e.isFile())
    .map(e => {
      const ext = path.extname(e.name).toLowerCase();
      return { name: e.name, ext, fullPath: path.join(mapsDir, e.name) };
    })
    .filter(e => allowedExt.has(e.ext));

  // Validate candidates (GLB header or GLTF JSON sanity check)
  const results = await Promise.all(
    candidates.map(async c => {
      let valid = false;
      try {
        if (c.ext === '.glb') {
          valid = await isValidGlb(c.fullPath);
        } else {
          // .gltf or .json
          valid = await isValidGltfJson(c.fullPath);
        }
      } catch (err) {
        valid = false;
      }
      return { ...c, valid };
    })
  );

  // If you only want the valid ones, filter here:
  // return results.filter(r => r.valid);
  return results;
}

/**
 * Example usage for local testing (uncomment to run as a script):
 * 
 * node scripts/getVisualMaps.js
 *
(async () => {
  try {
    const maps = await listVisualMaps();
    console.log('Found visual maps:', maps);
  } catch (err) {
    console.error(err);
  }
})();
*/
