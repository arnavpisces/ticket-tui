import { te } from '../theme/te.js';

export function getJiraStatusColor(status?: string): string {
  if (!status) return te.muted;
  const s = status.toLowerCase();
  if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return te.success;
  if (s.includes('in progress') || s.includes('doing')) return te.accentAlt;
  if (s.includes('review') || s.includes('qa') || s.includes('testing')) return te.warning;
  if (s.includes('blocked')) return te.danger;
  if (s.includes('to do') || s.includes('open') || s.includes('backlog')) return te.info;
  return te.fg;
}

export function getJiraTypeColor(type?: string): string {
  if (!type) return te.muted;
  const t = type.toLowerCase();
  if (t.includes('bug')) return te.danger;
  if (t.includes('task')) return te.info;
  if (t.includes('story')) return te.success;
  if (t.includes('epic')) return te.accentAlt;
  if (t.includes('sub-task') || t.includes('subtask')) return te.muted;
  return te.fg;
}

export function getJiraPriorityColor(priority?: string): string {
  if (!priority) return te.muted;
  const p = priority.toLowerCase();
  if (p.includes('blocker') || p.includes('critical') || p.includes('highest')) return te.danger;
  if (p.includes('high')) return te.warning;
  if (p.includes('medium')) return te.info;
  if (p.includes('low') || p.includes('lowest')) return te.success;
  return te.fg;
}
