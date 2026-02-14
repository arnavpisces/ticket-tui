import Conf from 'conf';
import { Config, ConfigSchema, JiraConfig, ConfluenceConfig } from './types.js';

const config = new Conf<Config>({
  projectName: 'ticket-tui',
  schema: {
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
  },
});

export class ConfigManager {
  static getConfig(): Config {
    const stored = config.store;
    const result = ConfigSchema.parse(stored);
    return result;
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
