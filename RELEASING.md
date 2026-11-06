# Publishing line-pay-merchant

This repository uses npm Trusted Publishing (OIDC) with **stage-only** permission.
A GitHub Release queues a verified tarball for review. It does **not** make
the package publicly installable until a maintainer approves the npm stage
with two-factor authentication.

## One-time setup

1. On npmjs.com, configure Trusted Publisher for GitHub repository
   `enylin/line-pay-merchant`, workflow `release.yaml`, environment `npm`.
   Allow `npm stage publish`, not direct `npm publish`.
2. In GitHub Settings > Environments, create/verify environment `npm`, allow
   deployments from tags `v*`, and optionally require a reviewer.
3. For the docs site, GitHub Settings > Pages > Build and deployment must use
   **GitHub Actions**. Also ensure environment `github-pages` permits
   deployments from `main`. (The first V4 docs deployment failed because
   the environment only allowed `gh-pages`.)
4. Run the CI workflow on `main` and confirm all checks are green.

## Publish a version

1. Update `package.json`, `package-lock.json`, documentation and
   `CHANGELOG.md` together, via a pull request into `main`.
2. Review the known limitations below before authorizing a stable release.
3. On GitHub Releases choose **Draft a new release**. Create tag `vX.Y.Z`
   **from `main`**, matching `package.json` exactly. Do not mark a stable
   release as a pre-release. Click **Publish release**.
4. Watch the `release` workflow. The build checks the tag and commit,
   runs `npm run verify`, packs and verifies a tarball, and calls
   `npm stage publish ... --tag latest` for a stable version.
5. On npmjs.com, open **Staged Packages**, inspect the version and tarball,
   then approve with 2FA. Or:
   ```bash
   npm stage list line-pay-merchant
   npm stage view <stage-id>
   npm stage approve <stage-id>
   ```
6. Confirm the live registry changed:
   ```bash
   npm view line-pay-merchant version
   npm dist-tag ls line-pay-merchant
   ```

The workflow deliberately uses the `next` dist-tag for pre-release versions
and `latest` for stable versions. After staging, this dist-tag choice cannot
be changed without rejecting and restaging the version.

## V4 coverage reviewed for 1.0.0

The ordinary payment flow has been tested in production. Core V4 Sandbox
coverage includes payment requests, payment and refund details, status
queries, refunds, duplicate confirm, and reconciliation.

Two specifically documented `TODO(v4-spec)` source markers remain allowed
by the stable-release gate, rather than being falsely marked as verified:

- `src/operations/request.ts`: PREAPPROVED registration child fields are
  not verified on a merchant enabled for that capability.
- `src/reconcile/rules.ts`: mixed discount/promotion totals after partial
  refunds remain unverified. A mismatch is `indeterminate`.

Any new source `TODO(v4-spec)` fails the stable release build. Maintain
this review boundary when adding new V4 capabilities. Manual npm stage
approval is the final opportunity to reject a package.

Do not put npm auth tokens in the repository. Trusted Publishing uses
GitHub Actions OIDC.
