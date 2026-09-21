export const REPOSITORY = 'gamerg21/sous-chef';
export const IMAGE = `ghcr.io/${REPOSITORY}`;
export const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;

export function parseVersion(value) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
export function isNewer(candidate, installed) {
  const next = parseVersion(candidate), current = parseVersion(installed);
  if (!next || !current) return false;
  for (let i = 0; i < 3; i++) {
    if (next[i] !== current[i]) return next[i] > current[i];
  }
  return false;
}
export async function fetchRelease(version, fetcher = fetch) {
  if (version && !parseVersion(version)) throw new Error('Invalid release version');
  const endpoint = version ? `tags/v${version.replace(/^v/, '')}` : 'latest';
  const response = await fetcher(`https://api.github.com/repos/${REPOSITORY}/releases/${endpoint}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Sous-Chef-Updater' },
    signal: AbortSignal.timeout(15000), cache: 'no-store',
  });
  if (response.status === 404 && !version) return null;
  if (!response.ok) throw new Error('Release service is unavailable. Try again later.');
  const release = await response.json();
  if (release.draft || release.prerelease || !parseVersion(release.tag_name) ||
      (version && release.tag_name !== `v${version.replace(/^v/, '')}`)) throw new Error('Invalid stable release');
  return {
    version: release.tag_name.replace(/^v/, ''),
    url: `${RELEASES_URL}/tag/${release.tag_name}`,
    notes: typeof release.body === 'string' ? release.body.slice(0, 12000) : '',
    assets: Array.isArray(release.assets) ? release.assets : [],
  };
}
export function portableAsset(release, platform, arch) {
  const name = `sous-chef-${platform}-${arch}.tar.gz`;
  const asset = release.assets.find(item => item.name === name);
  const expected = `${RELEASES_URL}/download/v${release.version}/${name}`;
  if (!asset || asset.browser_download_url !== expected || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) {
    throw new Error('A verified portable download is not available for this platform.');
  }
  return { url: expected, sha256: asset.digest.slice(7) };
}
