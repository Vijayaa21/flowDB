# FlowDB GitHub App Setup

This folder contains the GitHub App manifest used to register FlowDB as an integration that reacts to pull requests, pushes, and check suite activity.

## 1. Create the GitHub App from manifest

1. Sign in to GitHub as an organization owner or admin.
2. Open the manifest creation endpoint:
   - `https://github.com/organizations/<org>/settings/apps/new?state=flowdb`
3. Paste the contents of `app.yml` into the manifest editor.
4. Submit and generate the temporary app registration.

## 2. Capture app credentials

After creation, save the following values to your secure secret manager:

- App ID
- Client ID
- Client Secret
- Webhook Secret
- Private Key (.pem)

## 3. Configure FlowDB orchestrator environment

Set these variables in the orchestrator deployment:

- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_TOKEN` (installation access token generated from the app)
- `DATABASE_URL`

## 4. Install the app

1. Open the app installation page from GitHub App settings.
2. Install on repositories where FlowDB should manage branch workflows.
3. Verify webhook deliveries are received at `/webhooks/github`.

## 5. Validate behavior

- Open a pull request to trigger branch database creation.
- Push commits to trigger migration reconciliation and PR comment updates.
- Close the pull request to trigger branch database teardown.
