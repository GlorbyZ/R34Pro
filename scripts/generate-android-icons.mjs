import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logo = join(root, '.output', 'chrome-mv3', 'logo.webp');

if (!existsSync(logo)) {
  console.error('Missing logo.webp. Run `npm run build` first.');
  process.exit(1);
}

const sizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

for (const [density, size] of Object.entries(sizes)) {
  const dir = join(root, 'android', 'app', 'src', 'main', 'res', `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  const launcher = join(dir, 'ic_launcher.png');
  const round = join(dir, 'ic_launcher_round.png');
  execSync(
    `ffmpeg -y -loglevel error -i "${logo}" -vf "scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:black" "${launcher}"`
  );
  cpSync(launcher, round);
}

console.log('Generated Android launcher icons from logo.webp');
