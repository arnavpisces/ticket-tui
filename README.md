# sutra

Keyboard-first terminal TUI for Jira tickets and Confluence docs.  
Search, browse, edit, comment, and manage attachments without leaving the terminal.  
Built for day-to-day engineering workflows where speed matters.

[![npm version](https://img.shields.io/npm/v/@arnavpisces/sutra)](https://www.npmjs.com/package/@arnavpisces/sutra)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

## Why This Exists

- Jira + Confluence in one fast terminal workflow.
- Better keyboard ergonomics than constantly context-switching to browser tabs.
- Local-first state: cache, bookmarks, recents, and config stay on your machine.

## Requirements

- Node.js `20+`
- Atlassian Cloud site + API token

## Product Walkthrough

### 1) Browse tickets and open details
![Browse Jira tickets](https://raw.githubusercontent.com/arnavpisces/sutra/main/docs/media/gifs/jira-browse.gif)

### 2) Search Confluence pages
![Search Confluence pages](https://raw.githubusercontent.com/arnavpisces/sutra/main/docs/media/gifs/confluence-search.gif)

### 3) View and find inside Confluence pages
![View Confluence page](https://raw.githubusercontent.com/arnavpisces/sutra/main/docs/media/gifs/confluence-view-find.gif)

## Features

### Jira
- Browse tickets with pagination.
- Search with fuzzy query, quick filters, and JQL.
- View/edit ticket details, comments, status, and attachments.

### Confluence
- Browse recent pages and browse by space.
- Search pages with CQL-backed queries.
- View markdown/mdcat rendering, edit pages, labels, comments, and attachments.

### Shared
- Bookmarks + recent history.
- External editor integration (`$EDITOR`, Cursor/VS Code fallback).
- Persistent local cache via SQLite.
- Open in browser + copy URL shortcuts.

## Install

```bash
npm install -g @arnavpisces/sutra
sutra setup
sutra
```

Setup asks for:
- site username (for example `acme-team`)
- email
- Atlassian API token (hidden input)

Sutra derives Jira/Confluence base URLs and validates credentials before entering control panels.

## Key Shortcuts

- `Tab`: switch Jira/Confluence
- `/`: search in browse and page views
- `Esc`: back to previous screen
- `Ctrl+E`: open external editor (editable views)
- `Ctrl+O`: open in browser
- `Ctrl+Y`: copy URL
- `Ctrl+B`: bookmark

## Contributing

- Issues: https://github.com/arnavpisces/sutra/issues
- Pull requests: https://github.com/arnavpisces/sutra/pulls
- Guidelines: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- Security: [`SECURITY.md`](./SECURITY.md)
- Demo tapes: `docs/media/tapes` (render with `vhs docs/media/tapes/<file>.tape`)

## License

Apache-2.0, © 2026 Arnav Kumar.

Not affiliated with Atlassian.
