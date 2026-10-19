// Schreibt www/version.js aus package.json, damit die App ihre Version anzeigt.
// Wird von "npm run sync" und im CI-Build vor "cap sync" aufgerufen.
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const { version } = pkg;
const privacyUrl = (pkg.dosia && pkg.dosia.privacyUrl) || '';
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Ungueltige Version in package.json: "${version}" (erwartet z. B. 1.2.3)`);
  process.exit(1);
}
writeFileSync(new URL('../www/version.js', import.meta.url),
  `// Automatisch erzeugt aus package.json – nicht von Hand aendern.\n`
  + `window.DOSIA_VERSION = ${JSON.stringify(version)};\n`
  + `window.DOSIA_PRIVACY_URL = ${JSON.stringify(privacyUrl)};\n`);
console.log(`www/version.js -> ${version}${privacyUrl ? ' | Datenschutz: ' + privacyUrl : ''}`);
