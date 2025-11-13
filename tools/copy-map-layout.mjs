import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = resolve(__dirname, '..');
const source = resolve(projectRoot, 'src/config/maps/examplestreet.layout.json');
const destinationDir = resolve(projectRoot, 'docs/config/maps');
const destination = resolve(destinationDir, 'examplestreet.layout.json');

await mkdir(destinationDir, { recursive: true });
await copyFile(source, destination);

console.log(`Copied ${source} -> ${destination}`);
