import type { Issue, State } from '../../model/schemas.ts';
import { groupIssues, issueIdentifier, type IssueGroup } from '../../model/issues.ts';
import type { Module, Sprint } from '../../model/schemas.ts';
import type { IssueProperty } from './issue-controls.tsx';

const ROW_WINDOW = 300;

export function IssueList({ issues, states, sprints, modules, projectName, group = 'state', showEmpty = false, properties, onOpen }: {
  issues: readonly Issue[];
  states: readonly State[];
  sprints?: readonly Sprint[];
  modules?: readonly Module[];
  projectName: string;
  group?: IssueGroup;
  showEmpty?: boolean;
  properties?: readonly IssueProperty[];
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

  return (
    <bry-stack gap="3">
      {windows.map(group => (
        <bry-card key={group.id} padding="2">
          <bry-stack gap="1">
            <bry-stack direction="row" justify="between" align="center">
              <bry-heading level={3} text={group.name} />
              <bry-badge text={String(group.issues.length)} tone="neutral" />
            </bry-stack>
            {group.visible.map(issue => (
                <bry-list-row
                  key={issue.id}
                  title={issue.title}
                  description={shown.has('identifier') ? issueIdentifier(issue, projectName) : undefined}
                  meta={shown.has('priority') && issue.priority && issue.priority !== 'none' ? issue.priority : undefined}
                  pressable
                  onPress={() => onOpen(issue.id)}
                >
                  {shown.has('identifier') && <bry-text tone="muted" text={issueIdentifier(issue, projectName)} />}
                </bry-list-row>
              ))}
            {group.visible.length < group.issues.length && (
              <bry-text tone="muted" text={`Showing ${group.visible.length} of ${group.issues.length} issues in this group.`} />
            )}
          </bry-stack>
        </bry-card>
      ))}
    </bry-stack>
  );
}
