import type { BryEvent } from '@brydio/ui';
import { useState } from '@brydio/app/preact';

import { PRIORITIES, type Issue, type State } from '../../model/schemas.ts';

interface Total {
  id: string;
  label: string;
  value: number;
}

interface TimelinePoint {
  month: string;
  created: number;
  resolved: number;
}

export interface PlanAnalytics {
  state: Total[];
  priority: Total[];
  timeline: TimelinePoint[];
  projectLoad: Array<{ id: string; value: number }>;
  completion: { completed: number; open: number };
}

const title = (value: string) => value[0]!.toUpperCase() + value.slice(1);
const monthOf = (value?: string | null) => /^\d{4}-\d{2}/.exec(value ?? '')?.[0];

export function analyticsOf(issues: readonly Issue[], states: readonly State[], projectId?: string): PlanAnalytics {
  const active = issues.filter(issue => !issue.archived && !issue.draft && (!projectId || issue.project === projectId));
  const availableStates = states.filter(state => !projectId || state.project === projectId);
  const stateCounts = new Map<string, number>();

  for (const issue of active) stateCounts.set(issue.state ?? 'none', (stateCounts.get(issue.state ?? 'none') ?? 0) + 1);

  const state = availableStates.map(one => ({ id: one.id, label: one.name, value: stateCounts.get(one.id) ?? 0 }));
  if ((stateCounts.get('none') ?? 0) > 0) state.push({ id: 'none', label: 'No state', value: stateCounts.get('none')! });

  const priority = PRIORITIES.map(id => ({
    id,
    label: title(id),
    value: active.filter(issue => (issue.priority ?? 'none') === id).length,
  }));
  const months = [...new Set(active.flatMap(issue => [monthOf(issue.createdAt), monthOf(issue.completed)]).filter((one): one is string => Boolean(one)))]
    .sort()
    .slice(-12);
  const timeline = months.map(month => ({
    month,
    created: active.filter(issue => monthOf(issue.createdAt) === month).length,
    resolved: active.filter(issue => monthOf(issue.completed) === month).length,
  }));
  const loads = new Map<string, number>();
  for (const issue of active) if (issue.project) loads.set(issue.project, (loads.get(issue.project) ?? 0) + 1);
  const projectLoad = [...loads].sort(([left], [right]) => left.localeCompare(right)).map(([id, value]) => ({ id, value }));
  const completedIds = new Set(availableStates.filter(one => one.group === 'completed' || one.group === 'cancelled').map(one => one.id));
  const completed = active.filter(issue => Boolean(issue.completed) || Boolean(issue.state && completedIds.has(issue.state))).length;

  return { state, priority, timeline, projectLoad, completion: { completed, open: active.length - completed } };
}

type ProjectNames = ReadonlyMap<string, { name: string }>;

const tableRows = (totals: readonly Total[]) => totals.map(one => ({ id: one.id, cells: [one.label, String(one.value)] }));

export function Analytics({ issues, states, projects }: {
  issues: readonly Issue[];
  states: readonly State[];
  projects: ProjectNames;
}) {
  const [projectId, setProjectId] = useState('all');
  const analytics = analyticsOf(issues, states, projectId === 'all' ? undefined : projectId);
  const projectOptions = [
    { value: 'all', label: 'All projects' },
    ...[...projects].map(([id, project]) => ({ value: id, label: project.name })),
  ];
  const projectTotals = analytics.projectLoad.map(one => ({
    id: one.id,
    label: projects.get(one.id)?.name ?? 'Untitled project',
    value: one.value,
  }));
  const completion = [
    { id: 'completed', label: 'Completed', value: analytics.completion.completed },
    { id: 'open', label: 'Open', value: analytics.completion.open },
  ];
  const totalColumns = [{ key: 'name', heading: 'Name' }, { key: 'issues', heading: 'Issues', align: 'end' as const }];

  return (
    <bry-stack gap="5">
      <bry-stack direction="row" justify="between" align="end" wrap>
        <bry-stack gap="1">
          <bry-heading level={1} text="Analytics" />
          <bry-text tone="muted" text="Workload, flow, and completion across Plan." />
        </bry-stack>
        <bry-select
          label="Project"
          value={projectId}
          options={projectOptions}
          onChange={(event: BryEvent<{ value: string }>) => setProjectId(event.detail.value)}
        />
      </bry-stack>

      <bry-grid columns="2" gap="4">
        <bry-card padding="3">
          <bry-stack gap="3">
            <bry-chart kind="bar" label="Issues by state" categories={analytics.state.map(one => one.label)} series={[{ name: 'Issues', values: analytics.state.map(one => one.value) }]} empty="No issue states yet." />
            <bry-data-table label="State totals" columns={totalColumns} rows={tableRows(analytics.state)} perPage={20} empty="No issue states yet." />
          </bry-stack>
        </bry-card>
        <bry-card padding="3">
          <bry-stack gap="3">
            <bry-chart kind="bar" label="Issues by priority" categories={analytics.priority.map(one => one.label)} series={[{ name: 'Issues', values: analytics.priority.map(one => one.value) }]} empty="No priorities yet." />
            <bry-data-table label="Priority totals" columns={totalColumns} rows={tableRows(analytics.priority)} perPage={20} empty="No priorities yet." />
          </bry-stack>
        </bry-card>
      </bry-grid>

      <bry-card padding="3">
        <bry-stack gap="3">
          <bry-chart
            kind="line"
            label="Created and resolved"
            categories={analytics.timeline.map(one => one.month)}
            series={[
              { name: 'Created', values: analytics.timeline.map(one => one.created) },
              { name: 'Resolved', values: analytics.timeline.map(one => one.resolved) },
            ]}
            empty="No dated work yet."
          />
          <bry-data-table
            label="Created and resolved totals"
            columns={[{ key: 'month', heading: 'Month' }, { key: 'created', heading: 'Created', align: 'end' }, { key: 'resolved', heading: 'Resolved', align: 'end' }]}
            rows={analytics.timeline.map(one => ({ id: one.month, cells: [one.month, String(one.created), String(one.resolved)] }))}
            perPage={20}
            empty="No dated work yet."
          />
        </bry-stack>
      </bry-card>

      <bry-grid columns="2" gap="4">
        <bry-card padding="3">
          <bry-stack gap="3">
            <bry-chart kind="bar" label="Project load" categories={projectTotals.map(one => one.label)} series={[{ name: 'Issues', values: projectTotals.map(one => one.value) }]} empty="No project work yet." />
            <bry-data-table label="Project load" columns={totalColumns} rows={tableRows(projectTotals)} perPage={20} empty="No project work yet." />
          </bry-stack>
        </bry-card>
        <bry-card padding="3">
          <bry-stack gap="3">
            <bry-chart kind="pie" label="Completion mix" categories={completion.map(one => one.label)} series={[{ name: 'Issues', values: completion.map(one => one.value) }]} empty="No issues yet." />
            <bry-data-table label="Completion totals" columns={totalColumns} rows={tableRows(completion)} perPage={20} empty="No issues yet." />
          </bry-stack>
        </bry-card>
      </bry-grid>
    </bry-stack>
  );
}
