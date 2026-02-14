#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { program } from 'commander';
import readline from 'readline';
import { ConfigManager } from './config/config-manager.js';
import { App } from './app.js';
import { JiraClient } from './api/jira-client.js';
import { ConfluenceClient } from './api/confluence-client.js';

const GREEN = '\x1b[32m';
const BOLD_GREEN = '\x1b[1;32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

function promptHidden(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    const anyRl = rl as any;
    const originalWrite = anyRl._writeToOutput?.bind(rl);

    // Temporarily mute only token character echo while still rendering the prompt label.
    anyRl._writeToOutput = (stringToWrite: string) => {
      if (stringToWrite.startsWith(question)) {
        process.stdout.write(stringToWrite);
        return;
      }
      if (stringToWrite.includes('\n')) {
        process.stdout.write('\n');
      }
    };

    rl.question(question, (answer) => {
      anyRl._writeToOutput = originalWrite;
      resolve(answer);
    });
  });
}

function startApp() {
  // Set stdin to raw mode to handle key presses properly
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  // Suppress console output during TUI - it interferes with rendering
  console.error = () => { };
  console.log = () => { };

  // Global error handlers to prevent crashes
  process.on('uncaughtException', () => {
    // Silently handle - logging would corrupt TUI
  });
  process.on('unhandledRejection', () => {
    // Silently handle - logging would corrupt TUI
  });

  // Clear screen and move cursor to home position
  process.stdout.write('\x1B[2J\x1B[H');

  const { unmount, waitUntilExit, clear } = render(<App />, {
    exitOnCtrlC: false,
    debug: false,         // Ensure updates replace previous output (not append)
    patchConsole: true,   // Intercept console.log to not interfere with Ink output
  });

  process.on('SIGINT', () => {
    clear();
    unmount();
    process.exit(0);
  });

  waitUntilExit().catch(() => {
    process.exit(1);
  });
}

async function setupWizard(force: boolean = false): Promise<boolean> {
  console.log('Sutra - Setup Wizard\n');

  const config = ConfigManager.getConfig();

  if (config.jira && config.confluence && !force) {
    console.log('Configuration already set up.');
    console.log('Run with --force or -f to reconfigure.\n');
    return true;
  }

  const validateApiToken = (token: string): boolean => {
    // Connect App tokens start with ATCTT3x - these won't work with basic auth
    if (token.startsWith('ATCTT')) {
      console.log('\n⚠️  Warning: This looks like a Connect App token (starts with ATCTT).');
      console.log('   You need a regular API token from:');
      console.log('   https://id.atlassian.com/manage-profile/security/api-tokens\n');
      return false;
    }
    return true;
  };

  const normalizeSite = (input: string): string => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return '';
    const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
    const host = withoutProtocol.split('/')[0];
    return host.replace(/\.atlassian\.net$/, '');
  };

  const isValidSite = (site: string): boolean =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(site);

  try {
    console.log('--- Atlassian Cloud Configuration ---');
    console.log('Sutra will derive Jira and Confluence base URLs from your site username.');
    console.log('Go to: https://id.atlassian.com/manage-profile/security/api-tokens');
    console.log('Click "Create API token" and copy the generated token.\n');

    const rl = createReadlineInterface();
    let site = '';
    let email = '';
    let apiToken = '';

    try {
      while (!isValidSite(site)) {
        const value = await prompt(rl, 'Site username (e.g., your-team): ');
        site = normalizeSite(value);
        if (!isValidSite(site)) {
          console.log('Invalid site username. Use only letters, numbers, and hyphens.');
        }
      }

      email = (await prompt(rl, 'Email: ')).trim();
      apiToken = (await promptHidden(rl, 'API Token (input hidden): ')).trim();
      while (!validateApiToken(apiToken)) {
        apiToken = (await promptHidden(rl, 'API Token (input hidden): ')).trim();
      }
    } finally {
      rl.close();
    }

    const jiraBaseUrl = `https://${site}.atlassian.net`;
    const confluenceBaseUrl = `${jiraBaseUrl}/wiki`;

    const jiraClient = new JiraClient({
      baseUrl: jiraBaseUrl,
      email,
      apiToken,
    });
    const confluenceClient = new ConfluenceClient({
      baseUrl: confluenceBaseUrl,
      email,
      apiToken,
    });

    const validationErrors: string[] = [];
    try {
      await jiraClient.getMyself();
    } catch (err) {
      validationErrors.push(`Jira: ${err instanceof Error ? err.message : 'Validation failed'}`);
    }
    try {
      await confluenceClient.getSpaces(1);
    } catch (err) {
      validationErrors.push(`Confluence: ${err instanceof Error ? err.message : 'Validation failed'}`);
    }

    if (validationErrors.length > 0) {
      console.log(`\n${RED}✗ Configuration validation failed:${RESET}`);
      for (const issue of validationErrors) {
        console.log(`  - ${issue}`);
      }
      console.log('\nFix credentials and run: sutra setup --force\n');
      return false;
    }

    ConfigManager.setJiraConfig({
      baseUrl: jiraBaseUrl,
      email,
      apiToken,
    });
    ConfigManager.setConfluenceConfig({
      baseUrl: confluenceBaseUrl,
      email,
      apiToken,
    });

    console.log(`\n${BOLD_GREEN}✓✓✓ Setup successful${RESET}`);
    console.log(`${GREEN}✓ Configuration saved to ~/.sutra/config.json${RESET}`);
    console.log(`${GREEN}✓ Credentials verified with Jira and Confluence${RESET}`);
    console.log(`${GREEN}✓ Jira: ${jiraBaseUrl}${RESET}`);
    console.log(`${GREEN}✓ Confluence: ${confluenceBaseUrl}${RESET}`);
    return true;
  } catch (error) {
    console.error('Setup failed:', error);
    return false;
  }
}

program
  .name('sutra')
  .description('Terminal TUI for Jira tickets and Confluence docs')
  .version('1.0.0');

program
  .command('setup', { isDefault: false })
  .description('Configure Jira and Confluence credentials')
  .option('-f, --force', 'Force reconfiguration even if already set up')
  .action(async (options) => {
    const success = await setupWizard(options.force);
    if (!success) {
      process.exit(1);
    }
    console.log(`\n${BOLD_GREEN}✓ Launching Sutra control panels...${RESET}`);
    startApp();
  });

program
  .command('start', { isDefault: false })
  .description('Start the TUI application')
  .action(() => {
    startApp();
  });

program.parse(process.argv);

// Default action: start the app
if (!process.argv.slice(2).length) {
  startApp();
}
