import { ApiClient, ApiClientConfig } from './client.js';
import { readFileSync } from 'fs';
import { basename } from 'path';

export interface JiraIssue {
  key: string;
  id: string;
  fields: {
    summary: string;
    description: any;
    parent?: {
      id?: string;
      key?: string;
      fields?: {
        summary?: string;
      };
    };
    status: {
      name: string;
      id: string;
    };
    comment?: {
      comments: Array<{
        id: string;
        author: {
          displayName: string;
          accountId?: string;
        };
        created: string;
        body: any;
      }>;
      total?: number;
    };
    attachment?: JiraAttachment[];
    [key: string]: any;
  };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: {
    name: string;
    statusCategory?: {
      key: string;
    };
  };
  fields?: Record<string, JiraTransitionField>;
}

export interface JiraTransitionField {
  required?: boolean;
  name?: string;
  key?: string;
  hasDefaultValue?: boolean;
  operations?: string[];
  schema?: {
    type?: string;
    system?: string;
    custom?: string;
    customId?: number;
    items?: string;
  };
  allowedValues?: Array<Record<string, any>>;
  defaultValue?: any;
}

export interface JiraEditMetaResponse {
  fields?: Record<string, JiraTransitionField>;
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
}

export interface JiraPriority {
  id: string;
  name: string;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface JiraComment {
  body: any;
}

export interface JiraAttachment {
  id: string;
  filename: string;
  size: number;
  mimeType?: string;
  content?: string;
  thumbnail?: string;
  created?: string;
  author?: {
    displayName: string;
    accountId?: string;
  };
}

function escapeJqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export class JiraClient {
  private apiClient: ApiClient;

  constructor(config: ApiClientConfig) {
    this.apiClient = new ApiClient(config);
  }

  async getIssue(key: string): Promise<JiraIssue> {
    const expand = 'changelog,changelog.histories';
    const fields = 'summary,description,parent,project,status,comment,attachment,issuetype,priority,labels,assignee,reporter,created,updated,duedate';
    return this.apiClient.get<JiraIssue>(
      `/rest/api/3/issue/${key}?expand=${expand}&fields=${fields}`
    );
  }

  async updateIssue(
    key: string,
    fields: { summary?: string; description?: any; priority?: { id: string } | null }
  ): Promise<void> {
    await this.apiClient.put(`/rest/api/3/issue/${key}`, { fields });
  }

  async getTransitions(key: string): Promise<JiraTransition[]> {
    const response = await this.apiClient.get<{ transitions: JiraTransition[] }>(
      `/rest/api/3/issue/${key}/transitions?expand=transitions.fields`
    );
    return response.transitions;
  }

  async getTransitionById(key: string, transitionId: string): Promise<JiraTransition | null> {
    const response = await this.apiClient.get<{ transitions: JiraTransition[] }>(
      `/rest/api/3/issue/${key}/transitions?expand=transitions.fields&transitionId=${encodeURIComponent(transitionId)}`
    );
    const transitions = Array.isArray(response.transitions) ? response.transitions : [];
    return transitions.find((transition) => String(transition.id) === String(transitionId)) || null;
  }

  async getEditMetaFields(key: string): Promise<Record<string, JiraTransitionField>> {
    const response = await this.apiClient.get<JiraEditMetaResponse>(
      `/rest/api/3/issue/${key}/editmeta`
    );
    return response.fields || {};
  }

  async transitionIssue(
    key: string,
    transitionId: string,
    fields?: Record<string, any>
  ): Promise<void> {
    const body: Record<string, any> = {
      transition: { id: transitionId },
    };
    if (fields && Object.keys(fields).length > 0) {
      body.fields = fields;
    }
    await this.apiClient.post(`/rest/api/3/issue/${key}/transitions`, {
      ...body,
    });
  }

  async assignIssueToUser(key: string, accountId: string): Promise<void> {
    await this.apiClient.put(`/rest/api/3/issue/${key}/assignee`, { accountId });
  }

  async assignIssueToMe(key: string): Promise<void> {
    const me = await this.getMyself();
    await this.assignIssueToUser(key, me.accountId);
  }

  async addComment(key: string, body: any): Promise<void> {
    await this.apiClient.post(`/rest/api/3/issue/${key}/comment`, { body });
  }

  async updateComment(issueKey: string, commentId: string, body: any): Promise<void> {
    await this.apiClient.put(`/rest/api/3/issue/${issueKey}/comment/${commentId}`, { body });
  }

  async getComments(issueKey: string, startAt: number = 0, maxResults: number = 100): Promise<{ comments: JiraComment[]; total: number }> {
    const res = await this.apiClient.get<any>(
      `/rest/api/3/issue/${issueKey}/comment?startAt=${startAt}&maxResults=${maxResults}`
    );
    return { comments: res.comments || [], total: res.total || 0 };
  }

  async getMyself(): Promise<{ accountId: string; displayName: string }> {
    return this.apiClient.get('/rest/api/3/myself');
  }

  async getIssueCount(jql: string): Promise<number> {
    const encodedJql = encodeURIComponent(jql);
    const fields = encodeURIComponent('id');

    // Exact count path for modern Jira Cloud.
    // Use cursor pagination via nextPageToken; startAt is not reliable on /search/jql.
    let nextPageToken: string | null = null;
    let counted = 0;
    let pageGuard = 0;

    try {
      while (pageGuard < 200) {
        const tokenPart: string = nextPageToken
          ? `&nextPageToken=${encodeURIComponent(nextPageToken)}`
          : '';
        const page: any = await this.apiClient.get<any>(
          `/rest/api/3/search/jql?jql=${encodedJql}&maxResults=5000&fields=${fields}${tokenPart}`
        );

        const issues = Array.isArray(page?.issues) ? page.issues : [];
        counted += issues.length;

        const incomingToken: string = typeof page?.nextPageToken === 'string' ? page.nextPageToken : '';
        const isLast = page?.isLast === true || !incomingToken || issues.length === 0;

        if (isLast) {
          return counted;
        }

        // Defensive guard for bad cursor responses.
        if (incomingToken === nextPageToken) {
          return counted;
        }

        nextPageToken = incomingToken;
        pageGuard += 1;
      }
    } catch {
      // Continue to other count strategies.
    }

    // Fast fallback where approximate endpoint exists.
    try {
      const approximate = await this.apiClient.post<any>('/rest/api/3/search/approximate-count', { jql });
      if (typeof approximate?.count === 'number' && Number.isFinite(approximate.count)) {
        return Math.max(0, Math.trunc(approximate.count));
      }
    } catch {
      // Continue to final fallback.
    }

    // Final fallback for tenants where /search/jql is unavailable.
    try {
      const legacy = await this.apiClient.get<any>(
        `/rest/api/3/search?jql=${encodedJql}&maxResults=0&fields=id`
      );
      return typeof legacy?.total === 'number' ? legacy.total : counted;
    } catch {
      return counted;
    }
  }

  async getAssignedTicketCounts(): Promise<{ open: number; total: number }> {
    const jql = 'assignee = currentUser() ORDER BY updated DESC';
    const pageSize = 100;
    const closedRegex = /(closed|complete|completed|cancelled|canceled)/i;

    let startAt = 0;
    let total = 0;
    let open = 0;
    let pageGuard = 0;

    while (pageGuard < 400) {
      const page = await this.searchIssues(jql, pageSize, startAt);
      const issues = Array.isArray(page.issues) ? page.issues : [];
      if (issues.length === 0) break;

      total += issues.length;
      for (const issue of issues) {
        const statusName = String(issue?.fields?.status?.name || '');
        if (!closedRegex.test(statusName)) {
          open += 1;
        }
      }

      startAt += issues.length;
      pageGuard += 1;

      if (typeof page.total === 'number' && startAt >= page.total) break;
      if (issues.length < pageSize) break;
    }

    return { open, total };
  }

  async searchIssues(jql: string, maxResults: number = 50, startAt: number = 0): Promise<JiraSearchResult> {
    const fields = encodeURIComponent('summary,status,description,created,issuetype,priority');
    const encodedJql = encodeURIComponent(jql);

    // Prefer enhanced JQL search API with cursor-backed pagination metadata.
    // Use startAt for TUI paging and infer total when API does not provide it.
    try {
      const enhanced = await this.apiClient.get<any>(
        `/rest/api/3/search/jql?jql=${encodedJql}&startAt=${startAt}&maxResults=${maxResults}&fields=${fields}`
      );

      const issues = Array.isArray(enhanced?.issues) ? enhanced.issues : [];
      const hasNext = enhanced?.isLast === false || Boolean(enhanced?.nextPageToken);
      const total = typeof enhanced?.total === 'number'
        ? enhanced.total
        : (hasNext ? startAt + issues.length + 1 : startAt + issues.length);

      return { issues, total };
    } catch {
      // Fallback for older Jira tenants.
      const fallback = await this.apiClient.post<any>(
        '/rest/api/3/search/jql',
        {
          jql,
          startAt,
          maxResults,
          fields: ['summary', 'status', 'description', 'created', 'issuetype', 'priority'],
          expand: 'names'
        }
      );

      const issues = Array.isArray(fallback?.issues) ? fallback.issues : [];
      const total = typeof fallback?.total === 'number'
        ? fallback.total
        : startAt + issues.length;

      return { issues, total };
    }
  }

  async getProjects(): Promise<{ id: string, key: string, name: string }[]> {
    const res = await this.apiClient.get<{ values: any[] }>('/rest/api/3/project/search?maxResults=1000');
    return res.values.map(p => ({
      id: p.id,
      key: p.key,
      name: p.name
    }));
  }

  async searchProjects(query: string): Promise<{ id: string, key: string, name: string }[]> {
    const res = await this.apiClient.get<{ values: any[] }>(`/rest/api/3/project/search?query=${encodeURIComponent(query)}`);
    return res.values.map(p => ({
      id: p.id,
      key: p.key,
      name: p.name
    }));
  }

  async getCreateMeta(projectKey: string): Promise<{ id: string, name: string }[]> {
    // Prefer the dedicated v3 endpoint for project issue types.
    // Fallback to legacy createmeta response shape for compatibility.
    try {
      const modern = await this.apiClient.get<any>(
        `/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`
      );

      const issueTypes =
        modern?.issueTypes ||
        modern?.values ||
        modern?.results ||
        modern?.issuetypes ||
        [];

      if (Array.isArray(issueTypes)) {
        return issueTypes
          .map((t: any) => ({ id: String(t.id || ''), name: String(t.name || '') }))
          .filter((t: { id: string; name: string }) => t.id && t.name);
      }
    } catch {
      // Continue to legacy endpoint.
    }

    const legacy = await this.apiClient.get<any>(
      `/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projectKey)}&expand=projects.issuetypes.fields`
    );

    if (legacy?.projects?.length > 0 && Array.isArray(legacy.projects[0].issuetypes)) {
      return legacy.projects[0].issuetypes
        .map((t: any) => ({ id: String(t.id || ''), name: String(t.name || '') }))
        .filter((t: { id: string; name: string }) => t.id && t.name);
    }

    return [];
  }

  async searchEpics(projectKey: string, query: string, maxResults: number = 35): Promise<JiraIssue[]> {
    const trimmedQuery = query.trim();
    const clauses = [
      `project = "${escapeJqlString(projectKey)}"`,
      'issuetype = Epic',
    ];

    if (trimmedQuery) {
      clauses.push(`summary ~ "${escapeJqlString(trimmedQuery)}*"`);
    }

    const jql = `${clauses.join(' AND ')} ORDER BY updated DESC`;
    const result = await this.searchIssues(jql, maxResults, 0);
    return result.issues;
  }

  async searchParentIssues(projectKey: string, query: string, maxResults: number = 35): Promise<JiraIssue[]> {
    const trimmedQuery = query.trim();
    const clauses = [
      `project = "${escapeJqlString(projectKey)}"`,
      'parent IS EMPTY',
    ];

    if (trimmedQuery) {
      clauses.push(`summary ~ "${escapeJqlString(trimmedQuery)}*"`);
    }

    const jql = `${clauses.join(' AND ')} ORDER BY updated DESC`;
    const result = await this.searchIssues(jql, maxResults, 0);
    return result.issues;
  }

  async getPriorities(): Promise<JiraPriority[]> {
    try {
      const modern = await this.apiClient.get<any>('/rest/api/3/priority/search?maxResults=200');
      const values = modern?.values || modern?.results || modern?.priorities || [];
      if (Array.isArray(values)) {
        return values
          .map((p: any) => ({ id: String(p.id || ''), name: String(p.name || '') }))
          .filter((p: JiraPriority) => p.id && p.name);
      }
    } catch {
      // Continue to fallback endpoint.
    }

    const legacy = await this.apiClient.get<any>('/rest/api/3/priority');
    if (Array.isArray(legacy)) {
      return legacy
        .map((p: any) => ({ id: String(p.id || ''), name: String(p.name || '') }))
        .filter((p: JiraPriority) => p.id && p.name);
    }

    return [];
  }

  async searchUsers(query: string, maxResults: number = 10): Promise<JiraUser[]> {
    const normalized = query.trim();
    if (!normalized) return [];

    const limit = Math.max(1, Math.min(50, maxResults));
    const encodedQuery = encodeURIComponent(normalized);

    const normalizeUsers = (payload: any): JiraUser[] => {
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.users)
          ? payload.users
          : [];

      const deduped = new Map<string, JiraUser>();
      for (const user of list) {
        const accountId = String(user?.accountId || '').trim();
        const displayName = String(user?.displayName || '').trim();
        if (!accountId || !displayName) continue;
        if (deduped.has(accountId)) continue;
        deduped.set(accountId, {
          accountId,
          displayName,
          emailAddress: typeof user?.emailAddress === 'string' ? user.emailAddress : undefined,
        });
      }
      return [...deduped.values()].slice(0, limit);
    };

    try {
      const primary = await this.apiClient.get<any>(
        `/rest/api/3/user/search?query=${encodedQuery}&maxResults=${limit}`
      );
      const users = normalizeUsers(primary);
      if (users.length > 0) return users;
    } catch {
      // Fallback to other Jira Cloud user search endpoints.
    }

    try {
      const picker = await this.apiClient.get<any>(
        `/rest/api/3/user/picker?query=${encodedQuery}&maxResults=${limit}`
      );
      const users = normalizeUsers(picker);
      if (users.length > 0) return users;
    } catch {
      // Continue to final fallback.
    }

    try {
      const assignable = await this.apiClient.get<any>(
        `/rest/api/3/user/assignable/search?query=${encodedQuery}&maxResults=${limit}`
      );
      return normalizeUsers(assignable);
    } catch {
      return [];
    }
  }

  async createIssue(
    projectKey: string,
    issueTypeId: string,
    summary: string,
    description: string,
    priorityId?: string,
    parentKey?: string
  ): Promise<JiraIssue> {
    const issueFields: any = {
      project: { key: projectKey },
      issuetype: { id: issueTypeId },
      summary: summary,
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: description
              }
            ]
          }
        ]
      }
    };

    if (priorityId) {
      issueFields.priority = { id: priorityId };
    }

    if (parentKey) {
      issueFields.parent = { key: parentKey };
    }

    const body = {
      fields: issueFields
    };
    return this.apiClient.post<JiraIssue>('/rest/api/3/issue', body);
  }

  async downloadAttachment(attachmentId: string): Promise<Buffer> {
    return this.apiClient.getBuffer(`/rest/api/3/attachment/content/${attachmentId}`);
  }

  async uploadAttachment(issueKey: string, filePath: string): Promise<void> {
    const form = new FormData();
    const fileBuffer = readFileSync(filePath);
    const blob = new Blob([fileBuffer]);
    form.append('file', blob, basename(filePath));

    await this.apiClient.postFormData(`/rest/api/3/issue/${issueKey}/attachments`, form, {
      headers: {
        'X-Atlassian-Token': 'no-check',
      },
    });
  }
}
