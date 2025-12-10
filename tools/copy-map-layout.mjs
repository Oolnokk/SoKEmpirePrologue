import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = resolve(__dirname, '..');

// Note: The 3D gameplay maps are now maintained directly in docs/config/maps/gameplaymaps/
// This script is retained for compatibility but no longer copies the legacy 2D layout.
// The default map is now: docs/config/maps/gameplaymaps/defaultdistrict3d_gameplaymap.json

console.log('[copy-map-layout] No copy operation performed.');
console.log('[copy-map-layout] Default 3D gameplay map is maintained in: docs/config/maps/gameplaymaps/defaultdistrict3d_gameplaymap.json');
