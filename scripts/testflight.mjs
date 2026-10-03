#!/usr/bin/env node
// Uploads the iOS app to TestFlight and fills in each build's "What to Test"
// notes from ios/TESTFLIGHT.md, using the Sous Chef team's App Store Connect
// API key.
//
//   pnpm ios:testflight upload   archive, upload, wait for processing, set notes
//   pnpm ios:testflight notes    set notes for the project's current build (or: notes 5)
//   pnpm ios:testflight status   list recent builds
//
// The key stays outside the repository. Put the .p8 file in
// ~/.appstoreconnect/private_keys/ and its IDs in ~/.appstoreconnect/sous-chef.json:
//   {"keyId": "…", "issuerId": "…"}
// or set SOUS_CHEF_ASC_KEY_ID and SOUS_CHEF_ASC_ISSUER_ID.

import { execFileSync, spawnSync } from 'node:child_process';
import { createPrivateKey, sign } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ios = join(root, 'ios');
const bundleId = 'com.georgevina.souschef';

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function credentials() {
  const configPath = join(homedir(), '.appstoreconnect', 'sous-chef.json');
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
  const keyId = process.env.SOUS_CHEF_ASC_KEY_ID ?? config.keyId;
  const issuerId = process.env.SOUS_CHEF_ASC_ISSUER_ID ?? config.issuerId;
  if (!keyId || !issuerId) fail(`No App Store Connect key configured. Create ${configPath} with {"keyId": "…", "issuerId": "…"}.`);
  const keyPath = join(homedir(), '.appstoreconnect', 'private_keys', `AuthKey_${keyId}.p8`);
  if (!existsSync(keyPath)) fail(`Missing ${keyPath}.`);
  return { keyId, issuerId, keyPath };
}

const { keyId, issuerId, keyPath } = credentials();

function token() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({ iss: issuerId, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })}`;
  const signature = sign('sha256', Buffer.from(body), { key: createPrivateKey(readFileSync(keyPath)), dsaEncoding: 'ieee-p1363' });
  return `${body}.${signature.toString('base64url')}`;
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const json = response.status === 204 ? {} : await response.json();
  if (!response.ok) fail(`${method} ${path} → ${response.status}: ${json.errors?.map((e) => e.detail ?? e.title).join('; ')}`);
  return json;
}

/** The SousChef target's version and build number, from the project file. */
function projectVersion() {
  const project = readFileSync(join(ios, 'SousChef.xcodeproj', 'project.pbxproj'), 'utf8');
  const block = project.split('isa = XCBuildConfiguration;').find((section) => section.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};`));
  const version = block?.match(/MARKETING_VERSION = ([^;]+);/)?.[1];
  const build = block?.match(/CURRENT_PROJECT_VERSION = ([^;]+);/)?.[1];
  if (!version || !build) fail('Could not read the version and build number from the project file.');
  return { version, build };
}

/** The "What to Test" text for a build, as plain text for TestFlight. */
function testNotes(version, build) {
  const notes = readFileSync(join(ios, 'TESTFLIGHT.md'), 'utf8');
  const heading = `## ${version} (${build})`;
  const start = notes.indexOf(`${heading}\n`);
  if (start < 0) fail(`ios/TESTFLIGHT.md has no "${heading}" entry. Add the testing notes first.`);
  const entry = notes.slice(start + heading.length).split(/\n## /)[0];
  const whatToTest = entry.split('### What to Test')[1];
  if (!whatToTest?.trim()) fail(`The "${heading}" entry has no "### What to Test" section.`);
  const text = whatToTest
    .trim()
    // Rejoin wrapped lines; keep list items, numbered steps and blank lines.
    .replace(/(?<!\n)\n(?!\n|- |\d+\. )[ \t]*/g, ' ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  if (text.length > 4000) fail(`The "What to Test" text is ${text.length} characters; TestFlight allows 4,000.`);
  return text;
}

async function app() {
  const { data } = await api(`/v1/apps?filter[bundleId]=${bundleId}`);
  if (!data?.[0]) fail(`This key can't see ${bundleId}.`);
  return data[0].id;
}

async function findBuild(appId, version, build) {
  const { data } = await api(`/v1/builds?filter[app]=${appId}&filter[version]=${encodeURIComponent(build)}&filter[preReleaseVersion.version]=${encodeURIComponent(version)}&limit=1`);
  return data?.[0];
}

async function setNotes(version, build) {
  const whatsNew = testNotes(version, build);
  const found = await findBuild(await app(), version, build);
  if (!found) fail(`${version} (${build}) isn't in App Store Connect yet.`);
  const { data: localizations } = await api(`/v1/builds/${found.id}/betaBuildLocalizations`);
  const english = localizations.find((l) => l.attributes.locale === 'en-US') ?? localizations[0];
  if (english) {
    await api(`/v1/betaBuildLocalizations/${english.id}`, { method: 'PATCH', body: { data: { type: 'betaBuildLocalizations', id: english.id, attributes: { whatsNew } } } });
  } else {
    await api('/v1/betaBuildLocalizations', {
      method: 'POST',
      body: { data: { type: 'betaBuildLocalizations', attributes: { locale: 'en-US', whatsNew }, relationships: { build: { data: { type: 'builds', id: found.id } } } } },
    });
  }
  console.log(`✔ What to Test set for ${version} (${build}).`);
}

async function status() {
  const { data, included = [] } = await api(`/v1/builds?filter[app]=${await app()}&sort=-uploadedDate&limit=10&include=preReleaseVersion`);
  const versions = Object.fromEntries(included.map((v) => [v.id, v.attributes.version]));
  for (const build of data) {
    const version = versions[build.relationships.preReleaseVersion.data?.id] ?? '?';
    console.log(`${version} (${build.attributes.version})  ${build.attributes.processingState}  uploaded ${build.attributes.uploadedDate}`);
  }
}

function xcodebuild(args) {
  const auth = ['-allowProvisioningUpdates', '-authenticationKeyPath', keyPath, '-authenticationKeyID', keyId, '-authenticationKeyIssuerID', issuerId];
  const result = spawnSync('xcodebuild', [...args, ...auth], { cwd: ios, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status !== 0) {
    console.error(output.split('\n').filter((line) => /error|ITMS|FAILED/i.test(line)).slice(-30).join('\n'));
    fail(`xcodebuild ${args[0] === '-exportArchive' ? 'upload' : 'archive'} failed.`);
  }
  return output;
}

async function upload() {
  const { version, build } = projectVersion();
  testNotes(version, build);
  const appId = await app();
  if (await findBuild(appId, version, build)) fail(`${version} (${build}) is already uploaded. Increment CURRENT_PROJECT_VERSION first.`);
  if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) {
    console.warn('! The working tree has uncommitted changes; commit the build with its upload.');
  }

  const work = mkdtempSync(join(tmpdir(), 'souschef-testflight-'));
  const archive = join(work, 'SousChef.xcarchive');
  console.log(`Archiving ${version} (${build})…`);
  xcodebuild(['-scheme', 'SousChef', '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-archivePath', archive, 'archive']);
  console.log('Uploading…');
  xcodebuild(['-exportArchive', '-archivePath', archive, '-exportOptionsPlist', join(ios, 'ExportOptions.plist'), '-exportPath', join(work, 'export')]);

  console.log('Waiting for App Store Connect to process the build…');
  const deadline = Date.now() + 45 * 60 * 1000;
  for (;;) {
    const found = await findBuild(appId, version, build);
    const state = found?.attributes.processingState;
    if (state === 'VALID') break;
    if (state === 'FAILED' || state === 'INVALID') fail(`App Store Connect marked ${version} (${build}) ${state}. Check the email Apple sent.`);
    if (Date.now() > deadline) fail('Still processing after 45 minutes. Run "pnpm ios:testflight notes" once it finishes.');
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
  await setNotes(version, build);
}

const [command, argument] = process.argv.slice(2);
switch (command) {
  case 'upload':
    await upload();
    break;
  case 'notes': {
    const current = projectVersion();
    await setNotes(current.version, argument ?? current.build);
    break;
  }
  case 'status':
    await status();
    break;
  default:
    console.log('Usage: pnpm ios:testflight <upload | notes [build] | status>');
    process.exit(command ? 1 : 0);
}
