import type { BryEvent } from '@brydio/ui';

import { issueIdentifier } from '../../model/issues.ts';
import type { Issue, Module, Sprint, State } from '../../model/schemas.ts';
import type { IssueProperty } from './issue-controls.tsx';

const name = (items: readonly { id: string; name: string }[], id?: string | null) => items.find(one => one.id === id)?.name ?? '—';

export function IssueSpreadsheet({ issues, states, sprints, modules, projectName, properties, selected, onSelect }: {
  issues: readonly Issue[];
  states: readonly State[];
  sprints: readonly Sprint[];
  modules: readonly Module[];
  projectName: string;
  properties: readonly IssueProperty[];
  selected: readonly string[];
  onSelect: (ids: string[]) => void;
}) {
  const wanted = new Set(properties);
  const optional = [
    { key: 'state', heading: 'State', value: (issue: Issue) => name(states, issue.state) },
    { key: 'priority', heading: 'Priority', value: (issue: Issue) => issue.priority ?? 'none' },
    { key: 'sprint', heading: 'Sprint', value: (issue: Issue) => name(sprints, issue.sprint) },
    { key: 'module', heading: 'Module', value: (issue: Issue) => name(modules, issue.modules[0]) },
    { key: 'start', heading: 'Start', value: (issue: Issue) => issue.start ?? '—' },
    { key: 'target', heading: 'Target', value: (issue: Issue) => issue.target ?? '—' },
    { key: 'estimate', heading: 'Estimate', value: (issue: Issue) => String(issue.estimate ?? '—') },
  ].filter(column => wanted.has(column.key as IssueProperty));
  const columns = [
    { key: 'issue', heading: 'Issue', sortable: true },
    ...optional.map(column => ({ key: column.key, heading: column.heading, sortable: true, hideable: true })),
  ];

  return (
    <bry-data-table
      label="Issue spreadsheet"
      columns={columns}
      rows={issues.slice(0, 500).map(issue => ({
        id: issue.id,
        cells: [`${issueIdentifier(issue, projectName)} ${issue.title}`, ...optional.map(column => column.value(issue))],
      }))}
      selectable
      selected={[...selected]}
      perPage={100}
      empty="No issues match this view."
      onSelect={(event: BryEvent<{ rows: string[] }>) => onSelect(event.detail.rows)}
    />
  );
}
