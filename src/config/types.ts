import { z } from 'zod';

export const JiraConfigSchema = z.object({
  baseUrl: z.string().url('Invalid Jira URL'),
  email: z.string().email('Invalid email'),
  apiToken: z.string().min(1, 'API token is required'),
});

export const ConfluenceConfigSchema = z.object({
  baseUrl: z.string().url('Invalid Confluence URL'),
  email: z.string().email('Invalid email'),
  apiToken: z.string().min(1, 'API token is required'),
});

export const ConfigSchema = z.object({
  jira: JiraConfigSchema.optional(),
  confluence: ConfluenceConfigSchema.optional(),
  themeName: z.string().min(1).optional(),
});

export type JiraConfig = z.infer<typeof JiraConfigSchema>;
export type ConfluenceConfig = z.infer<typeof ConfluenceConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
