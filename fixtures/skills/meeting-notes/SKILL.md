---
name: meeting-summarizer
description: Turn raw meeting transcripts into structured notes with decisions, action items, and owners. Use when the user pastes a transcript or recording export, or asks for meeting minutes, a recap, or "who agreed to do what". Do not use for summarizing documents or articles that are not meetings.
---

# Meeting Summarizer

Produce notes someone who missed the meeting can act on.

## Output format

```markdown
# <Meeting title> — <date>

**Attendees:** ...

## Decisions
- <decision> (proposed by X, agreed)

## Action items
- [ ] <task> — **owner**, due <date if stated>

## Open questions
- <unresolved point>
```

## Rules

1. Every action item needs an owner. If the transcript never assigns one,
   list it under "Open questions" instead of guessing a name.
2. Decisions are things the group *agreed on*, not things one person said.
   When agreement is unclear, mark it "(tentative)".
3. Do not invent due dates, attendees, or titles absent from the transcript.
4. Keep verbatim quotes only when the wording itself matters (commitments,
   numbers, deadlines).
5. Long transcripts: process in chronological chunks, then merge — do not
   summarize a summary.

## Example

Transcript fragment:

> Anna: I can take the billing migration, should be done by Friday.
> Piotr: Fine, but only after legal signs off.

Notes produced:

```markdown
## Action items
- [ ] Billing migration — **Anna**, due Friday (blocked on legal sign-off)
```
