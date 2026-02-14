# Contributing to sutra

Thanks for contributing.

## Before you start

- Search existing issues and pull requests first.
- For significant changes, open an issue to discuss scope before coding.
- Keep PRs focused and small where possible.

## Local development

```bash
npm install
npm run build
npm start -- setup
npm start
```

## Coding expectations

- Keep keyboard flows consistent across screens.
- Preserve terminal readability (contrast, spacing, stable layout).
- Reuse shared theme tokens instead of hardcoding colors.
- Keep API calls bounded and cache-aware.
- Prefer pragmatic fixes over large refactors unless required.

## Pull request checklist

- [ ] Build passes locally (`npm run build`)
- [ ] New behavior is documented in README or inline help if needed
- [ ] Backward-compatible with existing config/cache data
- [ ] No secrets or local credentials committed

## Commit style

Use clear, imperative commit messages. Example:

- `fix(confluence): correct mouse click row mapping after scroll`
- `feat(jira): add pagination shortcuts in ticket list`

## Reporting bugs

Please include:

- OS + terminal emulator
- Node.js version
- Exact screen/workflow and key sequence
- Expected behavior vs actual behavior
- Screenshots or terminal recording when possible

