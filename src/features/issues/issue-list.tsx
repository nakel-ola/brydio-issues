import type { BryEvent } from '@brydio/ui';

import type { Issue, State } from '../../model/schemas.ts';
import { groupIssues, issueIdentifier, type IssueGroup } from '../../model/issues.ts';
import type { Module, Sprint } from '../../model/schemas.ts';
import type { IssueProperty } from './issue-controls.tsx';

const ROW_WINDOW = 300;

export function IssueList({ issues, states, sprints, modules, members = [], projectName, group = 'state', showEmpty = false, properties, selected = [], quickAddStateId, quickAddTitle = '', quickAddBusy = false, onQuickAddTitle, onQuickAddSubmit, onQuickAddCancel, onSelect, onQuickAdd, onOpen }: {
  issues: readonly Issue[];
  states: readonly State[];
  sprints?: readonly Sprint[];
  modules?: readonly Module[];
  members?: readonly { id: string; name: string }[];
  projectName: string;
  group?: IssueGroup;
  showEmpty?: boolean;
  properties?: readonly IssueProperty[];
  selected?: readonly string[];
  quickAddStateId?: string | null;
  quickAddTitle?: string;
  quickAddBusy?: boolean;
  onQuickAddTitle?: (value: string) => void;
  onQuickAddSubmit?: (value: string) => void;
  onQuickAddCancel?: () => void;
  onSelect?: (id: string) => void;
  onQuickAdd?: (stateId?: string) => void;
  onOpen: (id: string) => void;
}) {
  const grouped = groupIssues(issues, group);
  const entries = group === 'state'
    ? [...states].sort((left, right) => left.position - right.position).map(one => [one.id, one.name] as const)
    : group === 'priority'
      ? ['urgent', 'high', 'medium', 'low', 'none'].map(one => [one, one[0]!.toUpperCase() + one.slice(1)] as const)
      : group === 'sprint'
        ? [...(sprints ?? []).map(one => [one.id, one.name] as const), ['none', 'No sprint'] as const]
        : group === 'module'
          ? [...(modules ?? []).map(one => [one.id, one.name] as const), ['none', 'No module'] as const]
          : group === 'none' ? [['all', 'All issues'] as const]
            : [...grouped.keys()].map(key => [key, key === 'unassigned' ? 'Unassigned' : key] as const);
  const known = new Set(entries.map(([id]) => id));
  const groups = [
    ...entries.map(([id, name]) => ({ id, name, issues: grouped.get(id) ?? [] })),
    ...(group === 'state' && (grouped.get('none')?.length ?? 0) > 0 && !known.has('none')
      ? [{ id: 'none', name: 'No state', issues: grouped.get('none') ?? [] }]
      : []),
  ].filter(one => showEmpty || one.issues.length > 0);
  const shown = new Set(properties ?? ['identifier', 'priority']);
  let remaining = ROW_WINDOW;
  const windows = groups.map(group => {
    const sorted = group.issues
      .slice()
      .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER));
    const visible = sorted.slice(0, remaining);

    remaining -= visible.length;

    return { ...group, visible };
  });

  const memberNames = new Map(members.map(one => [one.id, one.name]));

  return (
    <bry-stack gap="4" align="stretch">
      {windows.map(group => (
        <bry-stack key={group.id} variant="section" align="stretch">
            <bry-stack variant="section-header" direction="row" justify="between" align="center">
              <bry-stack direction="row" gap="2" align="center">
                <bry-badge text="" tone={states.find(one => one.id === group.id)?.group === 'completed' ? 'success' : states.find(one => one.id === group.id)?.group === 'started' ? 'brand' : 'neutral'} />
                <bry-heading level={3} variant="label" text={group.name} />
                <bry-text variant="caption" tone="muted" text={String(group.issues.length)} />
              </bry-stack>
              <bry-button label={`Add issue to ${group.name}`} icon="add" hideLabel size="sm" variant="ghost" onPress={() => onQuickAdd?.(group.id === 'none' || group.id === 'all' ? undefined : group.id)} />
            </bry-stack>
            {group.visible.map(issue => (
                <bry-list-row
                  key={issue.id}
                  variant="work"
                  title={issue.title}
                  identifier={shown.has('identifier') ? issueIdentifier(issue, projectName) : undefined}
                  meta={shown.has('priority') && issue.priority && issue.priority !== 'none' ? issue.priority : undefined}
                  selectable
                  checked={selected.includes(issue.id)}
                  pressable
                  onToggle={() => onSelect?.(issue.id)}
                  onPress={() => onOpen(issue.id)}
                >
                  {shown.has('state') && issue.state && <bry-badge text={states.find(one => one.id === issue.state)?.name ?? 'No state'} tone="neutral" />}
                  {shown.has('assignee') && issue.assignees[0] && <bry-avatar name={memberNames.get(issue.assignees[0]) ?? issue.assignees[0]} size="sm" />}
                  <bry-button label="Issue options" icon="more" hideLabel size="sm" variant="ghost" />
                </bry-list-row>
              ))}
            {group.visible.length < group.issues.length && (
              <bry-text tone="muted" text={`Showing ${group.visible.length} of ${group.issues.length} issues in this group.`} />
            )}
            {quickAddStateId === group.id && (
              <bry-stack variant="filter-bar" direction="row" gap="2" align="center">
                <bry-input
                  label="Issue title"
                  value={quickAddTitle}
                  placeholder="Issue title…"
                  disabled={quickAddBusy}
                  onChange={(event: BryEvent<{ value: string }>) => onQuickAddTitle?.(event.detail.value)}
                  onSubmit={(event: BryEvent<{ value: string }>) => onQuickAddSubmit?.(event.detail.value)}
                />
                <bry-text variant="caption" tone="muted" text="Enter to save" />
                <bry-button label="Cancel quick add" icon="close" hideLabel size="sm" variant="ghost" onPress={onQuickAddCancel} />
              </bry-stack>
            )}
            <bry-list-row variant="work" title="New work item" pressable onPress={() => onQuickAdd?.(group.id === 'none' || group.id === 'all' ? undefined : group.id)} />
        </bry-stack>
      ))}
    </bry-stack>
  );
}
