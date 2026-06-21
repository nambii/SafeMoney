---
name: release
description: Cut a SafeMoney npm release — verify gates, bump the version, tag, and publish with provenance. Use when asked to "release", "publish", "cut a version", "ship to npm", or "bump and tag".
---

# Release

SafeMoney publishes to npm as an unscoped public package. This skill drives a safe, repeatable release. Do NOT publish without the user's explicit go-ahead on the version number.

## Pre-flight (must all be green)

1. Run the **quality-gate** skill (typecheck, build, tests, Biome, coverage, reconcile). Stop if anything is red.
2. Run `npm run mutation` (or at least on changed exact-math files) and confirm the score is at/above the `break: 75` threshold. For money code, this is the gate that matters most.
3. `git status` clean and on the intended branch; confirm the diff since the last tag is what you expect.
4. Confirm npm auth: `npm whoami` (must resolve). If not, tell the user to `npm login` — do not attempt it for them.
5. Inspect the publish artifact: `npm pack --dry-run`. Confirm it ships `dist/` (esm+cjs), `src/`, `README.md`, `LICENSE` and **excludes** `test/`, `bench/`, `examples/`, `docs/`. Confirm no `.npmrc` or secrets.

## Version

Ask the user for the bump unless they specified one. Follow semver — and remember the package is pre-1.0, so document breaking changes clearly but a minor bump is acceptable for them.

- `npm version <patch|minor|major>` (creates the commit + tag), or set an exact version.
- Update the README/changelog if the release adds or changes public API.

## Publish

- `prepublishOnly` already runs `npm run build`, so dist is fresh.
- Publish **with provenance** (fits the "checkably correct" positioning):
  `npm publish --provenance --access public`
  Provenance requires running from CI (GitHub Actions) with `id-token: write`. If publishing locally, drop `--provenance` and note that to the user.
- Push the tag: `git push --follow-tags`.

## Post-publish

- Verify: `npm view safemoney version` matches.
- Confirm the docs Pages workflow deployed (it runs on push to `main`).
- Remind the user that a published version is immutable — a bad publish needs a new version, not a re-push.

## Guardrails
- Never publish from a dirty tree or a red gate.
- Never `npm version`/`publish` without explicit user confirmation of the number.
- The `gh`/npm active account matters — confirm identity before any outward-facing action.
