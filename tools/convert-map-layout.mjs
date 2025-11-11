#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { convertLayoutToArea } from '../src/map/builderConversion.js';
import { createDirectoryPrefabResolver } from '../src/map/prefabResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input || !args.output) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = path.resolve(process.cwd(), args.input);
  const outputDir = path.resolve(process.cwd(), args.output);
  await mkdir(outputDir, { recursive: true });

  const raw = await readFile(inputPath, 'utf8');
  const layout = JSON.parse(raw);

  const prefabIds = collectPrefabIds(layout);
  let prefabResolverInfo = null;
  if (args.autoPrefabs !== false && prefabIds.size) {
    prefabResolverInfo = await createDirectoryPrefabResolver(prefabIds, {
      root: args.prefabDir || 'prefabs/structures',
    });
  }

  const area = convertLayoutToArea(layout, {
    areaId: args.areaId,
    areaName: args.areaName,
    includeRaw: args.includeRaw,
    prefabResolver: prefabResolverInfo?.resolver,
  });

  if (prefabResolverInfo?.warnings?.length) {
    area.warnings = [...(area.warnings ?? []), ...prefabResolverInfo.warnings];
  }

  const baseName = args.filename || `${area.id}.area`;
  const filePath = path.join(outputDir, `${baseName}.${args.format}`);

  if (args.format === 'json') {
    await writeFile(filePath, JSON.stringify(area, null, 2));
  } else if (args.format === 'mjs') {
    const moduleSource = `export const areas = {\n  ${JSON.stringify(area.id)}: ${JSON.stringify(area, null, 2)}\n};\nexport default areas;\n`;
    await writeFile(filePath, moduleSource);
  } else {
    throw new Error(`Unsupported format: ${args.format}`);
  }

  if (area.warnings?.length) {
    console.warn('[convert-map-layout] warnings:\n - ' + area.warnings.join('\n - '));
  }

  if (!args.quiet) {
    console.log(`Converted ${path.relative(process.cwd(), inputPath)} -> ${path.relative(process.cwd(), filePath)}`);
  }
}

function parseArgs(argv) {
  const options = {
    format: 'json',
    includeRaw: false,
    quiet: false,
    help: false,
    autoPrefabs: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--input':
      case '-i':
        options.input = argv[++i];
        break;
      case '--output':
      case '-o':
        options.output = argv[++i];
        break;
      case '--area-id':
        options.areaId = argv[++i];
        break;
      case '--area-name':
        options.areaName = argv[++i];
        break;
      case '--filename':
        options.filename = argv[++i];
        break;
      case '--format':
        options.format = argv[++i];
        break;
      case '--prefab-dir':
        options.prefabDir = argv[++i];
        break;
      case '--auto-prefabs':
        options.autoPrefabs = true;
        break;
      case '--no-auto-prefabs':
        options.autoPrefabs = false;
        break;
      case '--include-raw':
        options.includeRaw = true;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (token.startsWith('--no-')) {
          const key = token.slice(5);
          options[key] = false;
          i -= 1;
        } else if (token.startsWith('--')) {
          const key = token.slice(2);
          options[key] = argv[++i];
        }
        break;
    }
  }
  return options;
}

function printHelp() {
  const rel = path.relative(process.cwd(), path.join(__dirname, 'convert-map-layout.mjs'));
  console.log(`Usage: node ${rel} --input layout.json --output dist [options]\n\nOptions:\n  --area-id <id>       Override the generated area identifier\n  --area-name <name>   Override the generated area display name\n  --filename <name>    Output filename without extension (defaults to <areaId>.area)\n  --format <json|mjs>  Output format (default: json)\n  --prefab-dir <dir>   Directory containing builder prefabs (default: prefabs/structures)\n  --no-auto-prefabs    Skip automatic prefab resolution\n  --include-raw        Embed raw layout data for debugging\n  --quiet              Silence success output\n  --help               Show this message\n`);
}

function collectPrefabIds(layout) {
  if (!layout || !Array.isArray(layout.instances)) return new Set();
  const ids = new Set();
  for (const inst of layout.instances) {
    if (inst && typeof inst.prefabId === 'string' && inst.prefabId.trim()) {
      ids.add(inst.prefabId.trim());
    }
  }
  return ids;
}

main().catch((error) => {
  console.error('[convert-map-layout] failed:', error);
  process.exitCode = 1;
});
