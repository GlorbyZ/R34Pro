import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, '.output', 'chrome-mv3');
const target = join(root, 'android', 'app', 'src', 'main', 'assets', 'extension');

if (!existsSync(source)) {
  console.error('Missing extension build output. Run `npm run build` first.');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

console.log(`Synced extension assets to ${target}`);
