# Agent instructions

## Toggl session request limits

Use session-specific evidence when changing request limiting. Public API token
guidance is not an exact limit for the Bearer session authentication DeepLog uses.

Read-only experiments on 2026-11-20 made approximately 1,200 requests:

| Sustained requests/second | Observed result |
| --- | --- |
| 1, 2, and 3 | Each passed for one minute |
| 3.25 | 390 succeeded over two minutes |
| 3.5 | 141 succeeded before HTTP 429, about 40 seconds |
| 4 | 57 succeeded before HTTP 429, about 14 seconds |
| 5 | 27 succeeded before HTTP 429, about 5 seconds |

Multiple saturated backend instances each accepted 11 immediate requests before
rejecting extras. Bursts were routed across three instances, while sustained
trials usually stayed on one. Aggregate burst counts varied with routing and
must not be treated as a guaranteed account-wide allowance. Recovery was observed
within seconds; no 429 supplied Retry-After or rate/quota headers. Mixed profile,
workspace, project, tag, current-entry and read-only Analytics requests also
reproduced throttling. The quota endpoint still reported 30/30 remaining after
the session probes; this does not prove all endpoints/authentication are exempt.

These measurements support an approximate model of 11 immediate requests and
about 3.3 requests/second refill per backend. They do not establish Toggl's exact
configuration, whether the key is IP/session/account-based, or future limits.
Normal background traffic was not disabled. Re-measure before raising limits.

Enforce the conservative application policy in the shared server transport:

- Bearer sessions: a token bucket with capacity 8 and refill 3 requests/second,
  shared per credential across routes and Toggl hosts. Do not impose a fixed
  1.1-second gap on every session request or multiply capacity by backend count.
- Keep one upstream request in flight per credential, metadata caching and
  request coalescing. Canceled waiters must not spend tokens or reach Toggl.
- Honor Retry-After on 429. Without a valid header, session backoff starts at one
  second and doubles on repeated throttling, capped at 30 seconds; reset that
  escalation after a minute without throttling. Drain the local burst allowance
  on upstream 429. Never automatically replay a write.
- Treat real quota exhaustion separately: honor X-Toggl-Quota-Remaining and
  X-Toggl-Quota-Resets-In, pause the observed user/workspace/organization scope,
  and preserve HTTP 402 with a quota-specific error. Do not classify generic
  payment/feature 402s as quota failures or treat quota errors as expired sessions.
  When exhaustion is explicit but reset is absent, use a one-hour fallback.
  Workspace-to-organization aliases are not inferred by this transport.
- Public API token/other authentication retains conservative 1.1-second spacing
  and a two-minute fallback backoff; the session experiments do not establish its
  limits. Explicit upstream Retry-After still takes precedence.
- Coordination is per server process, not distributed across replicas or other
  clients. Keep diagnostics content-free; never commit session keys or raw bodies.

## Shipping ("ship it")

When Haseab says **"ship it"**, complete the release to production:

1. Review the task's changes and run the relevant tests, typechecks, and lint checks.
2. Commit and push the task's changes on a descriptive branch without a `codex/` prefix. Preserve unrelated work and leave it out of the release.
3. Open a pull request and merge the branch into `main` in `haseab/deeplog`.
4. Deploy the resulting `main` commit through the project's configured production deployment. If merging triggers deployment automatically, wait for it to finish.
5. Verify the deployment succeeded and the production site serves the change. Report the pull request, merged commit, and production URL, or any failure preventing completion.

Pushing a feature branch alone does not complete shipping.

## Local development ports

- The development server for **deeplog** uses **http://localhost:3020**.
- Run `npm run dev` in the normal checkout; its development script sets port **3020** explicitly. Do not use localhost:3000 or silently increment ports.
- Reuse an existing server for this checkout. If the assigned port is occupied by an unrelated process, inspect ownership rather than stopping another project's server.
- Port changes must update the development script, README, environment examples, and local integration/callback URLs together. Keep real credentials in ignored local environment files; never commit them or change production URLs for local development.

On Haseab's BB machine, the shared registry is `~/.bb/dev-ports.json` and
`~/.bb/bin/project-dev deeplog` uses the same assignment. These personal
files are optional; collaborators can use the repository commands above.

## Canonical DeepLog source

All DeepLog application changes, including fixes first made in the embedded BB
plugin, must also be implemented and released in this repository. Audit recent
embedded changes when syncing; preserve newer application behavior and keep
BB-specific adapters outside the standalone app. A BB plugin reload alone does
not deploy the DeepLog website.
