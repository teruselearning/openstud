/**
 * Reads SEED_LANGUAGES from services/i18n.ts and updates the language INSERT
 * statements in backend/src/index.ts in-place, avoiding any shell encoding issues.
 */
import { readFileSync, writeFileSync } from 'fs';
import { SEED_LANGUAGES } from './services/i18n';

const backendPath = './backend/src/index.ts';
let src = readFileSync(backendPath, 'utf8');

// Languages handled by seeder inserts (non-English, with their display names)
const targets = [
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'pt', name: 'Português' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
];

for (const { code, name } of targets) {
  const lang = SEED_LANGUAGES.find(l => l.code === code);
  if (!lang) { console.warn(`Language ${code} not found in SEED_LANGUAGES`); continue; }

  const json = JSON.stringify(lang.translations);
  const newLine = `    await db.execute('INSERT INTO languages (code, name, is_default, translations) VALUES (?, ?, 0, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), translations=VALUES(translations)', ${JSON.stringify([code, name, json])});`;

  // Find the existing INSERT line for this language code
  const regex = new RegExp(
    `    await db\\.execute\\('INSERT INTO languages.*?ON DUPLICATE KEY UPDATE.*?',\\s*\\[${JSON.stringify(code)},[^\\]]+\\]\\);`,
    's'
  );
  if (regex.test(src)) {
    src = src.replace(regex, newLine);
    console.log(`✓ Updated ${code} (${name})`);
  } else {
    console.warn(`⚠ Could not find INSERT line for ${code} — appending after en-US INSERT`);
    // Fallback: append after the en-US INSERT
    const enUsLine = `    await db.execute(\`INSERT INTO languages (code, name, is_default, translations) VALUES ('en-US', 'English (US)', 0, ?)\`, [JSON.stringify({})]);`;
    if (src.includes(enUsLine)) {
      src = src.replace(enUsLine, enUsLine + '\n' + newLine);
    }
  }
}

writeFileSync(backendPath, src, 'utf8');
console.log('\n✅ backend/src/index.ts updated successfully.');
