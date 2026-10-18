// Schreibt www/version.js aus package.json, damit die App ihre Version anzeigt.
// Wird von "npm run sync" und im CI-Build vor "cap sync" aufgerufen.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Ungueltige Version in package.json: "${version}" (erwartet z. B. 1.2.3)`);
  process.exit(1);
}
writeFileSync(new URL('../www/version.js', import.meta.url),
  `// Automatisch erzeugt aus package.json – nicht von Hand aendern.\nwindow.DOSIA_VERSION = '${version}';\n`);
console.log(`www/version.js -> ${version}`);
