import { lookup } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { Readable } from 'node:stream';

/**
 * Fetches a public web page for recipe import. Self-hosted kitchens often sit
 * on a home network, so every hop (including redirects) must resolve only to
 * public addresses. The check runs inside the socket's DNS lookup, so a
 * hostname cannot pass validation and then connect somewhere private.
 */
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(network, prefix, 'ipv6');
// IPv4 rules also match IPv4-mapped IPv6 (::ffff:a.b.c.d), so no separate mapped rule is needed.

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  const mapped = family === 6 && /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return !blocked.check(mapped[1], 'ipv4');
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0);
    const safe = addresses.filter(item => isPublicAddress(item.address));
    if (!safe.length || safe.length !== addresses.length) return callback(Object.assign(new Error('That link points to a private network address.'), { code: 'EPRIVATE' }), '', 0);
    if (options.all) return (callback as unknown as (e: null, a: typeof safe) => void)(null, safe);
    callback(null, safe[0].address, safe[0].family);
  });
};

export class PublicFetchError extends Error {}

export function checkPublicUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new PublicFetchError('Enter a full recipe link, starting with https://'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new PublicFetchError('Use an http or https recipe link.');
  if (url.username || url.password) throw new PublicFetchError('Remove the username or password from the link.');
  if (url.port && !['80', '443'].includes(url.port)) throw new PublicFetchError('Recipe links must use the standard web ports.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) ? !isPublicAddress(host) : /(^|\.)(localhost|local|internal|lan|home|arpa)$/i.test(host) || !host.includes('.')) throw new PublicFetchError('That link points to a private network address.');
  return url;
}

type Options = { maxBytes?: number; timeoutMs?: number; maxRedirects?: number };

function once(url: URL, timeoutMs: number): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url, {
      method: 'GET', lookup: publicLookup, timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SousChef/0.8; +https://github.com/gamerg21/sous-chef) recipe import',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en;q=0.9,*;q=0.5',
      },
    }, resolve);
    req.on('timeout', () => req.destroy(new PublicFetchError('The recipe site took too long to respond.')));
    req.on('error', reject);
    req.end();
  });
}

function decode(response: IncomingMessage): Readable {
  const encoding = String(response.headers['content-encoding'] ?? '').toLowerCase();
  if (encoding === 'gzip' || encoding === 'x-gzip') return response.pipe(createGunzip());
  if (encoding === 'deflate') return response.pipe(createInflate());
  if (encoding === 'br') return response.pipe(createBrotliDecompress());
  return response;
}

/** Returns the page HTML and final URL after redirects. */
export async function fetchPublicHtml(input: string, options: Options = {}): Promise<{ html: string; url: string }> {
  const { maxBytes = 5_000_000, timeoutMs = 10_000, maxRedirects = 5 } = options;
  const deadline = Date.now() + timeoutMs;
  let url = checkPublicUrl(input);
  for (let hop = 0; ; hop++) {
    let response: IncomingMessage;
    try { response = await once(url, Math.max(1000, deadline - Date.now())); }
    catch (error) {
      if (error instanceof PublicFetchError) throw error;
      if ((error as { code?: string }).code === 'EPRIVATE') throw new PublicFetchError('That link points to a private network address.');
      if ((error as { code?: string }).code === 'ENOTFOUND') throw new PublicFetchError('That website could not be found. Check the link.');
      throw new PublicFetchError('Could not reach that website.');
    }
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400 && response.headers.location) {
      response.resume();
      if (hop >= maxRedirects) throw new PublicFetchError('That link redirected too many times.');
      url = checkPublicUrl(new URL(response.headers.location, url).href);
      continue;
    }
    if (status === 401 || status === 403) { response.resume(); throw new PublicFetchError('That website blocked the import. Copy the recipe text and paste it instead.'); }
    if (status < 200 || status >= 300) { response.resume(); throw new PublicFetchError(`That website responded with an error (${status}).`); }
    const type = String(response.headers['content-type'] ?? '');
    if (type && !/html|xml/i.test(type)) { response.resume(); throw new PublicFetchError('That link is not a web page.'); }
    const chunks: Buffer[] = [];
    let size = 0;
    const body = decode(response);
    const timer = setTimeout(() => body.destroy(new PublicFetchError('The recipe site took too long to respond.')), Math.max(1000, deadline - Date.now()));
    try {
      for await (const chunk of body) {
        size += (chunk as Buffer).length;
        if (size > maxBytes) { body.destroy(); response.destroy(); throw new PublicFetchError('That page is too large to import.'); }
        chunks.push(chunk as Buffer);
      }
    } catch (error) {
      throw error instanceof PublicFetchError ? error : new PublicFetchError('Could not read that page.');
    } finally { clearTimeout(timer); }
    const charset = /charset=([\w-]+)/i.exec(type)?.[1]?.toLowerCase();
    let html: string;
    try { html = new TextDecoder(charset && charset !== 'utf8' ? charset : 'utf-8').decode(Buffer.concat(chunks)); }
    catch { html = Buffer.concat(chunks).toString('utf8'); }
    return { html, url: url.href };
  }
}
