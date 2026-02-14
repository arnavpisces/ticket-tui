#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { program } from 'commander';
import readline from 'readline';
import { ConfigManager } from './config/config-manager.js';
import { JiraConfig, ConfluenceConfig } from './config/types.js';
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
  console.log('Ticket TUI - Setup Wizard\n');

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

  const setupJira = async (): Promise<JiraConfig> => {
    console.log('\n--- Jira Configuration ---');
    console.log('Go to: https://id.atlassian.com/manage-profile/security/api-tokens');
    console.log('Click "Create API token" and copy the generated token.\n');
    console.log('Enter your Jira configuration:');

    const rl = createReadlineInterface();

    try {
      const baseUrl = (await prompt(rl, 'Jira Base URL (e.g., https://yourcompany.atlassian.net): ')).trim();
      const email = (await prompt(rl, 'Email: ')).trim();
      let apiToken = (await prompt(rl, 'API Token: ')).trim();

      while (!validateApiToken(apiToken)) {
        apiToken = (await prompt(rl, 'API Token (get a new one from the link above): ')).trim();
      }

      return { baseUrl, email, apiToken };
    } finally {
      rl.close();
    }
  };

  const setupConfluence = async (): Promise<ConfluenceConfig> => {
    console.log('\n--- Confluence Configuration ---');
    console.log('Enter your Confluence configuration:');

    const rl = createReadlineInterface();

    try {
      const baseUrl = (await prompt(rl, 'Confluence Base URL (e.g., https://yourcompany.atlassian.net/wiki): ')).trim();
      const email = (await prompt(rl, 'Email: ')).trim();
      const apiToken = (await prompt(rl, 'API Token: ')).trim();

      return { baseUrl, email, apiToken };
    } finally {
      rl.close();
    }
  };

  try {
    const jiraConfig = await setupJira();
    ConfigManager.setJiraConfig(jiraConfig);

    const confluenceConfig = await setupConfluence();
    ConfigManager.setConfluenceConfig(confluenceConfig);

    console.log('\n✓ Configuration saved to ~/.ticket-tui/config.json');
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

program
  .name('ticket-tui')
  .description('Terminal UI for Jira and Confluence')
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
