# Agent instructions

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
