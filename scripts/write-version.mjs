// Schreibt www/version.js aus package.json, damit die App ihre Version anzeigt.
// Wird von "npm run sync" und im CI-Build vor "cap sync" aufgerufen.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const { version } = pkg;
const privacyUrl = (pkg.dosia && pkg.dosia.privacyUrl) || '';
const updateUrl = (pkg.dosia && pkg.dosia.updateUrl) || '';
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Ungueltige Version in package.json: "${version}" (erwartet z. B. 1.2.3)`);
  process.exit(1);
}
writeFileSync(new URL('../www/version.js', import.meta.url),
  `// Automatisch erzeugt aus package.json – nicht von Hand aendern.\n`
  + `window.DOSIA_VERSION = ${JSON.stringify(version)};\n`
  + `window.DOSIA_PRIVACY_URL = ${JSON.stringify(privacyUrl)};\n`
  + `window.DOSIA_UPDATE_URL = ${JSON.stringify(updateUrl)};\n`);
console.log(`www/version.js -> ${version}${privacyUrl ? ' | Datenschutz: ' + privacyUrl : ''}`);

// CHANGELOG für die Homepage (website/neuigkeiten.php) mitliefern – der Ordner website/ ist nicht im Git,
// existiert also nur lokal (im Cloud-Build fehlt er)
if (existsSync(new URL('../website/', import.meta.url))) {
  copyFileSync(new URL('../CHANGELOG.md', import.meta.url), new URL('../website/CHANGELOG.md', import.meta.url));
  console.log('CHANGELOG.md -> website/CHANGELOG.md');
}
// Hinweis, falls die Version im CHANGELOG noch fehlt
if (!readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').includes(`## ${version}`)) {
  console.warn(`Hinweis: Im CHANGELOG.md gibt es noch keinen Abschnitt "## ${version}".`);
}
