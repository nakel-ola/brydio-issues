import type { ProjectData } from '../../data/project-data.ts';
import { completionOf, completedStateIds } from '../../model/planning.ts';

type ProjectNames = ReadonlyMap<string, { name: string }>;

const projectIdsOf = (data: ProjectData) => [
  ...new Set([
    ...data.issues.map(one => one.project),
    ...data.states.map(one => one.project),
    ...data.sprints.map(one => one.project),
    ...data.modules.map(one => one.project),
    ...data.plans.map(one => one.project),
  ].filter((one): one is string => typeof one === 'string' && one.length > 0)),
];

export function Home({ data, projects }: { data: ProjectData; projects: ProjectNames }) {
  const completed = completedStateIds(data.states);
  const active = data.issues.filter(one => !one.archived && !one.draft);
  const open = active.filter(one => !one.state || !completed.has(one.state));
  const recent = [...active]
    .sort((left, right) => String(right.updatedAt ?? right.createdAt ?? '').localeCompare(String(left.updatedAt ?? left.createdAt ?? '')))
    .slice(0, 6);
  const projectIds = projectIdsOf(data);

  return (
    <bry-stack gap="5">
      <bry-stack gap="1">
        <bry-heading level={1} text="Home" />
        <bry-text tone="muted" text="A clear view of what is moving across your projects." />
      </bry-stack>

      <bry-grid columns="4" gap="3">
        <Snapshot label="Open issues" value={open.length} />
        <Snapshot label="Assigned issues" value={open.filter(one => one.assignees.length > 0).length} />
        <Snapshot label="Active sprints" value={data.sprints.filter(one => one.status === 'active').length} />
        <Snapshot label="Projects" value={projectIds.length} />
      </bry-grid>

      <bry-stack gap="2">
        <bry-heading level={2} text="Projects" />
        {projectIds.length === 0 ? (
          <bry-empty-state title="No Plan work yet" text="Add List, Sprint, or Sprints to a Brydio project to start planning." />
        ) : projectIds.map(projectId => {
          const issues = active.filter(one => one.project === projectId);
          const stateIds = completedStateIds(data.states.filter(one => one.project === projectId));
          const completion = completionOf(issues, stateIds);
          const name = projects.get(projectId)?.name ?? 'Untitled project';

          return (
            <bry-card key={projectId} padding="3">
              <bry-stack gap="2">
                <bry-list-row title={name} description={`${completion.completed} of ${completion.total} issues completed`} />
                <bry-progress label={`${name} progress`} value={completion.percent} />
              </bry-stack>
            </bry-card>
          );
        })}
      </bry-stack>

      <bry-stack gap="2">
        <bry-heading level={2} text="Recent issues" />
        {recent.length === 0 ? (
          <bry-text tone="muted" text="Nothing has moved yet." />
        ) : recent.map(issue => (
          <bry-list-row
            key={issue.id}
            title={issue.title}
            description={projects.get(issue.project ?? '')?.name ?? 'No project'}
            meta={issue.priority && issue.priority !== 'none' ? issue.priority : undefined}
          />
        ))}
      </bry-stack>
    </bry-stack>
  );
}

function Snapshot({ label, value }: { label: string; value: number }) {
  return (
    <bry-card padding="3">
      <bry-stack gap="1">
        <bry-text tone="muted" text={label} />
        <bry-heading level={2} text={String(value)} />
      </bry-stack>
    </bry-card>
  );
}

export function ProjectOverview({ projectId, projectName, data }: {
  projectId: string;
  projectName: string;
  data: ProjectData;
}) {
  const issues = data.issues.filter(one => one.project === projectId && !one.archived && !one.draft);
  const completion = completionOf(issues, completedStateIds(data.states.filter(one => one.project === projectId)));
  const plan = data.plans.find(one => one.project === projectId);
  const activeSprint = data.sprints.find(one => one.project === projectId && one.status === 'active');

  return (
    <bry-stack gap="4">
      <bry-stack gap="1">
        <bry-heading level={1} text={projectName} />
        <bry-text tone="muted" text="Project overview" />
      </bry-stack>
      <bry-card padding="4">
        <bry-stack gap="2">
          <bry-heading level={2} text={`${completion.percent}% complete`} />
          <bry-progress label="Issue completion" value={completion.percent} />
          <bry-text text={`${completion.completed} of ${completion.total} issues completed`} />
        </bry-stack>
      </bry-card>
      <bry-grid columns="3" gap="3">
        <Snapshot label="Open issues" value={completion.total - completion.completed} />
        <Snapshot label="Modules" value={data.modules.filter(one => one.project === projectId).length} />
        <Snapshot label="Active sprints" value={activeSprint ? 1 : 0} />
      </bry-grid>
      <bry-stack gap="2">
        <bry-heading level={2} text="Plan" />
        <bry-list-row title="Priority" description={plan?.priority ?? 'none'} />
        <bry-list-row title="Target" description={plan?.target ?? 'No target date'} />
        <bry-list-row title="Current sprint" description={activeSprint?.name ?? 'No active sprint'} />
      </bry-stack>
    </bry-stack>
  );
}
