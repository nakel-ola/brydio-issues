import { tools } from '@brydio/app';
import type { BryEvent } from '@brydio/ui';
import { useState } from '@brydio/app/preact';

import type { ProjectPlan, State } from '../../model/schemas.ts';

const DEFAULT_STATES = [
  { name: 'Backlog', group: 'backlog', colour: 'neutral', position: 0 },
  { name: 'To do', group: 'unstarted', colour: 'neutral', position: 1024 },
  { name: 'In progress', group: 'started', colour: 'brand', position: 2048 },
  { name: 'Done', group: 'completed', colour: 'success', position: 3072 },
  { name: 'Cancelled', group: 'cancelled', colour: 'neutral', position: 4096 },
] as const;

const PRIORITY_OPTIONS = ['urgent', 'high', 'medium', 'low', 'none'].map(value => ({
  value,
  label: value[0]!.toUpperCase() + value.slice(1),
}));

const VIEW_OPTIONS = [
  { value: 'list', label: 'List' },
  { value: 'kanban', label: 'Kanban' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'gantt', label: 'Gantt' },
  { value: 'spreadsheet', label: 'Spreadsheet' },
];

export function ProjectSettings({ projectId, states, plan, onChanged }: {
  projectId: string;
  states: readonly State[];
  plan?: ProjectPlan;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perform = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);

    try {
      await work();
      await onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const createDefaults = () => perform(async () => {
    if (states.length) return;

    for (const state of DEFAULT_STATES) await tools.call('create_state', { ...state, project: projectId });
  });

  const savePlan = (fields: Record<string, unknown>) => perform(() =>
    plan
      ? tools.call('update_project_plan', { id: plan.id, version: plan.version, ...fields })
      : tools.call('create_project_plan', {
          project: projectId,
          priority: 'none',
          default_view: 'list',
          estimates: false,
          ...fields,
        })
  );

  return (
    <bry-stack gap="4">
      <bry-stack gap="1">
        <bry-heading level={1} text="Project settings" />
        <bry-text tone="muted" text="Plan fields live here. Project name and members stay in Brydio." />
      </bry-stack>

      {error && <bry-alert tone="danger" title="Couldn’t save settings" description={error} />}

      <bry-card padding="4">
        <bry-stack gap="3">
          <bry-heading level={2} text="Workflow states" />
          {states.length === 0 ? (
            <bry-stack gap="2">
              <bry-text tone="muted" text="Create the standard workflow once, then rename or extend it as your project changes." />
              <bry-button label="Create default states" variant="primary" disabled={busy} onPress={createDefaults} />
            </bry-stack>
          ) : states
            .slice()
            .sort((left, right) => left.position - right.position)
            .map(state => <bry-list-row key={state.id} title={state.name} description={state.group} />)}
        </bry-stack>
      </bry-card>

      <bry-card padding="4">
        <bry-stack gap="3">
          <bry-heading level={2} text="Planning defaults" />
          <bry-select
            label="Priority"
            value={plan?.priority ?? 'none'}
            options={PRIORITY_OPTIONS}
            disabled={busy}
            onChange={(event: BryEvent<{ value: string }>) => void savePlan({ priority: event.detail.value })}
          />
          <bry-select
            label="Default view"
            value={plan?.default_view ?? 'list'}
            options={VIEW_OPTIONS}
            disabled={busy}
            onChange={(event: BryEvent<{ value: string }>) => void savePlan({ default_view: event.detail.value })}
          />
          <bry-switch
            label="Issue estimates"
            checked={Boolean(plan?.estimates)}
            disabled={busy}
            onChange={(event: BryEvent<{ checked: boolean }>) => void savePlan({ estimates: event.detail.checked })}
          />
        </bry-stack>
      </bry-card>
    </bry-stack>
  );
}
