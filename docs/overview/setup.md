# Agent base container images — local setup

**Read this when:** you're building or testing these images locally.

> TODO: fill in once Dockerfiles exist.

## Prerequisites

> TODO (Docker, Pi CLI version pin)

## Install & run

```bash
# TODO: docker build per job kind, e.g.
# docker build -f feature_build/Dockerfile -t yggdrasil-agent-images/feature_build:dev .
```

## Environment variables

`models.json` is templated to read `MODEL_BASE_URL` / `MODEL_API_KEY` /
`MODEL_ID` from the environment (see ADR 004). The Orchestrator injects the
per-project values at job-pod creation time — these are not meant to be baked
into the image.

## Tests

```bash
# TODO
```
