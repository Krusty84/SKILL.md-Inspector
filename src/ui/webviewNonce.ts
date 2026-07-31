import { randomBytes } from 'node:crypto';

/**
 * A CSP nonce for a webview's `script-src`.
 *
 * The three webview hosts each carried their own `Math.random()` loop. Not
 * exploitable today — there is no HTML injection point and no `innerHTML`
 * anywhere in the repo — but a predictable value is the wrong default for the
 * thing that decides which scripts may run, and three copies of it is three
 * places for the next one to drift.
 */
export function createNonce(): string {
  return randomBytes(24).toString('base64url');
}
