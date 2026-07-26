# Body validation — best-practice research and candidate checks

Date: 2026-07-26 · Baseline: `a48d3f2` (all gates green)

The Agent Skills specification deliberately leaves the `SKILL.md` body
unspecified: "There are no format restrictions. Write whatever helps agents
perform the task effectively." The spec's own reference validator checks
frontmatter only. That makes body validation unclaimed territory for this
extension — and it means everything proposed here is **advisory by
construction**. No body finding may ever be a specification error, which is
consistent with the existing "quality findings are never fatal" rule.

This document collects the body-authoring guidance that actually exists as of
July 2026, maps it against what the extension already checks, and derives a
ranked catalog of implementable checks. Every sourced claim below was verified
by fetching the cited page or its published source repository during research;
items that could not be reached are marked UNVERIFIED and must be re-verified
before being cited in user-facing rule text.

## Sources

Official, fetched directly or from the docs' own source repositories:

| Tag | Source |
| --- | --- |
| [BP] | Anthropic skill authoring best practices — <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices> (docs.claude.com now redirects here) |
| [OV] | Agent Skills overview — <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview> |
| [ENT] | Skills for enterprise — <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/enterprise> |
| [CC] | Claude Code skills — <https://code.claude.com/docs/en/skills> |
| [SPEC] | Agent Skills specification — <https://agentskills.io/specification> (verified from `github.com/agentskills/agentskills`, `docs/specification.mdx`) |
| [AS-BP] | agentskills.io skill-creation guides (best-practices, using-scripts, optimizing-descriptions — same repo) |
| [REF] | `skills-ref` reference validator — `agentskills/agentskills`, `skills-ref/src/skills_ref/validator.py` |
| [SKC] | Anthropic skill-creator — `github.com/anthropics/skills`, `skills/skill-creator/SKILL.md` |
| [CDX] | OpenAI Codex — `github.com/openai/codex`, `codex-rs/core-skills/src/loader.rs` and the bundled skill-creator validator |
| [OC] | OpenCode — `github.com/anomalyco/opencode`, `packages/web/src/content/docs/skills.mdx` |
| [GH] | GitHub Copilot — `github.com/github/docs` (copilot content) |
| [VSC] | VS Code — `github.com/microsoft/vscode-docs`, `docs/agent-customization/agent-skills.md` |
| [OWASP] | OWASP Agentic Skills Top 10 — `github.com/OWASP/www-project-agentic-skills-top-10` |
| [SP] | obra/superpowers skill-writing guidance (community, widely cited) — `github.com/obra/superpowers` |

UNVERIFIED (unreachable from the research environment; corroborated only by
secondary sources): the two anthropic.com engineering blog posts on Agent
Skills; Simon Willison's October 2025 posts; the Snyk "ToxicSkills" study
(its numbers — 3,984 skills scanned, 36.8% with flaws, 76 confirmed malicious
— were independently repeated by three fetched sources, including OWASP, but
the primary text was not read).

## What the extension already covers

Existing rules that already implement pieces of the published guidance, so
none of the candidates below should duplicate them:

| Guidance | Existing coverage |
| --- | --- |
| Body under 500 lines / 5k tokens [BP][SPEC][CC][SKC] | `skill.token.body.lines`, `skill.token.body.limit` |
| Split large reference material [SPEC][BP] | `skill.token.referenceFile.limit`, `skill.token.references.limit`, `skill.token.otherFiles.limit` |
| Recommended sections: steps, examples, edge cases [SPEC] | `skill.body.noExamples`, body-evidence example detection, `skill.body.missing` |
| No placeholders / stub content [SKC] | Authoring hygiene: placeholders, empty sections, stub body |
| Reference bundled files from SKILL.md [BP][CC][SKC] | `skill.resource.unreferenced`, undocumented-script finding |
| Broken/unsafe local references | `skill.link.missing`, `.caseMismatch`, `.absolute`, `.escapesRoot` |
| Name/description limits, reserved words, folder match [SPEC] | The frontmatter, name, and description rule families |
| Non-repetitive, substantive instructions | Authoring hygiene: repetition, substantive-instructions, duplicate sections |

## Candidate checks

Grouped in implementation tiers. For each: proposed code, category and default
severity (per the existing taxonomy — specification, compatibility, security,
quality), the evidence, a detection sketch, and the false-positive risk. All
dictionaries mentioned should live in `defaultHeuristicDictionaries.json` so
users can tune them, matching the existing architecture.

### Tier 1 — portability and frontmatter (high value, high precision)

#### 1. `skill.frontmatter.unknownField` — information, compatibility

The spec allows exactly six fields: `name`, `description`, `license`,
`compatibility`, `metadata`, `allowed-tools` [SPEC]. The reference validator
*errors* on anything else ("Unexpected fields") [REF], OpenCode silently
ignores unknown fields [OC], and Claude Code accepts a documented superset
[CC]. A field outside the union of the spec set and all known tool supersets
is almost certainly a typo (`descripton:`) — today the extension says nothing.

Detection: set membership against a shipped, dictionary-configurable field
catalog. Caveats: `metadata` values are free-form and must never be flagged;
`gh skill add` writes provenance keys into frontmatter [GH], so the default
ignore-list needs to tolerate tool-injected fields. Severity information, not
warning: lenient hosts run these skills fine. FP risk: near zero with the
ignore-list. Quick fix: none (a rename suggestion via edit distance against
the catalog is a nice-to-have).

#### 2. `skill.frontmatter.toolSpecificField` — information, compatibility

The known-but-not-portable complement of check 1. Verified support matrix:

| Field | Spec | Claude Code | Codex | OpenCode | Copilot / VS Code |
| --- | --- | --- | --- | --- | --- |
| `license`, `metadata` | yes | yes | yes | yes | yes |
| `compatibility` | yes (≤500 chars) | yes | **absent from allowed set** [CDX] | yes | — |
| `allowed-tools` | experimental | yes | template mentions it | **not read; host-side permissions** [OC] | Copilot CLI yes; **"not supported in VS Code"** [VSC] |
| `context`, `agent`, `arguments`, `argument-hint`, `user-invocable`, `disable-model-invocation`, `model`, `effort`, `hooks`, `paths`, `shell`, `when_to_use` | no | yes [CC] | some via templates [CDX] | no | `argument-hint`, `user-invocable`, `disable-model-invocation`, `context: fork` in VS Code [VSC] |

Message pattern: "`context: fork` is a Claude Code / VS Code extension; the
spec validator rejects it and other tools ignore it." Purely informational —
using extensions is legitimate; authors should just know the blast radius.
FP risk: none (facts table). The matrix must carry source links and a
last-verified date, because it will drift.

#### 3. `skill.body.windowsPath` — warning, compatibility

[BP] is unambiguous: "Always use forward slashes in file paths, even on
Windows… Windows-style paths cause errors on Unix systems." Detection:
backslash-separated path shapes in body text and links — require a known
resource-directory prefix (`scripts\`, `references\`, `assets\`, configured
directories) or a `segment\segment.ext` shape to fire, so prose containing a
stray backslash (LaTeX, regex examples) stays quiet. Skip fenced blocks whose
info string is `powershell`/`bat`/`cmd` — backslashes are correct there.
Quick fix: flip to forward slashes. FP risk: low with the prefix guard.

#### 4. `skill.body.userSpecificPath` — warning, compatibility

Absolute links are already flagged (`skill.link.absolute`), but absolute paths
in prose and fenced commands are not. Guidance: relative paths from the skill
root [SPEC][AS-BP]; Claude Code provides `${CLAUDE_SKILL_DIR}` for
location-independent commands [CC]. Detection, precision-first subset:
user-specific home paths (`/Users/<name>/`, `/home/<name>/`, `C:\Users\`,
`~/` followed by a path that resolves inside the skill's own tree) — these are
wrong on every other machine. Generic absolute paths (`/etc/hosts`,
`/tmp/...`) are often legitimate instructional content; leave them alone in
the first iteration. Quick fix: rewrite to a relative path when the target
resolves inside the skill directory. FP risk: low for the home-path subset.

#### 5. `skill.body.timeSensitive` — information, quality

[BP]: "Don't include information that will become outdated" is a checklist
item with its own anti-pattern example. Detection: a new
`timeSensitivePhrases` dictionary — "as of writing", "at the time of
writing", "as of &lt;month&gt; &lt;year&gt;", "recently", "soon", "in the
future", "will be released", "the latest version". Deliberately exclude bare
years and dates: [BP]'s own *recommended* pattern is a dated deprecation note
("Legacy v1 API (deprecated 2025-08)"), so dates as such are fine — it is
*relative* time language that rots. FP risk: moderate ("recently" has benign
uses); information severity and a user-editable dictionary keep it honest.

#### 6. `skill.resource.nestedReference` — information, quality

[BP] (bolded): "**Keep references one level deep from SKILL.md**"; [SPEC]:
"Avoid deeply nested reference chains." Today `withResources` computes
`referenced` from SKILL.md's links only, so a file linked solely from another
reference file is reported with the same `skill.resource.unreferenced` code
as genuinely dead files — a misleading message for a distinct defect.
Implementation: during full analysis, run the existing Markdown link parser
over bundled `.md` resources (their text is already read for token counting),
then split the diagnostic: unreachable from anywhere stays `unreferenced`;
reachable only transitively becomes `nestedReference` ("link it from SKILL.md
so the agent can discover it in one hop"). Quick fix: the existing
reference-untracked-resource fix applies. FP risk: low; the evidence is a
resolved link graph. Effort: moderate (per-resource link extraction + cache).

### Tier 2 — security review aids (the differentiator)

Context that justifies the tier: GitHub's own docs warn that skills "may
contain prompt injections, hidden instructions, or malicious scripts" and tell
users to inspect before installing [GH]; [ENT] lists concrete review
indicators (external URLs and fetch/curl calls, "directives to ignore safety
rules, hide actions from users", paths outside the skill directory);
[OWASP] catalogs the attack classes and publishes review checklists. The
extension already has a security category and a static suspicious-link rule —
these checks extend that posture to body and bundled text.

Honesty requirement, in the round-3 tradition: pattern matching demonstrably
does not catch semantic attacks — [OWASP] shows a natural-language
exfiltration sentence that defeats every regex, and the (secondary-source)
Snyk numbers say 13.4% of critical issues evade pattern scanners. Every
finding in this tier must therefore present as "review this", never "this is
safe/unsafe", and a clean scan must never be summarized as "no security
issues". A report line like "static patterns only — a clean result is not an
audit" belongs next to any rollup of these findings.

#### 7. `skill.security.secretLiteral` — warning, security

[ENT]: credentials must "never appear in Skill content." Detection:
high-precision literal patterns only — `AKIA[0-9A-Z]{16}`, `sk-ant-`,
`ghp_`/`gho_` + 36 chars, `xox[bap]-`, `-----BEGIN … PRIVATE KEY-----`,
`AIza` + 35 chars. Guard against placeholders: skip values containing
`<`, `YOUR`, `EXAMPLE`, `xxx`, `$`, `{{`. Scan body and readable bundled
text (both already in memory during full analysis). FP risk: very low with
the placeholder guard; do not attempt entropy-based generic detection in v1.

#### 8. `skill.security.invisibleUnicode` — warning, security

[OWASP] checklist: scan for "zero-width Unicode, base64 payloads, ASCII
smuggling". Detection: bidi controls (U+202A–U+202E, U+2066–U+2069),
zero-width characters (U+200B, U+200C, U+2060, U+FEFF when not a leading
BOM), and Unicode tag characters (U+E0000–U+E007F, the ASCII-smuggling
range). Exemption: U+200D (ZWJ) when adjacent to emoji/pictographic
codepoints — legitimate emoji sequences use it. Report the codepoint and
offset. FP risk: near zero with the ZWJ exemption; these characters have no
legitimate role in skill instructions.

#### 9. `skill.security.remoteExecution` — warning, security

[ENT] risk indicators include curl/fetch calls; [OWASP]'s verified attack
pattern list includes "Base64-obfuscated payloads piped to bash". Detection
in fenced command blocks and inline code: download-piped-to-shell
(`curl|wget … | sh|bash|zsh`), `Invoke-Expression` on downloaded content,
decode-piped-to-shell (`base64 -d … | sh`). Message: "downloads and executes
remote content — review the destination before trusting this skill." FP
risk: low; the pipe-to-interpreter shape is rare in legitimate skills, and
where it is intentional (installers) the warning is exactly what a reviewer
wants surfaced.

#### 10. `skill.security.injectionPhrase` — information, security

[ENT]: "Directives to ignore safety rules, hide actions from users" are
review indicators. Detection: a configurable `injectionPhrases` dictionary —
"ignore previous instructions", "disregard your instructions", "do not tell
the user", "hide this from the user", "without informing the user", "delete
the history". Information severity: these phrases are review triggers, not
verdicts (a security-testing skill may legitimately discuss them — which is
also why the dictionary must be user-editable). FP risk: moderate by nature;
severity and wording carry the honesty.

#### 11. `skill.security.credentialPathAccess` — information, security

The [OWASP] checklist requires "no undeclared access to .env, ~/.ssh/,
~/.aws/, credentials, or wallets", and the corroborated ToxicSkills patterns
were exactly `~/.ssh` / `~/.aws/credentials` exfiltration. Detection:
mentions of credential-store paths (`~/.ssh`, `~/.aws`, `.env`, `id_rsa`,
keychain, wallet paths) in body or bundled scripts. Always information-level:
"this skill touches credential stores — verify that matches its stated
purpose." Do not attempt to automate the purpose comparison; that is
semantic. FP risk: moderate (git/ssh tutorial skills), acceptable at
information severity with a dictionary.

#### 12. `skill.security.dynamicContext` — information, security + compatibility

Claude Code executes `` !`command` `` placeholders and ```` ```! ````
fenced blocks **before the model sees the content** — "This is preprocessing,
not something Claude executes"; disabled by `disableSkillShellExecution`
[CC]. Verified syntax details: the inline form only fires at line start or
after whitespace, and output is not re-scanned. A reviewer scanning a
third-party skill should see load-time shell execution called out; on other
tools the same text is inert prose, which is also a portability fact.
Detection: the two syntaxes, with the position rule, outside ordinary fenced
code. FP risk: very low (the syntax is distinctive).

### Tier 3 — style and structure (information-level, opt-in leaning)

#### 13. `skill.body.argumentCollision` — warning, compatibility

Verified semantics [CC]: `$name` substitution applies to names declared in
the `arguments:` frontmatter list; substitution "runs once over the original
file", including fenced code; a declared name with no matching argument
expands to an **empty string**; escaping is `\$` and only before a digit,
`ARGUMENTS`, or a declared name. Consequence: `arguments: [output]` plus a
bash snippet using `$output` as a shell variable is silently rewritten at
invocation. Detection: declared argument names colliding with `$name` tokens
inside fenced code. Quick fix: escape as `\$name`. FP risk: near zero — the
collision is mechanical. Small audience (Claude Code + `arguments:` users),
but wrong in a way nobody would debug easily.

#### 14. `skill.script.interactiveInput` — warning, quality

[AS-BP] scripts guidance is categorical: "A script that blocks on interactive
input will hang indefinitely." Detection in bundled scripts (already read as
text): Python `input(`, `getpass.`, shell `read -p`/bare `read` with a
variable, PowerShell `Read-Host`, Node `inquirer`/`prompts` imports. FP risk:
low for the listed forms; message suggests flags/env vars instead.

#### 15. `skill.resource.noToc` — information, quality

[BP]: reference files over 100 lines should have a table of contents; [SKC]
says over 300. The sources disagree, so default to the conservative 300 and
document both numbers in the rule text. Detection: bundled `.md` over the
threshold with fewer than 2 headings, or headings but no anchor-link block
near the top. FP risk: moderate (a TOC is recognizable only heuristically) —
information severity, off under `body.strictness: disabled`.

#### 16. `skill.body.emphaticDirectives` — information, quality

[SKC]: "If you find yourself writing ALWAYS or NEVER in all caps… that's a
yellow flag" — while [BP] separately advises escalating to "MUST" when a
model ignores a rule, so this must stay a gentle nudge. Detection: density of
all-caps directive tokens (MUST, ALWAYS, NEVER, CRITICAL, IMPORTANT) above a
generous threshold (e.g. more than 5 occurrences and more than 2 per 100
lines). FP risk: the threshold is the honesty; never fire on 1–2 uses.

#### 17. `skill.resource.genericName` — information, quality

[BP]: "Use names that indicate content: `form_validation_rules.md`, not
`doc2.md`"; bad example `docs/file1.md`. Detection: bundled files matching
`(doc|file|notes|misc|stuff|untitled|new|temp)[0-9]*\.\w+` (dictionary-
configurable). FP risk: low; trivially disabled by users who disagree.

#### 18. `skill.link.deadAnchor` — information, quality

Pure-fragment links (`#section`) are currently skipped by the link parser
entirely, and the heading parser already records text and depth — so
validating that `[…](#some-heading)` matches a real heading slug is cheap.
Note the modest stakes honestly: agents read raw Markdown, so a dead anchor
mostly hurts human readers, and slug algorithms differ between renderers
(implement GitHub's slugger, state that in the rule doc). FP risk: low.

### Existing rules to revisit against the 2026 guidance

- **`skill.body.noWhenToUse`.** Current official guidance conflicts with this
  rule's premise. [SKC] on the description field: "All 'when to use' info
  goes here, not in the body"; [SP]'s hardest-won lesson is the same
  ("Description = When to Use"), and [CC] frames body content as standing
  instructions, "every line is a recurring token cost". But OpenAI's
  embedded Codex template *requires* a "When to use (triggers and
  non-goals)" body section [CDX]. Proposal: keep the rule but (a) suppress it
  when the description already carries a full trigger clause — the shared
  `DescriptionAnalysis` exposes exactly this signal — and (b) reword the
  message so it stops implying a body section is universally expected. The
  ecosystems genuinely disagree; the rule text should say so.
- **`skill.token.body.limit` message.** Add the Claude Code consequence: on
  auto-compaction only "the first 5,000 tokens of each" re-attached skill
  survive within "a combined budget of 25,000 tokens" [CC] — an over-budget
  body is not just expensive, it gets truncated.
- **`skill.name.folderMismatch` scope.** The match is now independently
  required by [SPEC], [OC], and [VSC] ("Names with invalid characters cause
  the skill to silently fail to load" is VS Code's own framing for name
  problems), while Claude Code treats `name` as optional/display-only [CC].
  This strengthens the case for firing the rule outside literal `skills/`
  parents (currently it is silently skipped there) with the Claude Code
  divergence noted in the rule doc.
- **`skill.description.xmlTags` and `skill.name.reservedWord`.** Confirmed
  Anthropic-platform rules, not spec rules; consider labeling them
  "Anthropic platform" in `docs/rules.md` so Codex/Copilot-targeting authors
  understand the scope (they are still worth enforcing by default — skills
  should stay portable *to* the strictest platform).

### Considered and rejected for static checking

Recorded so future sessions do not re-derive them:

- **Consistent terminology** [BP], **option menus / default-plus-escape-hatch**
  [BP][AS-BP], **degrees-of-freedom calibration** [BP], **procedures over
  declarations** [AS-BP], **"would the agent get this wrong" content
  selection** [AS-BP], **description accurately reflecting body behavior**
  [OWASP]: all semantic judgments. A word-overlap proxy for any of them would
  repeat the round-3 mistake — a proxy drifting from the label. These are the
  natural first workload for the currently inert LLM provider seam, and for
  the `src/evaluation/` harness (which is also where [BP]'s "three eval
  scenarios before writing docs" guidance points).
- **Gerund naming** [BP]: explicit style suggestion, contested by [SP]'s
  verb-first convention; too opinionated even for information severity.
- **Flowchart usage rules** [SP]: community-specific style, not portable
  guidance.
- **Entropy-based generic secret detection**: the false-positive rate on
  hashes, IDs, and base64 assets would violate the precision-first posture;
  the literal patterns in check 7 carry the value.
- **Unqualified MCP tool-name detection** [BP]: a bare word cannot be
  statically known to be a tool reference.

## Suggested order and gates

1. Tier 1, checks 1–2 (frontmatter portability): pure data-table checks, new
   user value on day one, no benchmark interaction.
2. Tier 2, checks 7–9 and 12: the security-review story, clearly labeled
   advisory. Add a small labeled corpus (malicious-pattern fixtures vs benign
   look-alikes: a PowerShell tutorial, a git-workflow skill mentioning
   `~/.ssh`) as the falsifiable gate, in the plan-8 tradition, before tuning
   patterns.
3. Tier 1, checks 3–6, then the `noWhenToUse` revision.
4. Tier 3 as appetite allows; every check individually severity-overridable
   and dictionary-backed, per the existing architecture.

Every new code needs a `docs/rules.md` entry with good/bad examples, and the
portability matrix (check 2) should record its verification date — it is the
one piece of this document guaranteed to rot.
