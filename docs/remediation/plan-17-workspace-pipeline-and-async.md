# Plan 17 — Make the incremental/cancellable pipeline actually incremental and cancellable

Source: round-4 algorithm evaluation. Self-contained; no external report required.

**Independent of Plans 12–16.** Touches `src/workspace/`, `src/parser/resourceCache.ts`,
`src/diagnostics/`, `src/online/`, `src/extension.ts`, and `src/ui/*Webview.ts`.

The primitives here are sound — the keyed debouncer's trailing+maxWait logic is correct,
`SingleFlight.runLatest` is a proper coalescing single-flight, `FileTokenCache` validates
against mtime+size, and the core is kept `vscode`-free behind injectable seams. The
*composition* is where the design's promises are not kept.

## Context

**A. Cancellation and progress in the workspace pipeline are inert.**
`discoverSkillPaths → analyzeWorkspace → analyzeSkill → detectCollisions`
(`analyzeWorkspace.ts:63`) is one synchronous, non-yielding block. The
`CancellationSignal` checks and `onProgress` callbacks threaded through it can never be
observed, because the extension host cannot process the cancel click until the loop has
already returned. At 500 skills the progress notification sits at 0/500 for the whole
scan, the Cancel button does nothing, and `result.analysis.cancelled` is always `false`.

**B. The workspace path bypasses both caches the extension owns.**
`analyzeWorkspace.ts:144` calls `analyzeSkill` without the `discover` / `fileTokens`
seams that `DiagnosticsProvider` passes. Saving one SKILL.md re-walks every skill
directory, re-stats every resource, and re-BPE-encodes every reference file — for 499
skills that did not change.

**C. `ResourceCache` is path-keyed with no staleness validation, and its invalidation
trigger is narrower than what it caches.** `resourceCache.ts:16` keys on directory alone —
no mtime, no size, no hash — while its sibling `FileTokenCache` validates on both. The
watcher globs cover `references|scripts|assets|templates`, but `discoverResources` walks
the *whole* skill directory, so creating `my-skill/notes.md` or deleting
`my-skill/data/spec.md` fires no matching event and the next `validate()` — including on
save — is served stale.

Separately, `resourceCache.ts:53`'s private `isInside` uses `!rel.startsWith('..')`,
reintroducing exactly the prefix bug that `linkPaths.isPathInsideDir` (`:43-50`) exists to
avoid and documents avoiding. A file named `..archive-notes.md` inside the directory is
judged outside it, so its change never invalidates the cache.

**D. Ordering depends on the host locale.** `analyzeWorkspace.ts:74` sorts with
`a.name.localeCompare(b.name)` and no explicit locale; `descriptionHeuristics.ts:807` and
`dictionaries.ts:120` do the same. Two developers exporting `skills.index.json` from the
same commit on `en-US` and `sv-SE` hosts get different orderings — a spurious diff, in a
pipeline `ARCHITECTURE.md` describes as deterministic. Collision pair orientation follows
the same sort, so `{a, b}` can swap.

**E. Collision output is unbounded.** `detectSkillCollisions.ts:144` pushes every pair at
or above the threshold with no cap. 500 skills built from one house template produced
**124,750** reported collision objects, each carrying `metrics` and `sharedTerms`, all
rendered into the webview and the tree view.

**F. Remote-link sockets leak on success.** `nodeRemoteLinkDependencies.ts:45` clears the
timeout and removes the abort listener on the success path but never destroys the socket;
`dispose()` cannot reclaim it. The limiter caps concurrency, not lifetime.

**G. `AsyncLimiter` recurses synchronously while draining on cancel**
(`remoteLinkChecker.ts:467-481`). ~4,000 queued URLs recurse ~4,000 levels deep, throwing
`RangeError` and leaving every queued `run()` promise unsettled — so `checkDocument`'s
`Promise.all` never resolves.

**H. Only the first resolved address is ever tried.** `remoteLinkChecker.ts:294` takes
`addresses[0]`. On an IPv6-only network every dual-stack host resolves to the unreachable
A record first, and every remote link in every skill is reported unavailable after the
10 s timeout. (All addresses *are* validated, so this is a reachability bug, not an SSRF
hole — the security design is correct and must not change.)

**I. Closing a document inside the debounce window resurrects its diagnostics.**
`extension.ts:349` — `provider.clear` runs, then ~250 ms later the pending callback
re-publishes. The Problems panel then shows errors for a file that is not open.

**J. CSP nonces use `Math.random()`**, duplicated in three places
(`skillReportWebview.ts:52`, `workspaceReportWebview.ts:58`,
`openCodeSessionReportWebview.ts:169`). Not exploitable today — there is no HTML injection
point and no `innerHTML` anywhere in the repo — but a predictable nonce is the wrong
default for the value that gates `script-src`.

## Reproduce first

- `test/workspace/cancellation.test.ts` — drive `analyzeWorkspace` with a token that flips
  after the first skill; assert `cancelled === true` and that fewer than all skills were
  analyzed. Fails today.
- `test/parser/resourceCacheStaleness.test.ts` — cache a directory, write a new file
  outside `references|scripts|assets|templates`, assert the next `discover` sees it.
- `test/online/limiterDrain.test.ts` — queue 5,000 tasks, abort, assert every promise
  settles and no `RangeError` is thrown.
- Assert `isInside('/w/foo', '/w/foo/..archive.md') === true`.

## Scope

- **`src/workspace/analyzeWorkspace.ts`** — make the per-skill loop `async` and `await` a
  yield (`setImmediate`) every N skills so the host can process cancellation and paint
  progress. Thread the provider's `discover`/`fileTokens` seams through so the workspace
  path shares `ResourceCache` and `FileTokenCache`. Sort with an explicit locale-invariant
  comparator (`Intl.Collator('en', …)` or plain `<`).
- **`src/parser/resourceCache.ts`** — key on directory + a cheap directory signature
  (mtime of the dir plus entry count), or validate entries on read like `FileTokenCache`
  does; delete the private `isInside` and import `isPathInsideDir`. Widen the watcher
  globs to the whole skill directory minus the exclusion globs.
- **`src/workspace/detectSkillCollisions.ts`** — cap the reported list (e.g. 500,
  configurable) and report the suppressed count, the way Plan 13 caps OpenCode
  diagnostics.
- **`src/online/nodeRemoteLinkDependencies.ts`** — `socket.destroy()` on the success path.
- **`src/online/remoteLinkChecker.ts`** — drain the limiter queue iteratively; on
  cancellation settle queued tasks to `{kind: 'cancelled'}` rather than abandoning them;
  try each validated address in turn instead of only `addresses[0]`.
- **`src/extension.ts:349`** — cancel the pending debounced validation on document close.
- **Extract one `createNonce()`** using `node:crypto` `randomBytes`, and use it in all
  three webview hosts.

**Non-goals.** No change to the SSRF validation logic (`isPublicIpAddress`, the
resolve-then-pin-then-verify flow, redirect re-validation) — that part is correct and was
verified on 14/14 adversarial vectors. No move to worker threads.

## Acceptance criteria

1. Cancelling a 500-skill workspace scan stops it; `cancelled === true`; progress advances
   during the scan.
2. Saving one SKILL.md in a 500-skill workspace does not re-read unchanged resource files
   (assert via a counting `fileTokens` seam).
3. A resource created anywhere under the skill directory invalidates the cache;
   `..archive.md` is treated as inside.
4. `skills.index.json` byte-compares equal across `en-US` and `sv-SE` (`LC_ALL`).
5. A 500-skill homogeneous workspace reports at most the cap and states the suppressed
   count.
6. No socket handle survives `session.dispose()`; cancelling 5,000 queued URLs settles
   every promise with no `RangeError`.
7. Closing a file mid-debounce leaves the Problems panel empty for it.
8. All three webviews use the crypto-backed nonce.

## Verification checklist

```
npm run check-types && npm run lint && npm test && npm run check:heuristic-dictionaries
LC_ALL=sv_SE.UTF-8 npm test   # ordering determinism
```
