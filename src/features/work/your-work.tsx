import type { BryEvent } from '@brydio/ui';
import { useMemberList, useState } from '@brydio/app/preact';

import type { Issue, State } from '../../model/schemas.ts';

type ProjectNames = ReadonlyMap<string, { name: string }>;

export function YourWork({ issues, states, projects }: {
  issues: readonly Issue[];
  states: readonly State[];
  projects: ProjectNames;
}) {
  const directory = useMemberList();
  const [memberId, setMemberId] = useState('all');
  const complete = new Set(states.filter(one => one.group === 'completed' || one.group === 'cancelled').map(one => one.id));
  const assigned = issues.filter(issue => (
    !issue.archived
    && !issue.draft
    && issue.assignees.length > 0
    && (memberId === 'all' || issue.assignees.includes(memberId))
  ));
  const open = assigned.filter(issue => !issue.completed && (!issue.state || !complete.has(issue.state)));
  const recent = [...assigned]
    .sort((left, right) => String(right.updatedAt ?? right.createdAt ?? '').localeCompare(String(left.updatedAt ?? left.createdAt ?? '')))
    .slice(0, 10);
  const stateName = (issue: Issue) => states.find(one => one.id === issue.state)?.name ?? 'No state';
  const memberNames = (issue: Issue) => issue.assignees
    .map(id => directory.members.find(member => member.id === id)?.name ?? 'Unknown member')
    .join(', ');

  return (
    <bry-stack gap="5">
      <bry-stack direction="row" justify="between" align="end" wrap>
        <bry-stack gap="1">
          <bry-heading level={1} text="Your work" />
          <bry-text tone="muted" text="Assigned work and the latest movement across projects." />
        </bry-stack>
        <bry-select
          label="Assignee"
          value={memberId}
          options={[{ value: 'all', label: 'All assignees' }, ...directory.members.map(member => ({ value: member.id, label: member.name, avatar: member.id }))]}
          onChange={(event: BryEvent<{ value: string }>) => setMemberId(event.detail.value)}
        />
      </bry-stack>

      <bry-grid columns="3" gap="3">
        <Summary label="Open assigned" value={open.length} />
        <Summary label="Due this week" value={open.filter(issue => Boolean(issue.target)).length} />
        <Summary label="Projects" value={new Set(open.map(issue => issue.project).filter(Boolean)).size} />
      </bry-grid>

      <bry-stack gap="2">
        <bry-heading level={2} text="Assigned work" />
        {open.length === 0 ? (
          <bry-empty-state title="No assigned work" text="Open work assigned to this person will appear here." />
        ) : open.slice(0, 100).map(issue => (
          <bry-list-row
            key={issue.id}
            title={issue.title}
            description={`${projects.get(issue.project ?? '')?.name ?? 'No project'} · ${stateName(issue)}`}
            meta={memberNames(issue)}
          />
        ))}
      </bry-stack>

      <bry-stack gap="2">
        <bry-heading level={2} text="Recent work" />
        {recent.length === 0 ? (
          <bry-text tone="muted" text="Nothing assigned has moved yet." />
        ) : recent.map(issue => (
          <bry-list-row
            key={issue.id}
            title={issue.title}
            description={projects.get(issue.project ?? '')?.name ?? 'No project'}
            meta={issue.updatedAt ?? issue.createdAt ?? stateName(issue)}
          />
        ))}
      </bry-stack>
    </bry-stack>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <bry-card padding="3">
      <bry-stack gap="1">
        <bry-text tone="muted" text={label} />
        <bry-heading level={2} text={String(value)} />
      </bry-stack>
    </bry-card>
  );
}
