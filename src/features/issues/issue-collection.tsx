import { ToolError, navigate, tools } from '@brydio/app';
import type { BryEvent } from '@brydio/ui';
import { useHost, useMemberList, useState } from '@brydio/app/preact';

import { filterIssues, sortIssues } from '../../model/issues.ts';
import { nextSequence } from '../../model/planning.ts';
import type { Issue, Label, Module, Sprint, State } from '../../model/schemas.ts';
import { IssueBoard } from './issue-board.tsx';
import { IssueCalendar } from './issue-calendar.tsx';
import { DEFAULT_ISSUE_VIEW, IssueControls, type IssueViewState } from './issue-controls.tsx';
import { IssueDetail } from './issue-detail.tsx';
import { IssueGantt } from './issue-gantt.tsx';
import { IssueList } from './issue-list.tsx';
import { IssueSpreadsheet } from './issue-spreadsheet.tsx';

type CreateMode = 'quick' | 'full';

function selectedItem(selection: unknown): string | null {
  const item = selection as { kind?: unknown; id?: unknown } | null | undefined;

  return item?.kind === 'item' && typeof item.id === 'string' ? item.id : null;
}

export function IssueCollection({ projectId, projectName, issues, labels, states, sprints, modules, refresh, onConfigureStates }: {
  projectId: string;
  projectName: string;
  issues: readonly Issue[];
  labels: readonly Label[];
  states: readonly State[];
  sprints: readonly Sprint[];
  modules: readonly Module[];
  refresh: () => Promise<void>;
  onConfigureStates: () => void;
}) {
  const selected = selectedItem(useHost().selection);
  const members = useMemberList();
  const [view, setView] = useState<IssueViewState>(DEFAULT_ISSUE_VIEW);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState<CreateMode | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stateId, setStateId] = useState('');
  const [priority, setPriority] = useState('none');
  const [target, setTarget] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (selected) {
    return (
      <IssueDetail
        id={selected}
        currentProjectId={projectId}
        onBack={() => void navigate({ kind: 'item', id: null }).catch(() => undefined)}
      />
    );
  }

  const visible = sortIssues(
    filterIssues(issues, { ...view.filters, projectId, archived: false, draft: false }),
    view.sort,
  ).filter(one => view.showSubIssues || !one.parent);
  const defaultState = [...states].sort((left, right) => {
    const wanted = (state: State) => state.group === 'unstarted' ? 0 : state.group === 'backlog' ? 1 : 2;

    return wanted(left) - wanted(right) || left.position - right.position;
  })[0];

  const create = async (value = title) => {
    const trimmed = value.trim();

    const selectedState = states.find(one => one.id === stateId) ?? defaultState;

    if (!trimmed || !selectedState) return;
    setBusy(true);
    setFailed(null);

    try {
      const ranks = visible.filter(one => one.state === selectedState.id).map(one => one.rank).filter((rank): rank is number => typeof rank === 'number');

      await tools.call('create_issue', {
        title: trimmed,
        ...(description.trim() ? { description: description.trim() } : {}),
        project: projectId,
        sequence: nextSequence(issues, projectId),
        state: selectedState.id,
        priority,
        assignees: [],
        labels: [],
        modules: [],
        ...(target ? { target } : {}),
        archived: false,
        draft: false,
        inbox: 'none',
        rank: (ranks.length ? Math.max(...ranks) : 0) + 1024,
      });
      setTitle('');
      setDescription('');
      setStateId('');
      setPriority('none');
      setTarget('');
      setCreating(null);
      await refresh();
    } catch (failure) {
      setFailed(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const move = async (issue: Issue, fields: { state: string; rank: number }) => {
    setBusy(true);
    setFailed(null);

    try {
      await tools.call('update_issue', { id: issue.id, version: issue.version, ...fields });
      await refresh();

      return true;
    } catch (failure) {
      setFailed(failure instanceof Error ? failure.message : String(failure));
      if (failure instanceof ToolError && failure.code === 'stale') await refresh();

      return false;
    } finally {
      setBusy(false);
    }
  };

  const open = (id: string) => void navigate({ kind: 'item', id }).catch(failure => setFailed(failure instanceof Error ? failure.message : String(failure)));
  const bulk = async (action: 'update' | 'archive' | 'delete', fields?: Record<string, unknown>) => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    setFailed(null);

    try {
      await tools.call('bulk_issues', {
        project: projectId,
        action,
        ids: selectedIds.slice(0, 100),
        ...(fields ? { fields: JSON.stringify(fields) } : {}),
      });
      setSelectedIds([]);
      await refresh();
    } catch (failure) {
      setFailed(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const collection = view.layout === 'list' ? (
    <IssueList
      issues={visible}
      states={states}
      sprints={sprints}
      modules={modules}
      projectName={projectName}
      group={view.group}
      showEmpty={view.showEmptyGroups}
      properties={view.properties}
      onOpen={open}
    />
  ) : view.layout === 'kanban' ? (
    <IssueBoard issues={visible} states={states} projectName={projectName} onOpen={open} onMove={move} />
  ) : view.layout === 'calendar' ? (
    <IssueCalendar issues={visible} projectName={projectName} mode={view.calendarMode} onOpen={open} />
  ) : view.layout === 'gantt' ? (
    <IssueGantt issues={visible} projectName={projectName} />
  ) : (
    <IssueSpreadsheet
      issues={visible}
      states={states}
      sprints={sprints}
      modules={modules}
      projectName={projectName}
      properties={view.properties}
      selected={selectedIds}
      onSelect={setSelectedIds}
    />
  );

  return (
    <bry-stack gap="4">
      <bry-stack direction="row" justify="between" align="center">
        <bry-heading level={1} text="Issues" />
        <bry-stack direction="row" gap="2">
          <bry-button label="Quick add" disabled={busy || Boolean(creating) || !defaultState} onPress={() => setCreating('quick')} />
          <bry-button label="New issue" variant="primary" disabled={busy || Boolean(creating) || !defaultState} onPress={() => setCreating('full')} />
        </bry-stack>
      </bry-stack>

      {states.length === 0 && (
        <bry-alert title="Set up the workflow" description="Create states before work starts moving.">
          <bry-button label="Configure states" onPress={onConfigureStates} />
        </bry-alert>
      )}
      {failed && <bry-alert tone="danger" title="Couldn’t update issues" description={failed} />}
      <IssueControls
        value={view}
        states={states}
        labels={labels}
        sprints={sprints}
        modules={modules}
        members={members.members}
        onChange={setView}
        selectedCount={selectedIds.length}
        onSelectVisible={() => setSelectedIds(selectedIds.length === visible.length ? [] : visible.slice(0, 100).map(one => one.id))}
      />
      {selectedIds.length > 0 && (
        <bry-card padding="2">
          <bry-stack direction="row" gap="2" align="center" wrap>
            <bry-text text={`${selectedIds.length} issues selected`} />
            <bry-button label="Set high priority" disabled={busy} onPress={() => void bulk('update', { priority: 'high' })} />
            <bry-button label="Archive selected" disabled={busy} onPress={() => void bulk('archive')} />
            <bry-button label="Delete selected" variant="danger" disabled={busy} onPress={() => void bulk('delete')} />
            <bry-button label="Clear selection" disabled={busy} onPress={() => setSelectedIds([])} />
          </bry-stack>
        </bry-card>
      )}
      {creating && (
        <bry-card padding="3">
          <bry-stack gap="3">
            <bry-input
              label="Title"
              value={title}
              placeholder="What needs doing?"
              required
              disabled={busy}
              onChange={(event: BryEvent<{ value: string }>) => setTitle(event.detail.value)}
              onSubmit={(event: BryEvent<{ value: string }>) => void create(event.detail.value)}
            />
            {creating === 'full' && (
              <>
                <bry-textarea
                  label="Description"
                  value={description}
                  placeholder="Add context or acceptance criteria."
                  disabled={busy}
                  onChange={(event: BryEvent<{ value: string }>) => setDescription(event.detail.value)}
                />
                <bry-grid columns="3" gap="2">
                  <bry-select
                    label="State"
                    value={stateId || defaultState?.id}
                    options={states.slice(0, 50).map(one => ({ value: one.id, label: one.name }))}
                    disabled={busy}
                    onChange={(event: BryEvent<{ value: string }>) => setStateId(event.detail.value)}
                  />
                  <bry-select
                    label="Priority"
                    value={priority}
                    options={['urgent', 'high', 'medium', 'low', 'none'].map(value => ({ value, label: value[0]!.toUpperCase() + value.slice(1) }))}
                    disabled={busy}
                    onChange={(event: BryEvent<{ value: string }>) => setPriority(event.detail.value)}
                  />
                  <bry-date
                    label="Target date"
                    value={target || undefined}
                    disabled={busy}
                    onChange={(event: BryEvent<{ value: string }>) => setTarget(event.detail.value)}
                  />
                </bry-grid>
              </>
            )}
            <bry-stack direction="row" justify="end" gap="2">
              <bry-button label="Cancel" disabled={busy} onPress={() => { setCreating(null); setTitle(''); }} />
              <bry-button label="Add issue" variant="primary" disabled={busy || !title.trim()} onPress={() => void create()} />
            </bry-stack>
          </bry-stack>
        </bry-card>
      )}

      {visible.length === 0 ? (
        <bry-empty-state
          title={issues.length ? 'No matching issues' : 'No issues yet'}
          text={issues.length ? 'Change or clear the current filters.' : 'Capture the first thing this project needs.'}
          action={issues.length ? 'Clear filters' : defaultState ? 'New issue' : undefined}
          onAction={() => issues.length ? setView({ ...view, filters: {} }) : setCreating('full')}
        />
      ) : (
        collection
      )}
    </bry-stack>
  );
}
