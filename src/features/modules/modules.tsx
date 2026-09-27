import { tools } from '@brydio/app';
import type { BryEvent } from '@brydio/ui';
import { useMemberList, useState } from '@brydio/app/preact';

import { completedStateIds, completionOf } from '../../model/planning.ts';
import type { Issue, Label, Link, Module, Sprint, State } from '../../model/schemas.ts';
import { IssueCollection } from '../issues/issue-collection.tsx';

const STATUSES = ['backlog', 'planned', 'started', 'paused', 'completed', 'cancelled'] as const;

export function Modules({ projectId, projectName, issues, labels, links, states, sprints, modules, refresh }: {
  projectId: string;
  projectName: string;
  issues: readonly Issue[];
  labels: readonly Label[];
  links: readonly Link[];
  states: readonly State[];
  sprints: readonly Sprint[];
  modules: readonly Module[];
  refresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Module['status']>('backlog');
  const [error, setError] = useState<string | null>(null);
  const module = modules.find(one => one.id === selected);

  if (module) {
    return (
      <ModuleDetail
        module={module}
        projectId={projectId}
        projectName={projectName}
        issues={issues}
        labels={labels}
        links={links.filter(one => one.module === module.id)}
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
    setError(null);
    try {
      await tools.call('create_module', { name: name.trim(), project: projectId, status });
      setName(''); setStatus('backlog'); setCreating(false);
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const completed = completedStateIds(states);

  return (
    <bry-stack gap="4">
      <bry-stack direction="row" justify="between" align="center">
        <bry-heading level={1} text="Modules" />
        <bry-button label="New module" variant="primary" onPress={() => setCreating(true)} />
      </bry-stack>
      {error && <bry-alert tone="danger" title="Couldn’t update modules" description={error} />}
      {creating && (
        <bry-card padding="3">
          <bry-grid columns="2" gap="2">
            <bry-input label="Module name" value={name} onChange={(event: BryEvent<{ value: string }>) => setName(event.detail.value)} />
            <bry-select label="Module status" value={status} options={STATUSES.map(value => ({ value, label: value[0]!.toUpperCase() + value.slice(1) }))} onChange={(event: BryEvent<{ value: string }>) => setStatus(event.detail.value as Module['status'])} />
          </bry-grid>
          <bry-stack direction="row" gap="2" justify="end">
            <bry-button label="Cancel" onPress={() => setCreating(false)} />
            <bry-button label="Create module" variant="primary" disabled={!name.trim()} onPress={() => void create()} />
          </bry-stack>
        </bry-card>
      )}
      {modules.length === 0 ? (
        <bry-empty-state title="No modules yet" text="Group related project work into a module." action="New module" onAction={() => setCreating(true)} />
      ) : modules.map(one => {
        const work = issues.filter(issue => issue.modules.includes(one.id) && !issue.archived);
        const progress = completionOf(work, completed);

        return (
          <bry-card key={one.id} padding="3" pressable onPress={() => setSelected(one.id)}>
            <bry-stack gap="2">
              <bry-stack direction="row" justify="between" align="center">
                <bry-heading level={3} text={one.name} />
                <bry-badge text={one.status} tone={one.status === 'completed' ? 'success' : 'neutral'} />
              </bry-stack>
              <bry-text tone="muted" text={[one.start, one.end].filter(Boolean).join(' – ') || 'Dates not set'} />
              <bry-progress label={`${one.name} progress`} value={progress.percent} />
              <bry-text tone="muted" text={`${progress.completed} of ${progress.total} issues completed`} />
            </bry-stack>
          </bry-card>
        );
      })}
    </bry-stack>
  );
}

function ModuleDetail({ module, projectId, projectName, issues, labels, links, states, sprints, modules, refresh, onBack }: {
  module: Module;
  projectId: string;
  projectName: string;
  issues: readonly Issue[];
  labels: readonly Label[];
  links: readonly Link[];
  states: readonly State[];
  sprints: readonly Sprint[];
  modules: readonly Module[];
  refresh: () => Promise<void>;
  onBack: () => void;
}) {
  const members = useMemberList();
  const assigned = issues.filter(one => one.modules.includes(module.id) && !one.archived);
  const available = issues.filter(one => !one.modules.includes(module.id) && !one.archived && !one.draft);
  const [issueId, setIssueId] = useState(available[0]?.id ?? '');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const completion = completionOf(assigned, completedStateIds(states));

  const update = async (fields: Record<string, unknown>) => {
    setError(null);
    try {
      await tools.call('update_module', { id: module.id, version: module.version, ...fields });
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const setMembership = async (issue: Issue, add: boolean) => {
    const next = add ? [...new Set([...issue.modules, module.id])] : issue.modules.filter(id => id !== module.id);

    try {
      await tools.call('update_issue', { id: issue.id, version: issue.version, modules: next });
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const addLink = async () => {
    if (!linkTitle.trim() || !/^https?:\/\//i.test(linkUrl.trim())) return;
    try {
      await tools.call('create_link', { module: module.id, project: projectId, title: linkTitle.trim(), url: linkUrl.trim() });
      setLinkTitle(''); setLinkUrl('');
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="4">
      <bry-button label="Back to modules" onPress={onBack} />
      <bry-stack gap="1">
        <bry-heading level={1} text={module.name} />
        {module.description && <bry-text text={module.description} />}
      </bry-stack>
      {error && <bry-alert tone="danger" title="Couldn’t update the module" description={error} />}
      <bry-progress label="Module progress" value={completion.percent} />
      <bry-text tone="muted" text={`${completion.completed} of ${completion.total} issues completed`} />
      <bry-card padding="3">
        <bry-grid columns="2" gap="2">
          <bry-select label="Status" value={module.status} options={STATUSES.map(value => ({ value, label: value[0]!.toUpperCase() + value.slice(1) }))} onChange={(event: BryEvent<{ value: string }>) => void update({ status: event.detail.value })} />
          <bry-select label="Lead" value={module.lead ?? 'none'} options={[{ value: 'none', label: 'No lead' }, ...members.members.map(one => ({ value: one.id, label: one.name }))]} onChange={(event: BryEvent<{ value: string }>) => void update({ lead: event.detail.value === 'none' ? null : event.detail.value })} />
          <bry-date label="Start date" value={module.start ?? undefined} onChange={(event: BryEvent<{ value: string }>) => void update({ start: event.detail.value || null })} />
          <bry-date label="End date" value={module.end ?? undefined} onChange={(event: BryEvent<{ value: string }>) => void update({ end: event.detail.value || null })} />
        </bry-grid>
      </bry-card>
      <bry-card padding="3">
        <bry-stack gap="2">
          <bry-heading level={3} text="Module issues" />
          <bry-stack direction="row" gap="2" align="end">
            <bry-select label="Add existing issue" value={issueId} options={available.map(one => ({ value: one.id, label: one.title }))} onChange={(event: BryEvent<{ value: string }>) => setIssueId(event.detail.value)} />
            <bry-button label="Add to module" disabled={!issueId} onPress={() => { const issue = issues.find(one => one.id === issueId); if (issue) void setMembership(issue, true); }} />
          </bry-stack>
          {assigned.map(issue => <bry-list-row key={issue.id} title={issue.title}><bry-button label="Remove from module" onPress={() => void setMembership(issue, false)} /></bry-list-row>)}
        </bry-stack>
      </bry-card>
      <bry-card padding="3">
        <bry-stack gap="2">
          <bry-heading level={3} text="Module links" />
          <bry-grid columns="3" gap="2">
            <bry-input label="Module link title" value={linkTitle} onChange={(event: BryEvent<{ value: string }>) => setLinkTitle(event.detail.value)} />
            <bry-input label="Module link URL" kind="url" value={linkUrl} onChange={(event: BryEvent<{ value: string }>) => setLinkUrl(event.detail.value)} />
            <bry-button label="Add module link" disabled={!linkTitle.trim() || !/^https?:\/\//i.test(linkUrl.trim())} onPress={() => void addLink()} />
          </bry-grid>
          {links.map(link => <bry-list-row key={link.id} title={link.title} description={link.url}><bry-button label="Delete module link" onPress={() => void tools.call('delete_link', { id: link.id, version: link.version }).then(refresh).catch(failure => setError(failure instanceof Error ? failure.message : String(failure)))} /></bry-list-row>)}
        </bry-stack>
      </bry-card>
      <IssueCollection
        projectId={projectId}
        projectName={projectName}
        title="Module work"
        scopeModuleId={module.id}
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
