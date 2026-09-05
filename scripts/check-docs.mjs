import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const files = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(full);
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
  }
}
for (const entry of fs.readdirSync(root)) {
  if (entry.endsWith('.md') && fs.statSync(path.join(root, entry)).isFile()) {
    files.push(path.join(root, entry));
  }
}
for (const dir of ['docs', '.agents/skills']) scan(path.join(root, dir));
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), target))) {
      errors.push(`${path.relative(root, file)}: missing link ${target}`);
    }
  }
}
const skills = JSON.parse(fs.readFileSync(path.join(root, 'skills-lock.json'), 'utf8')).skills;
for (const name of Object.keys(skills)) {
  const canonical = path.join(root, '.agents/skills', name);
  const skillFile = path.join(canonical, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    errors.push(`${name}: missing SKILL.md`);
    continue;
  }
  const content = fs.readFileSync(skillFile, 'utf8');
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter || !frontmatter[1].includes(`name: ${name}\n`)) {
    errors.push(`${name}: missing or mismatched skill name`);
  }
  const link = path.join(root, '.claude/skills', name);
  try {
    if (!fs.lstatSync(link).isSymbolicLink() || fs.realpathSync(link) !== fs.realpathSync(canonical)) {
      errors.push(`${name}: Claude entry must link to its canonical skill`);
    }
  } catch {
    errors.push(`${name}: missing or broken Claude skill link`);
  }
}
for (const entry of fs.readdirSync(path.join(root, '.agents/skills'), { withFileTypes: true })) {
  if (entry.isDirectory() && !Object.hasOwn(skills, entry.name)) {
    errors.push(`${entry.name}: installed skill missing from skills-lock.json`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} Markdown files and ${Object.keys(skills).length} installed skills with Claude links.`);
}
