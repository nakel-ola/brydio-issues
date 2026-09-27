import type { BryEvent } from '@brydio/ui';

import type { Issue, Label, Module, Sprint, State } from '../../model/schemas.ts';

type Member = { id: string; name: string };

const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'].map(value => ({
  value,
  label: value[0]!.toUpperCase() + value.slice(1),
}));

export function IssueProperties({ issue, states, labels, sprints, modules, members, disabled, onSave }: {
  issue: Issue;
  states: readonly State[];
  labels: readonly Label[];
  sprints: readonly Sprint[];
  modules: readonly Module[];
  members: readonly Member[];
  disabled?: boolean;
  onSave: (fields: Record<string, unknown>) => void;
}) {
  const none = (label: string) => ({ value: 'none', label });

  return (
    <bry-card padding="4">
      <bry-grid columns="2" gap="3">
        <bry-select
          label="State"
          value={issue.state ?? 'none'}
          options={[none('No state'), ...states.slice(0, 49).map(one => ({ value: one.id, label: one.name }))]}
          disabled={disabled}
          onChange={(event: BryEvent<{ value: string }>) => onSave({ state: event.detail.value === 'none' ? null : event.detail.value })}
        />
        <bry-select
          label="Priority"
          value={issue.priority ?? 'none'}
          options={PRIORITIES}
          disabled={disabled}
          onChange={(event: BryEvent<{ value: string }>) => onSave({ priority: event.detail.value })}
        />
        <bry-select
          label="Assignee"
          value={issue.assignees[0] ?? 'none'}
          options={[none('Unassigned'), ...members.slice(0, 49).map(one => ({ value: one.id, label: one.name, avatar: one.id }))]}
          disabled={disabled}
          onChange={(event: BryEvent<{ value: string }>) => onSave({ assignees: event.detail.value === 'none' ? [] : [event.detail.value] })}
        />
        <bry-select
          label="Label"
          value={issue.labels[0] ?? 'none'}
          options={[none('No label'), ...labels.slice(0, 49).map(one => ({ value: one.id, label: one.name }))]}
          disabled={disabled}
          onChange={(event: BryEvent<{ value: string }>) => onSave({ labels: event.detail.value === 'none' ? [] : [event.detail.value] })}
        />
        <bry-select
          label="Sprint"
          value={issue.sprint ?? 'none'}
          options={[none('No sprint'), ...sprints.slice(0, 49).map(one => ({ value: one.id, label: one.name }))]}
          disabled={disabled}
          onChange={(event: BryEvent<{ value: string }>) => onSave({ sprint: event.detail.value === 'none' ? null : event.detail.value })}
        />
        <bry-select
          label="Module"
          value={issue.modules[0] ?? 'none'}
          options={[none('No module'), ...modules.slice(0, 49).map(one => ({ value: one.id, label: one.name }))]}
          disabled={disabled}
          onChange={(event: BryEvent<{ value: string }>) => onSave({ modules: event.detail.value === 'none' ? [] : [event.detail.value] })}
        />
        <bry-date
          label="Target date"
          value={issue.target ?? undefined}
          disabled={disabled}
          onChange={(event: BryEvent<{ value: string }>) => onSave({ target: event.detail.value || null })}
        />
        <bry-input
          label="Estimate"
          value={issue.estimate === null || issue.estimate === undefined ? '' : String(issue.estimate)}
          placeholder="Points"
          disabled={disabled}
          onSubmit={(event: BryEvent<{ value: string }>) => {
            const value = Number(event.detail.value);

            if (event.detail.value.trim() === '') onSave({ estimate: null });
            else if (Number.isFinite(value) && value >= 0) onSave({ estimate: value });
          }}
        />
      </bry-grid>
    </bry-card>
  );
}
