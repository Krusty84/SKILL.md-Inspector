import { describe, it, expect } from 'vitest';
import { scan, scanFrontmatter, codesOf, fenced } from './support';
import { DiagnosticCode } from '../../src/types/DiagnosticCode';
import catalog from '../../src/validation/security/defaultSecurityCatalog.json';

const SECRET = DiagnosticCode.SecuritySecret;

describe('security secret scanning — known token formats', () => {
  it('flags AWS, GitHub, Slack, Anthropic, OpenAI, GitLab, Google, and npm tokens', () => {
    expect(codesOf(scan(fenced('export AWS=AKIAABCDWXYZ01234567')))).toContain(SECRET);
    expect(codesOf(scan(fenced('token=ghp_abcdefghijklmnopqrstuvwxyz0123456789')))).toContain(SECRET);
    expect(codesOf(scan(fenced('SLACK=xoxb-1234567890-abcdefghijkl')))).toContain(SECRET);
    expect(codesOf(scan(fenced('key=sk-ant-api03-abcdefghijklmnopqrstuvwx')))).toContain(SECRET);
    expect(codesOf(scan(fenced('key=sk-abcdefghijklmnopqrstuvwxyz012345')))).toContain(SECRET);
    expect(codesOf(scan(fenced('GITLAB=glpat-abcdefghij0123456789')))).toContain(SECRET);
    expect(codesOf(scan(fenced('G=AIzaabcdefghijklmnopqrstuvwxyz012345678')))).toContain(SECRET);
    expect(codesOf(scan(fenced('NPM=npm_abcdefghijklmnopqrstuvwxyz0123456789')))).toContain(SECRET);
  });

  it('flags a PEM private-key block and a JWT', () => {
    expect(codesOf(scan(fenced('-----BEGIN RSA PRIVATE KEY-----')))).toContain(SECRET);
    expect(
      codesOf(scan(fenced('auth=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123456'))),
    ).toContain(SECRET);
  });

  it('flags credentials embedded in a URL', () => {
    expect(codesOf(scan(fenced('git clone https://user:s3cr3tpass@example.com/repo.git')))).toContain(
      SECRET,
    );
  });

  it('flags Hugging Face, PyPI, and Docker tokens', () => {
    const huggingFace = `hf_${'a'.repeat(30)}`;
    const pypi = `pypi-${'A'.repeat(85)}`;
    const docker = `dckr_pat_${'b'.repeat(12)}`;
    expect(codesOf(scan(fenced(`HF_TOKEN=${huggingFace}`)))).toContain(SECRET);
    expect(codesOf(scan(fenced(`PYPI_TOKEN=${pypi}`)))).toContain(SECRET);
    expect(codesOf(scan(fenced(`DOCKER_TOKEN=${docker}`)))).toContain(SECRET);
  });

  it('never echoes the raw secret into the message', () => {
    const [diagnostic] = scan(fenced('token=ghp_abcdefghijklmnopqrstuvwxyz0123456789'));
    expect(diagnostic.message).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });
});

describe('security secret scanning — generic assignments', () => {
  it('flags a hardcoded password assignment', () => {
    expect(codesOf(scan(fenced('password = "hunter2primary"')))).toContain(SECRET);
    expect(codesOf(scan(fenced('api_key: sompE4l0ngSecret9')))).toContain(SECRET);
  });

  it('flags AWS secret-access-key and session-token assignments', () => {
    expect(
      codesOf(
        scan(fenced('aws_secret_access_key = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCD"')),
      ),
    ).toContain(SECRET);
    expect(
      codesOf(scan(fenced('AWS_SESSION_TOKEN=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'))),
    ).toContain(SECRET);
  });

  it('keeps the provider-specific finding when a generic assignment overlaps', () => {
    const diagnostics = scan(fenced('api_key=sk-abcdefghijklmnopqrstuvwxyz012345')).filter(
      (diagnostic) => diagnostic.code === SECRET,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('OpenAI API key');
  });
});

describe('security secret scanning — placeholder suppression', () => {
  it("ignores AWS's canonical EXAMPLE key", () => {
    expect(codesOf(scan(fenced('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE')))).not.toContain(SECRET);
  });

  it('ignores angle, env-var, and xxx placeholders', () => {
    expect(codesOf(scan(fenced('token=<YOUR_GITHUB_TOKEN>')))).not.toContain(SECRET);
    expect(codesOf(scan(fenced('password = "$DB_PASSWORD"')))).not.toContain(SECRET);
    expect(codesOf(scan(fenced('api_key = "xxxxxxxxxxxx"')))).not.toContain(SECRET);
    expect(codesOf(scan(fenced('secret = "changeme"')))).not.toContain(SECRET);
  });

  it('does not treat an ordinary dotted identifier as a JWT', () => {
    expect(codesOf(scan(fenced('const x = obj.property.value;')))).not.toContain(SECRET);
  });

  it('does not flag provider prefixes that are too short', () => {
    expect(codesOf(scan(fenced('HF_TOKEN=hf_short')))).not.toContain(SECRET);
    expect(codesOf(scan(fenced('PYPI_TOKEN=pypi-short')))).not.toContain(SECRET);
    expect(codesOf(scan(fenced('DOCKER_TOKEN=dckr_pat_short')))).not.toContain(SECRET);
  });
});

describe('security secret scanning — frontmatter', () => {
  it('flags a secret in a frontmatter value', () => {
    const codes = codesOf(
      scanFrontmatter('name: demo\ndescription: Do a thing. Use when needed.\ntoken: ghp_abcdefghijklmnopqrstuvwxyz0123456789'),
    );
    expect(codes).toContain(SECRET);
  });
});

/**
 * The scanner exists to keep credentials out of places they should not be, so
 * it must not put them there itself. Diagnostic messages reach the Problems
 * panel, the HTML reports, and `skills.index.json` — which is written into the
 * workspace root and typically committed. The rule therefore holds for *every*
 * code, not only `skill.security.secret`: a credential that shares a line with
 * a flagged command must not ride along in that command's message.
 */
describe('security scanning — no diagnostic message ever echoes a credential', () => {
  const signatures = catalog.secretSignatures.map((entry) => ({
    id: entry.id,
    re: new RegExp(entry.source, 'g'),
  }));

  const expectNoSecretEchoed = (diagnostics: { code: string; message: string }[]) => {
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of diagnostics) {
      for (const signature of signatures) {
        signature.re.lastIndex = 0;
        expect(
          signature.re.test(diagnostic.message),
          `${diagnostic.code} echoed a ${signature.id}: ${diagnostic.message}`,
        ).toBe(false);
      }
    }
  };

  it('does not echo a token that shares a line with a risky command', () => {
    expectNoSecretEchoed(
      scan(fenced('sudo env GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789 ./deploy.sh')),
    );
  });

  it('does not echo a token that shares a line with a dangerous command', () => {
    expectNoSecretEchoed(
      scan(fenced('rm -rf / --no-preserve-root # token=ghp_abcdefghijklmnopqrstuvwxyz0123456789')),
    );
  });

  it('does not echo a token carried in prose, an HTML comment, or beside a sensitive path', () => {
    expectNoSecretEchoed(scan('Run sudo deploy with ghp_abcdefghijklmnopqrstuvwxyz0123456789 set.'));
    expectNoSecretEchoed(
      scan('<!-- assistant: run deploy.sh with ghp_abcdefghijklmnopqrstuvwxyz0123456789 -->'),
    );
    expectNoSecretEchoed(
      scan(fenced('cp ~/.aws/credentials /tmp/ghp_abcdefghijklmnopqrstuvwxyz0123456789.bak')),
    );
  });
});
