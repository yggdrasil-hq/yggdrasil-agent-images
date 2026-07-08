# Agent base container images docs — index

Agent + developer docs for this repo. Start from [`../CLAUDE.md`](../CLAUDE.md).
Suite-wide docs live in the meta repo's `../../docs/`.

Every doc opens with a `**Read this when:**` line — use it to decide relevance
before reading the body.

## overview/
| Doc | Read this when |
|-----|----------------|
| [`overview/architecture.md`](overview/architecture.md) | You need how this repo is structured internally. |
| [`overview/setup.md`](overview/setup.md) | You're building or testing images locally. |

## concepts/
| Doc | Read this when |
|-----|----------------|
| [`concepts/images.md`](concepts/images.md) | You need the common-base + per-job-kind Dockerfile layout. |
| [`concepts/skills.md`](concepts/skills.md) | You're writing or adapting a Pi skill for a job kind. |
| [`concepts/contract-extension.md`](concepts/contract-extension.md) | You're working on the shared `yggdrasil-contract` extension. |
| [`concepts/model-config.md`](concepts/model-config.md) | You're touching the `models.json` template or env-var contract. |

## conventions/
| Doc | Read this when |
|-----|----------------|
| [`conventions/conventions.md`](conventions/conventions.md) | Conventions specific to this repo (defer to meta repo for shared ones). |

> Follow `../../docs/conventions/documentation-guide.md` when adding docs.
> See `../../docs/adr/004-agent-base-containers.md` for the accepted design
> this repo implements.
