import { tools } from '@brydio/app';
import type { BryEvent } from '@brydio/ui';
import { useState } from '@brydio/app/preact';

import type { Issue, Label, Module, Sprint, State, View } from '../../model/schemas.ts';
import { DEFAULT_ISSUE_VIEW, type IssueLayout, type IssueViewState } from '../issues/issue-controls.tsx';
import { IssueCollection } from '../issues/issue-collection.tsx';

const LAYOUTS = new Set<IssueLayout>(['list', 'kanban', 'calendar', 'gantt', 'spreadsheet']);
const MAX_SAVED_TEXT = 20_000;

function objectOf(raw: string) {
  if (raw.length > MAX_SAVED_TEXT) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function decodeView(view: Pick<View, 'filters' | 'display'>): IssueViewState {
  const filters = objectOf(view.filters);
  const display = objectOf(view.display);
  const layout = typeof display.layout === 'string' && LAYOUTS.has(display.layout as IssueLayout) ? display.layout as IssueLayout : DEFAULT_ISSUE_VIEW.layout;

  return {
    ...DEFAULT_ISSUE_VIEW,
    ...display,
    layout,
    filters: { ...filters, projectId: undefined },
    properties: Array.isArray(display.properties) ? display.properties.filter(one => typeof one === 'string').slice(0, 12) as IssueViewState['properties'] : DEFAULT_ISSUE_VIEW.properties,
    sort: display.sort && typeof display.sort === 'object' ? display.sort as IssueViewState['sort'] : DEFAULT_ISSUE_VIEW.sort,
  };
}

export function encodeView(view: IssueViewState) {
  const { filters, ...display } = view;

  return { filters: JSON.stringify(filters), display: JSON.stringify(display) };
}

export function Views({ projectId, projectName, issues, labels, states, sprints, modules, views, refresh, selectedViewId }: {
  projectId: string;
  projectName: string;
  issues: readonly Issue[];
  labels: readonly Label[];
  states: readonly State[];
  sprints: readonly Sprint[];
  modules: readonly Module[];
  views: readonly View[];
  refresh: () => Promise<void>;
  selectedViewId?: string;
}) {
  const [selected, setSelected] = useState<string | null>(selectedViewId ?? null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const saved = views.find(one => one.id === selected);

  if (saved) {
    return (
      <SavedView
        key={saved.id}
        saved={saved}
        projectId={projectId}
        projectName={projectName}
        issues={issues}
        labels={labels}
        states={states}
        sprints={sprints}
        modules={modules}
        refresh={refresh}
        onBack={() => setSelected(null)}
      />
    );
  }

  const create = async () => {
    if (!name.trim()) return;
    const encoded = encodeView(DEFAULT_ISSUE_VIEW);
    setError(null);
    try {
      await tools.call('create_view', {
        name: name.trim(), project: projectId, ...encoded, shared: false,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setName(''); setDescription('');
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="4">
      <bry-heading level={1} text="Views" />
      {selectedViewId && !saved && <bry-alert tone="warn" title="That view is unavailable" description="It may have been deleted or belongs to another project." />}
      {error && <bry-alert tone="danger" title="Couldn’t update views" description={error} />}
      <bry-card padding="3">
        <bry-grid columns="3" gap="2">
          <bry-input label="View name" value={name} onChange={(event: BryEvent<{ value: string }>) => setName(event.detail.value)} />
          <bry-input label="View description" value={description} onChange={(event: BryEvent<{ value: string }>) => setDescription(event.detail.value)} />
          <bry-button label="Save new view" variant="primary" disabled={!name.trim()} onPress={() => void create()} />
        </bry-grid>
      </bry-card>
      {views.length === 0 ? <bry-text tone="muted" text="No saved views yet." /> : views.map(view => (
        <bry-list-row key={view.id} title={view.name} description={view.description ?? undefined} meta={view.shared ? 'Shared' : 'Private'} pressable onPress={() => setSelected(view.id)} />
      ))}
    </bry-stack>
  );
}

function SavedView({ saved, projectId, projectName, issues, labels, states, sprints, modules, refresh, onBack }: {
  saved: View;
  projectId: string;
  projectName: string;
  issues: readonly Issue[];
  labels: readonly Label[];
  states: readonly State[];
  sprints: readonly Sprint[];
  modules: readonly Module[];
  refresh: () => Promise<void>;
  onBack: () => void;
}) {
  const [current, setCurrent] = useState(() => decodeView(saved));
  const [error, setError] = useState<string | null>(null);

  const update = async () => {
    setError(null);
    try {
      await tools.call('update_view', { id: saved.id, version: saved.version, ...encodeView(current) });
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const remove = async () => {
    try {
      await tools.call('delete_view', { id: saved.id, version: saved.version });
      await refresh();
      onBack();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="3">
      <bry-stack direction="row" justify="between" align="center">
        <bry-button label="Back to views" onPress={onBack} />
        <bry-stack direction="row" gap="2">
          <bry-button label="Save view changes" variant="primary" onPress={() => void update()} />
          <bry-button label="Delete view" variant="danger" onPress={() => void remove()} />
        </bry-stack>
      </bry-stack>
      <bry-heading level={1} text={saved.name} />
      {error && <bry-alert tone="danger" title="Couldn’t update this view" description={error} />}
      <IssueCollection
        projectId={projectId}
        projectName={projectName}
        title={saved.name}
        ignoreHostSelection
        initialView={current}
        onViewChange={setCurrent}
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
