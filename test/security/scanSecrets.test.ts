import { describe, it, expect } from 'vitest';
import { scan, scanFrontmatter, codesOf, fenced } from './support';
import { DiagnosticCode } from '../../src/types/DiagnosticCode';

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
});

describe('security secret scanning — frontmatter', () => {
  it('flags a secret in a frontmatter value', () => {
    const codes = codesOf(
      scanFrontmatter('name: demo\ndescription: Do a thing. Use when needed.\ntoken: ghp_abcdefghijklmnopqrstuvwxyz0123456789'),
    );
    expect(codes).toContain(SECRET);
  });
});
