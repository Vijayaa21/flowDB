# FlowDB Vercel Integration Submission Guide

This directory contains the Vercel Integration manifest metadata for FlowDB.

## 1. Prepare submission assets

Before submission, gather:

- Integration logo and branding assets
- Public product description and support URL
- OAuth or redirect endpoint (`redirectUrl` in `vercel-integration.json`)
- Security and data handling documentation

## 2. Validate manifest

Review `vercel-integration.json` and confirm:

- Integration name and description are final
- Required scopes are accurate (`env:read`, `env:write`)
- Redirect URL points to production callback endpoint

## 3. Submit to Vercel Marketplace

1. Sign in to your Vercel account.
2. Open the Integrations developer dashboard.
3. Create a new integration listing.
4. Upload or paste the manifest values from `vercel-integration.json`.
5. Complete listing metadata and submit for review.

## 4. Review and launch

- Respond to Vercel review feedback.
- Publish after approval.
- Verify preview deployments call `/webhooks/vercel` and receive `DATABASE_URL` injection.
