#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { program } from 'commander';
import readline from 'readline';
import { ConfigManager } from './config/config-manager.js';
import { App } from './app.js';

function createReadlineInterface() {
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

async function setupWizard(force: boolean = false) {
  console.log('Sutra - Setup Wizard\n');

  const config = ConfigManager.getConfig();

  if (config.jira && config.confluence && !force) {
    console.log('Configuration already set up.');
    console.log('Run with --force or -f to reconfigure.\n');
    return;
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
        const value = await prompt(rl, 'Site username (e.g., arnavpisces): ');
        site = normalizeSite(value);
        if (!isValidSite(site)) {
          console.log('Invalid site username. Use only letters, numbers, and hyphens.');
        }
      }

      email = (await prompt(rl, 'Email: ')).trim();
      apiToken = (await prompt(rl, 'API Token: ')).trim();
      while (!validateApiToken(apiToken)) {
        apiToken = (await prompt(rl, 'API Token (get a new one from the link above): ')).trim();
      }
    } finally {
      rl.close();
    }

    const jiraBaseUrl = `https://${site}.atlassian.net`;
    const confluenceBaseUrl = `${jiraBaseUrl}/wiki`;

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

    console.log('\n✓ Configuration saved to ~/.sutra/config.json');
    console.log(`  Jira: ${jiraBaseUrl}`);
    console.log(`  Confluence: ${confluenceBaseUrl}`);
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
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
    await setupWizard(options.force);
    process.exit(0);
  });

program
  .command('start', { isDefault: false })
  .description('Start the TUI application')
  .action(() => {
    // Set stdin to raw mode to handle key presses properly
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    // Suppress console output during TUI - it interferes with rendering
    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;
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

    // Handle graceful exit
    process.on('SIGINT', () => {
      clear();
      unmount();
      process.exit(0);
    });

    // Keep the process alive
    waitUntilExit().catch((error) => {
      console.error('App error:', error);
      process.exit(1);
    });
  });

program.parse(process.argv);

// Default action: start the app
if (!process.argv.slice(2).length) {
  // Clear screen and move cursor to home position
  process.stdout.write('\x1B[2J\x1B[H');

  const { unmount, clear } = render(<App />, {
    exitOnCtrlC: false,
    debug: false,         // Ensure updates replace previous output (not append)
    patchConsole: true,   // Intercept console.log to not interfere with Ink output
  });

  process.on('SIGINT', () => {
    clear();
    unmount();
    process.exit(0);
  });
}
