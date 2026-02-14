import Conf from 'conf';
import { Config, ConfigSchema, JiraConfig, ConfluenceConfig } from './types.js';

const confSchema = {
  jira: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string' },
      email: { type: 'string' },
      apiToken: { type: 'string' },
    },
  },
  confluence: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string' },
      email: { type: 'string' },
      apiToken: { type: 'string' },
    },
  },
} as const;

const config = new Conf<Config>({
  projectName: 'sutra',
  schema: confSchema,
});

// Legacy config used before renaming from ticket-tui.
const legacyConfig = new Conf<Config>({
  projectName: 'ticket-tui',
  schema: confSchema,
});

export class ConfigManager {
  static getConfig(): Config {
    const current = ConfigSchema.parse(config.store);

    // One-time migration: carry forward existing user setup from legacy project name.
    if (!current.jira && !current.confluence) {
      const legacy = ConfigSchema.parse(legacyConfig.store);
      if (legacy.jira || legacy.confluence) {
        config.store = legacy as any;
        return ConfigSchema.parse(config.store);
      }
    }

    return current;
  }

  static setJiraConfig(jiraConfig: JiraConfig): void {
    config.set('jira', jiraConfig);
  }

  static setConfluenceConfig(confluenceConfig: ConfluenceConfig): void {
    config.set('confluence', confluenceConfig);
  }

  static getJiraConfig(): JiraConfig | undefined {
    const cfg = this.getConfig();
    return cfg.jira;
  }

  static getConfluenceConfig(): ConfluenceConfig | undefined {
    const cfg = this.getConfig();
    return cfg.confluence;
  }

  static isConfigured(): boolean {
    const cfg = this.getConfig();
    return !!(cfg.jira && cfg.confluence);
  }

  static clear(): void {
    config.clear();
  }
}
