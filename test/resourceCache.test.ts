import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ResourceCache } from '../src/parser/resourceCache';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rescache-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'a.py'), 'print(1)');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('ResourceCache (Task 59)', () => {
  it('memoizes discovery per directory', () => {
    const cache = new ResourceCache();
    const first = cache.discover(root);
    // Add a file after the first discovery; without invalidation it stays cached.
    fs.writeFileSync(path.join(root, 'scripts', 'b.py'), 'print(2)');
    const second = cache.discover(root);
    expect(second).toBe(first); // same cached array reference
    expect(second).toHaveLength(1);
  });

  it('invalidateFile drops the enclosing directory so the next discovery rescans', () => {
    const cache = new ResourceCache();
    cache.discover(root);
    fs.writeFileSync(path.join(root, 'scripts', 'b.py'), 'print(2)');
    cache.invalidateFile(path.join(root, 'scripts', 'b.py'));
    expect(cache.discover(root)).toHaveLength(2);
  });

  it('clear empties the cache', () => {
    const cache = new ResourceCache();
    cache.discover(root);
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
