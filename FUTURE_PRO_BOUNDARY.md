# Future Pro Boundary (OSS-first)

This document defines what remains open forever and what may become paid later.

## Principle

`ticket-tui` is open-source-first. We do not gate current local workflows behind a paywall.

## OSS Forever (core product)

These remain free and open in the main project:

- local single-user TUI runtime
- Jira browsing/search/create/update/comment/status transitions
- Confluence browse/search/edit/comment/label/attachment flows
- keyboard navigation and shortcuts
- local bookmarks, recents, and cache
- local setup/configuration and local editor integrations

## Candidate Pro Scope (later, optional)

If/when monetization is added, it should target hosted/team value, for example:

- shared team workspaces/sync
- organization-wide identity (SSO/SAML/SCIM)
- role-based access controls and policy enforcement
- audit logs and compliance reporting
- managed cloud configuration and enterprise support

## Guardrails

- No feature currently in OSS is moved behind a paywall.
- No degraded OSS UX to force upgrades.
- OSS remains fully usable for individual engineers and small teams.

## Release Trigger For Any Pro Work

Do not build Pro before clear pull from real users.

Suggested trigger:

- at least 25 teams explicitly request shared/security/compliance capabilities.

## Positioning

- OSS is the product foundation and trust layer.
- Pro, if added, is for org-scale operations, not for basic usage.
