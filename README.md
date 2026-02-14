# ticket-tui

> Jira + Confluence workflows from one keyboard-first terminal UI.

`ticket-tui` (published package: `ticket-tui`) is an open-source TUI for Atlassian teams who want fewer browser tabs and faster execution loops.

Repository:

- Issues: https://github.com/arnavpisces/ticket-tui/issues
- Pull Requests: https://github.com/arnavpisces/ticket-tui/pulls

## Why This Exists (10-second pitch)

- Run Jira and Confluence from one app, without leaving terminal.
- Search, create, edit, comment, and manage attachments with keyboard flows.
- Keep data local-first: config, cache, bookmarks, and recents live on your machine.

## What Works Today

### Jira

- Browse assigned/reported issues with pagination.
- Search issues with:
  - fuzzy query mode
  - quick filters
  - custom JQL
- Open full issue detail views.
- Create new issues (project + issue type + summary + description).
- Edit issue title and description.
- Add and edit comments.
- Transition issue status.
- Upload/download attachments.
- Open issue in browser and copy issue URL/key.
- Bookmark issues and revisit from recents.

### Confluence

- Browse recent pages with pagination.
- Search pages using CQL-backed query flow.
- Browse pages by space tree.
- Open page viewer with markdown + mdcat rendering modes.
- Edit page content and save back to Confluence storage format.
- Open external editor (`$EDITOR`/Cursor/VS Code fallback) for long-form edits.
- View and add comments.
- View/add/remove labels.
- View/upload/download/open attachments.
- Open page in browser and copy page URL.
- Bookmark pages and revisit from recents.

### Core UX + Storage

- Tab-based Jira/Confluence navigation.
- Global help modal and keyboard-first interaction model.
- Local persistent cache (SQLite) for faster repeated views.
- Local persistent bookmarks and recent history.
- Setup wizard for Jira + Confluence credentials.

## Install And Run (30 seconds)

### Global install

```bash
npm install -g ticket-tui
ticket-tui setup
ticket-tui
```

### Run from source

```bash
cd ticket-tui
npm install
npm run build
npm start -- setup
npm start
```

## Core Commands

```bash
ticket-tui setup     # configure Jira + Confluence credentials
ticket-tui           # start the TUI (default command)
ticket-tui start     # explicit start command
```

## Keyboard Model

### Global

- `Tab`: switch Jira/Confluence tabs
- `?`: toggle help
- `Esc`: close overlays / go back
- `Ctrl+Q` or `Ctrl+C`: quit

### Common in detail views

- `Ctrl+O`: open current item in browser
- `Ctrl+Y`: copy URL
- `Ctrl+B`: toggle bookmark
- `Ctrl+E`: open external editor when editable

## Configuration And Data

Configuration path:

- `~/.ticket-tui/config.json`

Local cache/bookmarks/recents database:

- `~/.ticket-tui/cache.db`

Security note:

- API tokens are stored locally.
- Treat local config files as secrets and never commit/export them.

## Open Source Strategy

This project is intentionally open-source-first.

- The core single-user CLI experience stays open.
- No paywall inside current local Jira/Confluence workflows.
- Product quality and speed come before monetization.

## Future Pro Boundary

The Pro boundary is documented here:

- [`FUTURE_PRO_BOUNDARY.md`](./FUTURE_PRO_BOUNDARY.md)

Short version:

- **OSS forever**: local single-user workflows (all current core features).
- **Potential Pro (later)**: hosted/team capabilities such as SSO/SAML, shared workspaces, org-level policy, audit logs, and managed cloud sync.

## Contributing

PRs and issues are welcome. Focus areas:

- UX speed and terminal ergonomics
- reliability across Jira/Confluence API edge cases
- keyboard flow consistency
- docs and onboarding quality

Contribution guidelines:

- [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- [`SECURITY.md`](./SECURITY.md)

## License

Apache-2.0. See [`LICENSE`](./LICENSE).
