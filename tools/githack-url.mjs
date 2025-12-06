import { execSync } from 'node:child_process';

function getRemoteSlug() {
  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    const sshMatch = remote.match(/^git@github\.com:(.+?)(\.git)?$/);
    if (sshMatch) {
      return sshMatch[1].replace(/\.git$/, '');
    }
    const httpsMatch = remote.match(/^https:\/\/github\.com\/(.+?)(\.git)?$/);
    if (httpsMatch) {
      return httpsMatch[1].replace(/\.git$/, '');
    }
    return null;
  } catch {
    return null;
  }
}

function getRef() {
  const refArg = process.argv.find((arg) => arg.startsWith('--ref='));
  if (refArg) {
    return refArg.slice('--ref='.length);
  }
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    if (branch && branch !== 'HEAD') {
      return branch;
    }
  } catch {
    // fall through to commit lookup
  }
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function buildGithackUrls(slug, ref) {
  const base = `https://raw.githack.com/${slug}/${ref}/docs`;
  return {
    index: `${base}/index.html`,
    animationEditor: `${base}/animation-editor.html`,
    cosmeticEditor: `${base}/cosmetic-editor.html`,
    mapEditor: `${base}/map-editor.html`,
  };
}

const slug = getRemoteSlug();
const ref = getRef();

if (!slug || !ref) {
  const problems = [];
  if (!slug) {
    problems.push('set an `origin` remote that points to github.com');
  }
  if (!ref) {
    problems.push('ensure git can resolve your branch or commit');
  }
  const suffix = problems.length ? ` (${problems.join('; ')})` : '';
  console.error(`Unable to produce githack URLs${suffix}.`);
  process.exit(1);
}

const urls = buildGithackUrls(slug, ref);
console.log('Use these raw.githack.com URLs to preview docs on the current ref:\n');
console.log(`- Index:            ${urls.index}`);
console.log(`- Animation editor: ${urls.animationEditor}`);
console.log(`- Cosmetic editor:  ${urls.cosmeticEditor}`);
console.log(`- Map editor:       ${urls.mapEditor}`);
console.log('\nOverride the ref with --ref=<branch-or-commit> when needed.');
