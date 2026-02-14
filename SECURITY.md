# Security Policy

## Supported versions

Security fixes are applied on the latest `main` branch.

## Reporting a vulnerability

Please do not open public issues for security vulnerabilities.

Instead:

- Open a private security advisory in GitHub for this repository, or
- Contact the maintainer directly with:
  - reproduction steps
  - impact assessment
  - suggested remediation (if available)

We will acknowledge receipt, validate the report, and coordinate disclosure and fixes.

## Secrets and credentials

This project uses local Atlassian credentials and tokens. Never commit:

- `~/.ticket-tui/config.json`
- local database files
- environment files containing tokens

