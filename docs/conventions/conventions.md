# Agent base container images — local conventions

**Read this when:** you need conventions specific to this repo (style, patterns,
structure) that aren't covered by the suite-wide conventions.
**Skip if:** the topic is shared — see the meta repo's
`../../../docs/conventions/` (git/branching, documentation guide, repo structure).

> Only document what's *different* or *additional* here. Don't restate shared
> conventions.

## Code style / patterns

> TODO

## Testing conventions

> TODO

## Anything component-specific agents should know

- One Dockerfile per job kind (`spec_grill`, `feature_build`, `test_run`),
  layered on a common base — do not collapse back into a single shared image
  (see ADR 004's "Alternatives considered" for why).
- Skills map one-to-one onto job kinds. A skill for one job kind should not be
  loaded into another job kind's image.
- The `yggdrasil-contract` extension is shared across all images (in the
  common base layer); per-image `allowed-tools` scoping controls which of its
  tools are actually visible to a given skill.
