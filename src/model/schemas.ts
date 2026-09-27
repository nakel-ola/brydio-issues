import type { DocumentOf } from '@brydio/manifest';

export const STATE_GROUPS = ['backlog', 'unstarted', 'started', 'completed', 'cancelled'] as const;
export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;
export const SPRINT_STATUSES = ['draft', 'active', 'completed', 'cancelled'] as const;
export const MODULE_STATUSES = ['backlog', 'planned', 'started', 'paused', 'completed', 'cancelled'] as const;

export const ISSUE_SCHEMA = {
  title: 'string', description: 'text?', project: 'project?', sequence: 'number?', state: 'string?',
  priority: { type: PRIORITIES, optional: true, default: 'none' }, assignees: 'string[]', labels: 'string[]', parent: 'string?', sprint: 'string?',
  modules: 'string[]', start: 'date?', target: 'date?', completed: 'date?', archived: 'boolean?',
  draft: 'boolean?', inbox: { type: ['none', 'pending', 'accepted', 'declined', 'snoozed'], optional: true, default: 'none' }, inbox_until: 'date?',
  creator: 'member?', updated_by: 'member?', estimate: 'number?', rank: 'number?', branch: 'string?',
  status: { type: ['todo', 'doing', 'done'], optional: true }, assignee: 'member?', body: 'text?', due: 'date?',
} as const;

export const LABEL_SCHEMA = { name: 'string', colour: 'token', project: 'project?' } as const;
export const STATE_SCHEMA = { name: 'string', group: STATE_GROUPS, colour: 'token', project: 'project', position: 'number' } as const;
export const SPRINT_SCHEMA = { name: 'string', project: 'project', status: SPRINT_STATUSES, start: 'date?', end: 'date?', goal: 'text?' } as const;
export const MODULE_SCHEMA = { name: 'string', project: 'project', status: MODULE_STATUSES, lead: 'member?', start: 'date?', end: 'date?', description: 'text?' } as const;
export const VIEW_SCHEMA = { name: 'string', project: 'project', filters: 'text', display: 'text', shared: 'boolean?' } as const;
export const COMMENT_SCHEMA = { issue: 'string', project: 'project', body: 'text', parent: 'string?', author: 'member?', edited: 'boolean?' } as const;
export const REACTION_SCHEMA = { issue: 'string', project: 'project', comment: 'string?', emoji: 'string', member: 'member' } as const;
export const ATTACHMENT_SCHEMA = { issue: 'string', project: 'project', file_id: 'string', name: 'string', size: 'number?', mime: 'string?' } as const;
export const LINK_SCHEMA = { issue: 'string?', module: 'string?', project: 'project', title: 'string', url: 'string' } as const;
export const RELATION_SCHEMA = { issue: 'string', target: 'string', project: 'project', kind: ['blocks', 'blocked_by', 'relates', 'duplicates', 'duplicated_by'] } as const;
export const SUBSCRIPTION_SCHEMA = { issue: 'string', project: 'project', member: 'member' } as const;
export const VOTE_SCHEMA = { issue: 'string', project: 'project', member: 'member' } as const;
export const ACTIVITY_SCHEMA = { issue: 'string', project: 'project', actor: 'member?', action: 'string', detail: 'text?' } as const;
export const PROJECT_PLAN_SCHEMA = { project: 'project', lead: 'member?', priority: PRIORITIES, start: 'date?', target: 'date?', default_view: ['list', 'kanban', 'calendar', 'gantt', 'spreadsheet'], estimates: 'boolean?' } as const;

export type Issue = DocumentOf<typeof ISSUE_SCHEMA>;
export type Label = DocumentOf<typeof LABEL_SCHEMA>;
export type State = DocumentOf<typeof STATE_SCHEMA>;
export type Sprint = DocumentOf<typeof SPRINT_SCHEMA>;
export type Module = DocumentOf<typeof MODULE_SCHEMA>;
export type View = DocumentOf<typeof VIEW_SCHEMA>;
export type Comment = DocumentOf<typeof COMMENT_SCHEMA>;
export type Reaction = DocumentOf<typeof REACTION_SCHEMA>;
export type Attachment = DocumentOf<typeof ATTACHMENT_SCHEMA>;
export type Link = DocumentOf<typeof LINK_SCHEMA>;
export type Relation = DocumentOf<typeof RELATION_SCHEMA>;
export type Subscription = DocumentOf<typeof SUBSCRIPTION_SCHEMA>;
export type Vote = DocumentOf<typeof VOTE_SCHEMA>;
export type Activity = DocumentOf<typeof ACTIVITY_SCHEMA>;
export type ProjectPlan = DocumentOf<typeof PROJECT_PLAN_SCHEMA>;
