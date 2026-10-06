#!/usr/bin/env node
// Prints the App Store "What's New" for Sous Chef for iOS from
// ios/RELEASE_NOTES.md, the one source for customer-facing iOS notes.
//
//   pnpm ios:release-notes 1.1.0          compact: one line per feature
//   pnpm ios:release-notes 1.1.0,1.1.1    several versions one build covers
//   pnpm ios:release-notes 1.1.0 --full   every detail line, by section
//
// The compact form is what the App Store's "What's New" should be.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const full = args.includes('--full');
const versions = args.find((arg) => !arg.startsWith('--'))?.split(',').map((v) => v.trim()).filter(Boolean);
if (!versions?.length) {
  console.error('Usage: pnpm ios:release-notes <version>[,<version>…] [--full]');
  process.exit(2);
}

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'ios', 'RELEASE_NOTES.md'), 'utf8');

/** Sections of one version, in file order: [{ type, entries: [{ title, detail }] }]. */
function sections(version) {
  const start = source.indexOf(`\n## ${version}\n`);
  if (start < 0) {
    console.error(`ios/RELEASE_NOTES.md has no "## ${version}" entry.`);
    process.exit(1);
  }
  const body = source.slice(start + version.length + 5).split(/\n## /)[0];
  return body.split(/\n### /).slice(1).map((block) => {
    const [type, ...lines] = block.split('\n');
    const entries = lines
      .map((line) => line.match(/^- \*\*(.+?)\*\*:\s*(.+)$/))
      .filter(Boolean)
      .map(([, title, detail]) => ({ title, detail }));
    return { type: type.trim(), entries };
  });
}

const all = versions.flatMap(sections);
const output = ["What's New", ''];
if (full) {
  const types = [...new Set(all.map((section) => section.type))];
  for (const type of types) {
    output.push(type.toUpperCase());
    for (const section of all.filter((s) => s.type === type)) {
      for (const { title, detail } of section.entries) output.push(`• ${title}: ${detail}`);
    }
    output.push('');
  }
} else {
  const titles = [...new Set(all.flatMap((section) => section.entries.map((entry) => entry.title)))];
  for (const title of titles) output.push(`• ${title}`);
}

const note = output.join('\n').trim();
if (note.length > 4000) {
  console.error(`The notes are ${note.length} characters; the App Store allows 4,000.`);
  process.exit(1);
}
console.log(note);
