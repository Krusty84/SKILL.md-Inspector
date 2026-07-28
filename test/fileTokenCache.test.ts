import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileTokenCache } from '../src/analysis/fileTokenCache';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-file-token-cache-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(relativePath: string, content: string | Buffer): string {
  const absolutePath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
  return absolutePath;
}

/**
 * Counts words, and counts invocations — the observable for cache hits.
 * Mirrors the countResourceTokens contract: undefined for binary/unreadable.
 */
function countingCache() {
  const compute = vi.fn((absolutePath: string): number | undefined => {
    let content: Buffer;
    try {
      content = fs.readFileSync(absolutePath);
    } catch {
      return undefined;
    }
    if (content.includes(0)) return undefined;
    return content.toString('utf8').split(/\s+/).filter(Boolean).length;
  });
  return { cache: new FileTokenCache(compute), compute };
}

describe('FileTokenCache', () => {
  it('computes once for an unchanged file', () => {
    const { cache, compute } = countingCache();
    const file = write('references/a.md', 'alpha beta');
    expect(cache.tokensFor(file)).toBe(2);
    expect(cache.tokensFor(file)).toBe(2);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('recomputes when the file content changes', () => {
    const { cache, compute } = countingCache();
    const file = write('references/a.md', 'alpha beta');
    expect(cache.tokensFor(file)).toBe(2);
    write('references/a.md', 'alpha beta gamma delta');
    expect(cache.tokensFor(file)).toBe(4);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('caches undefined for binary files without re-reading them', () => {
    const { cache, compute } = countingCache();
    const file = write('references/blob.md', Buffer.from([0x61, 0x00, 0x62]));
    expect(cache.tokensFor(file)).toBeUndefined();
    expect(cache.tokensFor(file)).toBeUndefined();
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('reports a deleted file as unreadable and drops its entry', () => {
    const { cache, compute } = countingCache();
    const file = write('references/a.md', 'alpha');
    expect(cache.tokensFor(file)).toBe(1);
    fs.rmSync(file);
    expect(cache.tokensFor(file)).toBeUndefined();
    expect(cache.size).toBe(0);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('invalidateUnder drops the file itself and everything under a directory', () => {
    const { cache, compute } = countingCache();
    const inside = write('references/a.md', 'alpha');
    const sibling = write('other/b.md', 'beta gamma');
    cache.tokensFor(inside);
    cache.tokensFor(sibling);

    cache.invalidateUnder(path.join(dir, 'references'));
    cache.tokensFor(inside);
    cache.tokensFor(sibling);
    expect(compute).toHaveBeenCalledTimes(3);

    cache.invalidateUnder(sibling);
    cache.tokensFor(sibling);
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('clear drops every entry', () => {
    const { cache, compute } = countingCache();
    const file = write('references/a.md', 'alpha');
    cache.tokensFor(file);
    cache.clear();
    cache.tokensFor(file);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('defaults to the shared read-and-encode used by measureSkillTokenUsage', () => {
    const cache = new FileTokenCache();
    const file = write('references/a.md', 'hello world');
    expect(cache.tokensFor(file)).toBe(2);
    expect(cache.tokensFor(path.join(dir, 'references', 'missing.md'))).toBeUndefined();
  });
});
