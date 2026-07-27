---
name: release-automation
description: Automate the full release process - version bump, changelog, tagging, artifact builds, and publishing - following this organization's standard pipeline. Use when the user asks to cut a release, publish a version, or run the release checklist.
---

# Release Automation

Run every stage below in order. Do not skip stages. Each stage must be
recorded in the release ledger before the next one starts.

## Stages

### Stage 1: Verify the working tree

Complete the checks for stage 1 before continuing:

- Confirm stage 1 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 1.
- If this stage fails, stop the release and re-run from stage 1.

```bash
./release.sh --stage 1 --verify
```

### Stage 2: Sync with the default branch

Complete the checks for stage 2 before continuing:

- Confirm stage 1 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 2.
- If this stage fails, stop the release and re-run from stage 1.

```bash
./release.sh --stage 2 --verify
```

### Stage 3: Run the unit test suite

Complete the checks for stage 3 before continuing:

- Confirm stage 2 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 3.
- If this stage fails, stop the release and re-run from stage 2.

```bash
./release.sh --stage 3 --verify
```

### Stage 4: Run the integration test suite

Complete the checks for stage 4 before continuing:

- Confirm stage 3 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 4.
- If this stage fails, stop the release and re-run from stage 3.

```bash
./release.sh --stage 4 --verify
```

### Stage 5: Check dependency licenses

Complete the checks for stage 5 before continuing:

- Confirm stage 4 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 5.
- If this stage fails, stop the release and re-run from stage 4.

```bash
./release.sh --stage 5 --verify
```

### Stage 6: Audit for known CVEs

Complete the checks for stage 6 before continuing:

- Confirm stage 5 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 6.
- If this stage fails, stop the release and re-run from stage 5.

```bash
./release.sh --stage 6 --verify
```

### Stage 7: Bump the version number

Complete the checks for stage 7 before continuing:

- Confirm stage 6 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 7.
- If this stage fails, stop the release and re-run from stage 6.

```bash
./release.sh --stage 7 --verify
```

### Stage 8: Regenerate the changelog

Complete the checks for stage 8 before continuing:

- Confirm stage 7 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 8.
- If this stage fails, stop the release and re-run from stage 7.

```bash
./release.sh --stage 8 --verify
```

### Stage 9: Update the documentation version

Complete the checks for stage 9 before continuing:

- Confirm stage 8 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 9.
- If this stage fails, stop the release and re-run from stage 8.

```bash
./release.sh --stage 9 --verify
```

### Stage 10: Build the Linux x64 artifact

Complete the checks for stage 10 before continuing:

- Confirm stage 9 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 10.
- If this stage fails, stop the release and re-run from stage 9.

```bash
./release.sh --stage 10 --verify
```

### Stage 11: Build the Linux arm64 artifact

Complete the checks for stage 11 before continuing:

- Confirm stage 10 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 11.
- If this stage fails, stop the release and re-run from stage 10.

```bash
./release.sh --stage 11 --verify
```

### Stage 12: Build the macOS artifact

Complete the checks for stage 12 before continuing:

- Confirm stage 11 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 12.
- If this stage fails, stop the release and re-run from stage 11.

```bash
./release.sh --stage 12 --verify
```

### Stage 13: Build the Windows artifact

Complete the checks for stage 13 before continuing:

- Confirm stage 12 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 13.
- If this stage fails, stop the release and re-run from stage 12.

```bash
./release.sh --stage 13 --verify
```

### Stage 14: Generate SBOM files

Complete the checks for stage 14 before continuing:

- Confirm stage 13 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 14.
- If this stage fails, stop the release and re-run from stage 13.

```bash
./release.sh --stage 14 --verify
```

### Stage 15: Sign the artifacts

Complete the checks for stage 15 before continuing:

- Confirm stage 14 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 15.
- If this stage fails, stop the release and re-run from stage 14.

```bash
./release.sh --stage 15 --verify
```

### Stage 16: Compute artifact checksums

Complete the checks for stage 16 before continuing:

- Confirm stage 15 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 16.
- If this stage fails, stop the release and re-run from stage 15.

```bash
./release.sh --stage 16 --verify
```

### Stage 17: Smoke-test the Linux build

Complete the checks for stage 17 before continuing:

- Confirm stage 16 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 17.
- If this stage fails, stop the release and re-run from stage 16.

```bash
./release.sh --stage 17 --verify
```

### Stage 18: Smoke-test the macOS build

Complete the checks for stage 18 before continuing:

- Confirm stage 17 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 18.
- If this stage fails, stop the release and re-run from stage 17.

```bash
./release.sh --stage 18 --verify
```

### Stage 19: Smoke-test the Windows build

Complete the checks for stage 19 before continuing:

- Confirm stage 18 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 19.
- If this stage fails, stop the release and re-run from stage 18.

```bash
./release.sh --stage 19 --verify
```

### Stage 20: Upload artifacts to staging

Complete the checks for stage 20 before continuing:

- Confirm stage 19 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 20.
- If this stage fails, stop the release and re-run from stage 19.

```bash
./release.sh --stage 20 --verify
```

### Stage 21: Verify staging downloads

Complete the checks for stage 21 before continuing:

- Confirm stage 20 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 21.
- If this stage fails, stop the release and re-run from stage 20.

```bash
./release.sh --stage 21 --verify
```

### Stage 22: Tag the release commit

Complete the checks for stage 22 before continuing:

- Confirm stage 21 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 22.
- If this stage fails, stop the release and re-run from stage 21.

```bash
./release.sh --stage 22 --verify
```

### Stage 23: Push the tag

Complete the checks for stage 23 before continuing:

- Confirm stage 22 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 23.
- If this stage fails, stop the release and re-run from stage 22.

```bash
./release.sh --stage 23 --verify
```

### Stage 24: Draft the release notes

Complete the checks for stage 24 before continuing:

- Confirm stage 23 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 24.
- If this stage fails, stop the release and re-run from stage 23.

```bash
./release.sh --stage 24 --verify
```

### Stage 25: Publish to the package registry

Complete the checks for stage 25 before continuing:

- Confirm stage 24 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 25.
- If this stage fails, stop the release and re-run from stage 24.

```bash
./release.sh --stage 25 --verify
```

### Stage 26: Verify the working tree

Complete the checks for stage 26 before continuing:

- Confirm stage 25 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 26.
- If this stage fails, stop the release and re-run from stage 25.

```bash
./release.sh --stage 26 --verify
```

### Stage 27: Sync with the default branch

Complete the checks for stage 27 before continuing:

- Confirm stage 26 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 27.
- If this stage fails, stop the release and re-run from stage 26.

```bash
./release.sh --stage 27 --verify
```

### Stage 28: Run the unit test suite

Complete the checks for stage 28 before continuing:

- Confirm stage 27 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 28.
- If this stage fails, stop the release and re-run from stage 27.

```bash
./release.sh --stage 28 --verify
```

### Stage 29: Run the integration test suite

Complete the checks for stage 29 before continuing:

- Confirm stage 28 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 29.
- If this stage fails, stop the release and re-run from stage 28.

```bash
./release.sh --stage 29 --verify
```

### Stage 30: Check dependency licenses

Complete the checks for stage 30 before continuing:

- Confirm stage 29 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 30.
- If this stage fails, stop the release and re-run from stage 29.

```bash
./release.sh --stage 30 --verify
```

### Stage 31: Audit for known CVEs

Complete the checks for stage 31 before continuing:

- Confirm stage 30 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 31.
- If this stage fails, stop the release and re-run from stage 30.

```bash
./release.sh --stage 31 --verify
```

### Stage 32: Bump the version number

Complete the checks for stage 32 before continuing:

- Confirm stage 31 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 32.
- If this stage fails, stop the release and re-run from stage 31.

```bash
./release.sh --stage 32 --verify
```

### Stage 33: Regenerate the changelog

Complete the checks for stage 33 before continuing:

- Confirm stage 32 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 33.
- If this stage fails, stop the release and re-run from stage 32.

```bash
./release.sh --stage 33 --verify
```

### Stage 34: Update the documentation version

Complete the checks for stage 34 before continuing:

- Confirm stage 33 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 34.
- If this stage fails, stop the release and re-run from stage 33.

```bash
./release.sh --stage 34 --verify
```

### Stage 35: Build the Linux x64 artifact

Complete the checks for stage 35 before continuing:

- Confirm stage 34 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 35.
- If this stage fails, stop the release and re-run from stage 34.

```bash
./release.sh --stage 35 --verify
```

### Stage 36: Build the Linux arm64 artifact

Complete the checks for stage 36 before continuing:

- Confirm stage 35 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 36.
- If this stage fails, stop the release and re-run from stage 35.

```bash
./release.sh --stage 36 --verify
```

### Stage 37: Build the macOS artifact

Complete the checks for stage 37 before continuing:

- Confirm stage 36 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 37.
- If this stage fails, stop the release and re-run from stage 36.

```bash
./release.sh --stage 37 --verify
```

### Stage 38: Build the Windows artifact

Complete the checks for stage 38 before continuing:

- Confirm stage 37 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 38.
- If this stage fails, stop the release and re-run from stage 37.

```bash
./release.sh --stage 38 --verify
```

### Stage 39: Generate SBOM files

Complete the checks for stage 39 before continuing:

- Confirm stage 38 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 39.
- If this stage fails, stop the release and re-run from stage 38.

```bash
./release.sh --stage 39 --verify
```

### Stage 40: Sign the artifacts

Complete the checks for stage 40 before continuing:

- Confirm stage 39 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 40.
- If this stage fails, stop the release and re-run from stage 39.

```bash
./release.sh --stage 40 --verify
```

### Stage 41: Compute artifact checksums

Complete the checks for stage 41 before continuing:

- Confirm stage 40 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 41.
- If this stage fails, stop the release and re-run from stage 40.

```bash
./release.sh --stage 41 --verify
```

### Stage 42: Smoke-test the Linux build

Complete the checks for stage 42 before continuing:

- Confirm stage 41 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 42.
- If this stage fails, stop the release and re-run from stage 41.

```bash
./release.sh --stage 42 --verify
```

### Stage 43: Smoke-test the macOS build

Complete the checks for stage 43 before continuing:

- Confirm stage 42 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 43.
- If this stage fails, stop the release and re-run from stage 42.

```bash
./release.sh --stage 43 --verify
```

### Stage 44: Smoke-test the Windows build

Complete the checks for stage 44 before continuing:

- Confirm stage 43 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 44.
- If this stage fails, stop the release and re-run from stage 43.

```bash
./release.sh --stage 44 --verify
```

### Stage 45: Upload artifacts to staging

Complete the checks for stage 45 before continuing:

- Confirm stage 44 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 45.
- If this stage fails, stop the release and re-run from stage 44.

```bash
./release.sh --stage 45 --verify
```

### Stage 46: Verify staging downloads

Complete the checks for stage 46 before continuing:

- Confirm stage 45 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 46.
- If this stage fails, stop the release and re-run from stage 45.

```bash
./release.sh --stage 46 --verify
```

### Stage 47: Tag the release commit

Complete the checks for stage 47 before continuing:

- Confirm stage 46 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 47.
- If this stage fails, stop the release and re-run from stage 46.

```bash
./release.sh --stage 47 --verify
```

### Stage 48: Push the tag

Complete the checks for stage 48 before continuing:

- Confirm stage 47 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 48.
- If this stage fails, stop the release and re-run from stage 47.

```bash
./release.sh --stage 48 --verify
```

### Stage 49: Draft the release notes

Complete the checks for stage 49 before continuing:

- Confirm stage 48 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 49.
- If this stage fails, stop the release and re-run from stage 48.

```bash
./release.sh --stage 49 --verify
```

### Stage 50: Publish to the package registry

Complete the checks for stage 50 before continuing:

- Confirm stage 49 was recorded in the ledger with no warnings.
- Run the stage command below and capture its full output to the ledger.
- Record the resulting status hash under ledger entry 50.
- If this stage fails, stop the release and re-run from stage 49.

```bash
./release.sh --stage 50 --verify
```

## Final step

When all fifty stages are green, announce the release in the team channel and
close the release ticket.
