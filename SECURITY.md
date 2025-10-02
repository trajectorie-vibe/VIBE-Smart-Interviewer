# Security and Secrets Handling

This project uses third-party services (Google AI/Gemini, Firebase, AWS S3, SMTP, etc.). Keys and credentials must never be committed to the repository.

## Do NOT commit secrets
- Never commit `.env`, `*.env*`, or any file that contains real credentials.
- Use `.env.example` files to document the required variables with placeholder values.
- The root `.gitignore` already ignores common env files, including `backend/.env` and `**/.env`.

## If a secret was committed
1. Immediately rotate the exposed key in the provider console:
   - Google AI Studio (Gemini): create a new API key, delete or disable the old one.
   - Firebase: rotate API keys as applicable (note: client API keys are identifiers, but treat any server keys as sensitive).
   - AWS: create new access keys and deactivate the old ones.
   - SMTP or other credentials: change password / regenerate tokens.
2. Remove the secret from the repository history if this repo is public or shared externally. Options:
   - GitHub: use the "Remove sensitive data" feature.
   - Git: use `git filter-repo` (preferred) or `git filter-branch` to rewrite history and purge the file lines containing secrets.
3. Force-push the rewritten history to the remote, and ask all collaborators to re-clone.
4. Verify GitHub Secret Scanning (or enable it) and address any alerts.

## Local development
- Put backend secrets in `backend/.env` (ignored by git) and frontend server-only keys in `frontend/.env.local`.
- Ensure all example files are up to date:
  - `backend/.env.example`
  - `frontend/README.md` (documents expected env vars)

## Quick local scan for common secrets
You can run a local check for common patterns before committing. See `tools/scripts/scan-secrets.ps1`.

## Reporting a vulnerability
If you discover a security issue, do not open a public issue. Instead, contact the maintainers privately.
