# Changesets

Every user-facing change needs one: run `pnpm changeset`, pick a bump, describe the change for
users. All packages share one version (`fixed` in `config.json`). The release workflow opens a
"Version packages" PR from these files and publishes when it merges.
