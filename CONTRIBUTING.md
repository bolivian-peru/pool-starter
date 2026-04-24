# Contributing to pool-starter

Thanks for your interest in contributing. A quick read below keeps everyone aligned.

## Ground rules

- **Open an issue first** for non-trivial changes. "Non-trivial" ≈ more than ~30 lines or anything that changes a public API. Saves you from writing a PR we can't merge.
- **One change per PR.** A fix and a refactor in the same PR doubles review time and the chance of a revert.
- **Preserve the simplicity.** This project deliberately avoids ORMs, state libraries, paid services, and heavy frameworks. New dependencies should be argued for in the issue before the PR.

## Local setup

```bash
git clone https://github.com/proxies-sx/pool-starter.git
cd pool-starter
pnpm install

# Build + test both packages
pnpm -r build
pnpm -r test

# Run the starter locally
cd apps/starter
cp .env.example .env
docker compose up -d db
pnpm db:migrate
pnpm dev
```

## Coding conventions

- **TypeScript strict mode.** No `any` without a comment explaining why.
- **Parameterized SQL only** — `pg` `$1` placeholders. String concatenation in SQL is a CI failure.
- **Env vars are declared in `.env.example`** — any new env var must be documented there in the same PR.
- **No client-side secrets.** If you're tempted to reference `process.env.PROXIES_SX_API_KEY` from a client component, step back and route through a server handler.
- **Comments explain *why*, not *what*.** Code tells you what; comments tell you why the non-obvious choice was made.
- **Update the `CLAUDE.md` files** if your change affects how an AI agent would customize the app.

## Test expectations

- **SDK and React packages** — add tests for new public functionality. Run `pnpm -r --filter @proxies-sx/pool-sdk test` (or `…/pool-portal-react`).
- **Starter app** — at minimum, `pnpm typecheck` and `pnpm build` must pass. End-to-end tests are welcome but not required.

## Commit messages

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`). Keep the subject line under 72 characters. Body only if there's context that isn't obvious from the diff.

## Release process (maintainers only)

1. Bump versions in `packages/*/package.json` and `apps/starter/package.json`.
2. Run `pnpm -r build && pnpm -r test`.
3. Tag the commit: `git tag v0.x.y && git push --tags`.
4. For npm releases: `cd packages/sdk && pnpm publish --access public`, same for `packages/react`.

## Security issues

Please email `security@proxies.sx` instead of opening a public issue. You'll get an ack within 48 hours.

## License

By contributing, you agree your contribution will be released under the MIT license of the project.
