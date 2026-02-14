# Sutra - Quick Start Guide

## 🚀 Get Started in 2 Minutes

### 1. Build the Project
```bash
cd sutra
npm install
npm run build
```

### 2. Configure Credentials
```bash
npm start -- setup
```
Follow the prompts to enter:
- Site username (e.g., `your-team`)
- Your email
- API token (input is hidden; get it from https://id.atlassian.com/manage-profile/security/api-tokens)

Sutra derives Jira and Confluence URLs automatically from your site username.
It also validates credentials before entering Jira/Confluence control panels.

### 3. Launch the App
```bash
npm start
```

### 4. Use the CLI

**View a Jira ticket:**
- Start app → Enter ticket key (e.g., `PROJ-123`)
- `r` to refresh
- `Tab` to switch tabs
- `q` to quit

**Search Confluence:**
- Press `Tab` in app
- Enter search query
- Select a page to view
- `e` to edit

## 📖 Documentation Map

| Document | Purpose |
|----------|---------|
| **README.md** | User guide, installation, features |
| **IMPLEMENTATION.md** | Technical architecture, API details |
| **DEVELOPMENT.md** | Developer setup, code patterns, contribution |
| **PROJECT_STATUS.md** | Completion status, metrics, verification |
| **QUICKSTART.md** | This file - get running in 2 minutes |

## 🎯 Common Tasks

### View a Jira Ticket
```bash
npm start
# Type: PROJ-123 (your ticket key)
# Press Enter
```

### Edit a Confluence Page
```bash
npm start
# Press Tab to go to Confluence
# Enter search term
# Select page
# Press e to edit
```

### Reset Configuration
```bash
rm ~/.sutra/config.json
npm start -- setup
```

### Rebuild After Changes
```bash
npm run build
```

## 🛠️ Development Mode

For live reloading during development:
```bash
npm run dev
```

## 📦 What's Included

- ✅ Jira ticket viewer and editor
- ✅ Confluence page search and editor
- ✅ Markdown formatting for both services
- ✅ Tab-based navigation
- ✅ Secure configuration management
- ✅ Type-safe TypeScript codebase

## ❓ Troubleshooting

### "Authentication failed"
- Double-check email and API token
- Ensure API token hasn't expired
- Generate new token at https://id.atlassian.com/manage-profile/security/api-tokens

### "Resource not found"
- Verify ticket key format (e.g., PROJ-123)
- Check that ticket is accessible to your user

### Build fails
```bash
rm -rf dist node_modules
npm install
npm run build
```

## 🔗 Quick Links

- **Setup Guide**: See README.md
- **API Methods**: See IMPLEMENTATION.md → API Integration
- **Component List**: See DEVELOPMENT.md → Adding Features
- **Project Stats**: See PROJECT_STATUS.md

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Switch between Jira/Confluence |
| `q` | Quit application |
| `r` | Refresh current ticket |
| `e` | Edit mode |
| `c` | Add comment |
| `?` | Help/shortcuts |

## 🎓 Next Steps

1. **For Users**:
   - Run setup and start exploring
   - Check README.md for detailed usage

2. **For Developers**:
   - Read DEVELOPMENT.md for code structure
   - Review IMPLEMENTATION.md for architecture
   - Check src/ files for code examples

3. **For Contributors**:
   - See DEVELOPMENT.md → Contributing section
   - Follow code style guidelines
   - Add tests for new features

## 📝 File Structure Quick Reference

```
sutra/
├── src/                    # Source code
│   ├── api/               # API clients
│   ├── components/        # UI components
│   ├── config/            # Configuration
│   ├── formatters/        # Format converters
│   └── ...
├── dist/                  # Compiled output
├── README.md              # User guide
├── IMPLEMENTATION.md      # Tech details
├── DEVELOPMENT.md         # Developer guide
├── PROJECT_STATUS.md      # Project metrics
└── QUICKSTART.md          # This file
```

## ✨ Features Overview

### Jira
- View ticket details with formatting
- See status and comments
- Edit title and description
- Change status via transitions
- Add comments

### Confluence
- Search pages by keyword
- View page content
- Edit pages in markdown
- Automatic format conversion

## 🔐 Security Notes

- API tokens stored in `~/.sutra/config.json`
- File has restrictive permissions (user-only)
- Never commit config file to git
- Consider using keychain in future versions

## 🚀 Deployment

### Local Use
```bash
npm install
npm start
```

### Global Install
```bash
npm link  # Install locally
sutra  # Run from anywhere
```

### npm Registry
```bash
npm publish  # Publish to npm
npm install -g sutra  # Install globally
```

---

**Ready to start?** Run `npm start -- setup` now!

For more details, see the full documentation files listed above.
