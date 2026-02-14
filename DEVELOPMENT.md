# Development Guide

## Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn
- A Jira and Confluence Cloud instance with API access

### Initial Setup

```bash
# Clone the repository
git clone <repo-url>
cd ticket-tui

# Install dependencies
npm install

# Build the project
npm run build

# Run the CLI
npm start
```

### Development Workflow

```bash
# Watch mode with hot reload (using tsx)
npm run dev

# Or build and run manually
npm run build
npm start
```

## Project Structure

### Source Organization

```
src/
├── api/              # API client implementations
├── components/       # React/Ink UI components
├── config/          # Configuration management
├── formatters/      # Data format converters
├── hooks/           # Custom React hooks
├── utils/           # Utility functions and classes
├── app.tsx          # Root component
└── index.tsx        # CLI entry point
```

### Adding New Features

#### 1. Adding a New Jira API Method

1. Open `src/api/jira-client.ts`
2. Add method to `JiraClient` class:

```typescript
async myNewMethod(issueKey: string): Promise<any> {
  return this.apiClient.get<any>(`/rest/api/3/issue/${issueKey}/myendpoint`);
}
```

3. Update type definitions if needed
4. Rebuild: `npm run build`

#### 2. Adding a New UI Component

1. Create file in appropriate directory under `src/components/`
2. Import Ink components:

```typescript
import React from 'react';
import { Box, Text } from 'ink';

export function MyComponent({ prop1 }: { prop1: string }) {
  return (
    <Box flexDirection="column" width="100%">
      <Text>{prop1}</Text>
    </Box>
  );
}
```

3. Export from component file
4. Import and use in parent component
5. Rebuild: `npm run build`

#### 3. Adding Error Handling

Custom error classes available in `src/utils/errors.ts`:

```typescript
import { JiraError, AuthenticationError } from './utils/errors';

// Usage
throw new JiraError('Failed to fetch issue');
throw new AuthenticationError('Jira');
```

#### 4. Adding Caching

Use the Cache class from `src/utils/cache.ts`:

```typescript
import { Cache } from './utils/cache';

const cache = new Cache<MyType>(300); // 5 minute TTL

cache.set('key', value);
const cached = cache.get('key'); // null if expired or not found
cache.delete('key');
```

## Type Safety

The project uses strict TypeScript. All external API responses should be typed:

```typescript
interface MyResponse {
  id: string;
  name: string;
}

async function fetchData(): Promise<MyResponse> {
  return this.apiClient.get<MyResponse>('/endpoint');
}
```

## Configuration Management

Access configuration via `ConfigManager`:

```typescript
import { ConfigManager } from './config/config-manager';

// Get current config
const config = ConfigManager.getConfig();

// Get specific service config
const jiraConfig = ConfigManager.getJiraConfig();

// Update config
ConfigManager.setJiraConfig({ /* ... */ });
```

## Testing API Responses

Use the included components with mock data:

```typescript
// For TicketDetail
const mockIssue: JiraIssue = {
  key: 'TEST-1',
  id: '1',
  fields: {
    summary: 'Test ticket',
    description: { version: 1, type: 'doc', content: [] },
    status: { name: 'To Do', id: '1' },
  },
};

<TicketDetail issue={mockIssue} />
```

## Debugging

### Enable Console Logging

Since the app runs in the terminal, use file-based logging:

```typescript
import * as fs from 'fs';

function log(msg: string) {
  fs.appendFileSync('/tmp/ticket-tui.log', `${new Date().toISOString()} - ${msg}\n`);
}

// Usage
log(`Fetching issue: ${key}`);
```

### Inspect Configuration

```bash
cat ~/.ticket-tui/config.json
```

## Building & Publishing

### Local Development

```bash
# Build TypeScript
npm run build

# Test locally
npm link

# Then in any directory:
ticket-tui --version
```

### Publishing to npm

```bash
# Update version in package.json
npm version patch  # or minor/major

# Build
npm run build

# Publish
npm publish

# Clean up local link if you used npm link
npm unlink -g ticket-tui
```

## Common Issues

### Issue: Module not found

**Solution**: Rebuild after adding new imports
```bash
npm run build
```

### Issue: Ink component prop error

**Solution**: Text component only accepts specific props. Use Box wrapper for margins:
```typescript
// ✗ Wrong
<Text marginBottom={1}>Text</Text>

// ✓ Correct
<Box marginBottom={1}>
  <Text>Text</Text>
</Box>
```

### Issue: API authentication fails

**Solution**: Verify API token and email in config:
```bash
cat ~/.ticket-tui/config.json
# Run setup again to update
npm start -- setup
```

### Issue: Tests failing due to missing dependencies

**Solution**: Some libraries need type definitions:
```bash
npm install -D @types/package-name
```

## Code Style

### TypeScript Conventions

- Use `const` for variables (not `let` or `var`)
- Use explicit return types for functions
- Interface/type names start with capital letter
- Private methods/properties use underscore prefix

### React Component Pattern

```typescript
interface Props {
  prop1: string;
  onAction: () => void;
}

export function MyComponent({ prop1, onAction }: Props) {
  const [state, setState] = React.useState('');

  return (
    <Box flexDirection="column">
      <Text>{prop1}</Text>
    </Box>
  );
}
```

### Error Handling

- Always use custom error classes from `src/utils/errors.ts`
- Provide meaningful error messages
- Log errors for debugging

## Performance Tips

### Caching

- Use `useJiraIssue` and `useConfluencePage` hooks for automatic caching
- Clear cache when data updates to avoid stale data

### Rendering

- Limit component re-renders with `React.memo` for static content
- Use `useCallback` for stable function references in props

### API Calls

- Use the built-in retry logic in `ApiClient`
- Implement debouncing for search inputs
- Cache paginated results appropriately

## Resources

- [Ink Documentation](https://github.com/vadimdemedes/ink)
- [Jira Cloud API v3](https://developer.atlassian.com/cloud/jira/rest/v3/)
- [Confluence Cloud API](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Hooks](https://react.dev/reference/react)

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes and build: `npm run build`
3. Test your changes: `npm start`
4. Commit: `git commit -am "Add my feature"`
5. Push: `git push origin feature/my-feature`
6. Create Pull Request

## License

MIT - See LICENSE file for details
