import { navigate, tools } from '@brydio/app';
import type { BryEvent } from '@brydio/ui';
import { useState } from '@brydio/app/preact';

import { completedStateIds, completionOf, sprintPhase, type SprintPhase } from '../../model/planning.ts';
import type { Issue, Label, Module, Sprint, State } from '../../model/schemas.ts';
import { IssueCollection } from '../issues/issue-collection.tsx';

const PHASE_ORDER: Record<SprintPhase, number> = { active: 0, upcoming: 1, draft: 2, completed: 3, cancelled: 4 };

export function orderedSprints(sprints: readonly Sprint[], today: string) {
  return sprints.slice().sort((left, right) => {
    const leftPhase = sprintPhase(left, today);
    const rightPhase = sprintPhase(right, today);

    return PHASE_ORDER[leftPhase] - PHASE_ORDER[rightPhase]
      || String(left.start ?? '9999').localeCompare(String(right.start ?? '9999'))
      || left.name.localeCompare(right.name);
  });
}

export function Sprints({ projectId, projectName, issues, labels, states, sprints, modules, selectedSprintId, activeByDefault = false, refresh }: {
  projectId: string;
  projectName: string;
  issues: readonly Issue[];
  labels: readonly Label[];
  states: readonly State[];
  sprints: readonly Sprint[];
  modules: readonly Module[];
  selectedSprintId?: string;
  activeByDefault?: boolean;
  refresh: () => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const ordered = orderedSprints(sprints, today);
  const defaultId = selectedSprintId ?? (activeByDefault ? ordered.find(one => sprintPhase(one, today) === 'active')?.id : undefined);
  const [selected, setSelected] = useState<string | null>(defaultId ?? null);
  const sprint = sprints.find(one => one.id === selected);

  if (sprint) {
    return (
      <SprintDetail
        sprint={sprint}
        projectId={projectId}
        projectName={projectName}
        issues={issues}
        labels={labels}
        states={states}
        sprints={sprints}
        modules={modules}
        today={today}
        refresh={refresh}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <SprintList
      projectId={projectId}
      projectName={projectName}
      issues={issues}
      states={states}
      sprints={ordered}
      today={today}
      selectedMissing={selectedSprintId && !sprints.some(one => one.id === selectedSprintId) ? selectedSprintId : undefined}
      refresh={refresh}
      onOpen={setSelected}
    />
  );
}

function SprintList({ projectId, projectName, issues, states, sprints, today, selectedMissing, refresh, onOpen }: {
  projectId: string;
  projectName: string;
  issues: readonly Issue[];
  states: readonly State[];
  sprints: readonly Sprint[];
  today: string;
  selectedMissing?: string;
  refresh: () => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const completed = completedStateIds(states);

  const create = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await tools.call('create_sprint', {
        name: name.trim(), project: projectId, status: 'draft',
        ...(goal.trim() ? { goal: goal.trim() } : {}), ...(start ? { start } : {}), ...(end ? { end } : {}),
      });
      setName(''); setGoal(''); setStart(''); setEnd(''); setCreating(false);
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="3" align="stretch">
      <bry-stack direction="row" justify="between" align="center" wrap>
        <bry-breadcrumb
          items={[{ id: 'project', label: projectName }, { id: 'sprints', label: 'Sprints' }]}
          onSelect={() => void navigate({ kind: 'project', id: projectId }).catch(() => undefined)}
        />
        <bry-button label="New sprint" icon="add" size="sm" variant="primary" onPress={() => setCreating(true)} />
      </bry-stack>
      <bry-separator />
      {selectedMissing && <bry-alert tone="warn" title="That sprint is unavailable" description="It may have been deleted or belongs to another project." />}
      {error && <bry-alert tone="danger" title="Couldn’t update sprints" description={error} />}
      {creating && (
        <bry-card padding="3">
          <bry-stack gap="2">
            <bry-input label="Sprint name" value={name} onChange={(event: BryEvent<{ value: string }>) => setName(event.detail.value)} />
            <bry-textarea label="Sprint goal" value={goal} onChange={(event: BryEvent<{ value: string }>) => setGoal(event.detail.value)} />
            <bry-grid columns="2" gap="2">
              <bry-date label="Sprint start" value={start || undefined} onChange={(event: BryEvent<{ value: string }>) => setStart(event.detail.value)} />
              <bry-date label="Sprint end" value={end || undefined} onChange={(event: BryEvent<{ value: string }>) => setEnd(event.detail.value)} />
            </bry-grid>
            <bry-stack direction="row" gap="2" justify="end">
              <bry-button label="Cancel" onPress={() => setCreating(false)} />
              <bry-button label="Create sprint" variant="primary" disabled={!name.trim()} onPress={() => void create()} />
            </bry-stack>
          </bry-stack>
        </bry-card>
      )}
      {sprints.length === 0 ? (
        <bry-empty-state title="No sprints yet" text="Create a sprint here or from the Sprint folder in the project sidebar." action="New sprint" onAction={() => setCreating(true)} />
      ) : <bry-stack align="stretch">
        {sprints.map(sprint => {
        const phase = sprintPhase(sprint, today);
        const work = issues.filter(one => one.sprint === sprint.id && !one.archived);
        const progress = completionOf(work, completed);

        return (
          <bry-stack key={sprint.id} gap="1" align="stretch">
              <bry-list-row
                title={sprint.name}
                description={[sprint.start, sprint.end].filter(Boolean).join(' – ') || sprint.goal || 'Dates not set'}
                meta={`${phase} · ${progress.completed}/${progress.total}`}
                pressable
                onPress={() => onOpen(sprint.id)}
              >
                <bry-badge text={phase} tone={phase === 'active' ? 'success' : 'neutral'} />
              </bry-list-row>
              <bry-progress label={`${sprint.name} progress`} value={progress.percent} />
              <bry-separator />
          </bry-stack>
        );
      })}
      </bry-stack>}
    </bry-stack>
  );
}

function SprintDetail({ sprint, projectId, projectName, issues, labels, states, sprints, modules, today, refresh, onBack }: {
  sprint: Sprint;
  projectId: string;
  projectName: string;
  issues: readonly Issue[];
  labels: readonly Label[];
  states: readonly State[];
  sprints: readonly Sprint[];
  modules: readonly Module[];
  today: string;
  refresh: () => Promise<void>;
  onBack: () => void;
}) {
  const assigned = issues.filter(one => one.sprint === sprint.id && !one.archived);
  const available = issues.filter(one => !one.sprint && !one.archived && !one.draft);
  const [issueId, setIssueId] = useState(available[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const completion = completionOf(assigned, completedStateIds(states));

  const setSprint = async (issue: Issue, value: string | null) => {
    setError(null);
    try {
      await tools.call('update_issue', { id: issue.id, version: issue.version, sprint: value });
      setIssueId('');
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="3" align="stretch">
      <bry-stack direction="row" justify="between" align="center">
        <bry-breadcrumb
          items={[
            { id: 'project', label: projectName },
            { id: 'sprints', label: 'Sprints' },
            { id: 'sprint', label: sprint.name },
          ]}
          onSelect={onBack}
        />
        <bry-stack direction="row" gap="2" align="center">
          <bry-badge text={sprintPhase(sprint, today)} tone={sprintPhase(sprint, today) === 'active' ? 'success' : 'neutral'} />
          <bry-button label="Back to sprints" size="sm" onPress={onBack} />
        </bry-stack>
      </bry-stack>
      <bry-separator />
      <bry-stack gap="1">
        <bry-heading level={1} text={sprint.name} />
        {sprint.goal && <bry-text text={sprint.goal} />}
        <bry-text tone="muted" text={[sprint.start, sprint.end].filter(Boolean).join(' – ') || 'Dates not set'} />
      </bry-stack>
      <bry-progress label="Sprint progress" value={completion.percent} />
      <bry-text tone="muted" text={`${completion.completed} of ${completion.total} issues completed`} />
      {error && <bry-alert tone="danger" title="Couldn’t update sprint work" description={error} />}
      <bry-card padding="3">
        <bry-stack gap="2">
          <bry-heading level={3} text="Sprint membership" />
          <bry-stack direction="row" gap="2" align="end">
            <bry-select label="Add existing issue" value={issueId} options={available.map(one => ({ value: one.id, label: one.title }))} onChange={(event: BryEvent<{ value: string }>) => setIssueId(event.detail.value)} />
            <bry-button label="Add to sprint" disabled={!issueId} onPress={() => {
              const issue = issues.find(one => one.id === issueId);
              if (issue) void setSprint(issue, sprint.id);
            }} />
          </bry-stack>
          {assigned.map(issue => (
            <bry-list-row key={issue.id} title={issue.title}>
              <bry-button label="Remove from sprint" onPress={() => void setSprint(issue, null)} />
            </bry-list-row>
          ))}
        </bry-stack>
      </bry-card>
      <IssueCollection
        projectId={projectId}
        projectName={projectName}
        title="Sprint issues"
        scopeSprintId={sprint.id}
        ignoreHostSelection
        issues={issues}
        labels={labels}
        states={states}
        sprints={sprints}
        modules={modules}
        refresh={refresh}
        onConfigureStates={() => undefined}
      />
    </bry-stack>
  );
}
