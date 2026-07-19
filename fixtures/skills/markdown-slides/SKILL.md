---
name: markdown-slides
description: Convert a Markdown outline into a presentation-ready HTML slide deck with consistent theming and speaker notes. Use when the user asks to turn notes, an outline, or a document into slides, or mentions a talk, deck, or presentation built from Markdown. Do not use for .pptx files - that is a different workflow.
---

# Markdown Slides

Turn an outline into a clean HTML deck: one idea per slide, big type, no walls
of text.

## Workflow

1. Split the outline into slides: every `##` heading starts a slide; content
   beyond ~5 bullets gets split into a continuation slide.
2. Choose a theme with the user — the available themes, their fonts, and color
   tokens are documented in [references/theme-guide.md](references/theme-guide.md).
   Read it before styling anything.
3. Build the deck by running [scripts/build.py](scripts/build.py):

   ```bash
   python scripts/build.py outline.md --theme clean --out deck.html
   ```

4. Move anything that reads like prose into speaker notes
   (`<!-- notes: ... -->` blocks), keeping slides to keywords and figures.
5. Open the result and check: no slide overflows, code fits without
   horizontal scrolling, contrast is readable from the back of a room.

## Rules

- Never put more than one code block on a slide.
- Figures need a one-line takeaway caption; a bare chart is not a slide.
- Keep the title slide to title, speaker, date — no agenda dump.
