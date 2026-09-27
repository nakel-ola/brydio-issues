import { ToolError, data, navigate, tools } from '@brydio/app';
import { askAbout } from '@brydio/app/ask';
import type { BryEvent } from '@brydio/ui';
import {
  useCallback,
  useLayoutEffect,
  useMemberList,
  useProjects,
  useRef,
  useState,
} from '@brydio/app/preact';

import { WriteQueue } from '../../data/writes.ts';
import { readAll } from '../../data/pages.ts';
import { issueIdentifier } from '../../model/issues.ts';
import type { Issue, Label, Module, Sprint, State } from '../../model/schemas.ts';
import { IssueProperties } from './issue-properties.tsx';

const SAVE_PAUSE = 600;

interface DetailData {
  issue: Issue;
  states: State[];
  labels: Label[];
  sprints: Sprint[];
  modules: Module[];
}

export function IssueDetail({ id, currentProjectId, onBack }: {
  id: string;
  currentProjectId?: string;
  onBack?: () => void;
}) {
  const [loaded, setLoaded] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const queue = useRef(new WriteQueue());
  const issueRef = useRef<Issue | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const members = useMemberList();
  const projects = useProjects([loaded?.issue.project, currentProjectId]);

  const load = useCallback(async () => {
    const issue = await data.get<Issue>('issues', id);
    const project = issue.project ?? undefined;
    const query = project ? { filter: { project } } : {};
    const list = <T,>(collection: string) => readAll<T>((name, page) => data.list<T>(name, page), collection, query);
    const [states, labels, sprints, modules] = await Promise.all([
      list<State>('states'),
      list<Label>('labels'),
      list<Sprint>('sprints'),
      list<Module>('modules'),
    ]);

    issueRef.current = issue;
    setLoaded({ issue, states, labels, sprints, modules });
    setError(null);
  }, [id]);

  useLayoutEffect(() => {
    setLoaded(null);
    void load().catch(failure => setError(failure instanceof Error ? failure.message : String(failure)));

    return () => {
      if (titleTimer.current) clearTimeout(titleTimer.current);
      if (descriptionTimer.current) clearTimeout(descriptionTimer.current);
    };
  }, [load]);

  const save = useCallback((fields: Record<string, unknown>) => {
    if (!issueRef.current || stale) return;

    setSaving(true);
    void queue.current.enqueue(async () => {
      const current = issueRef.current!;
      const updated = await tools.call<Issue>('update_issue', { id: current.id, version: current.version, ...fields });

      issueRef.current = updated;
      setLoaded(previous => previous ? { ...previous, issue: updated } : previous);

      return updated;
    }).catch(failure => {
      if (failure instanceof ToolError && failure.code === 'stale') {
        setStale(true);
        setError('This issue changed. Reload it before saving again.');
      } else {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    }).finally(() => setSaving(false));
  }, [stale]);

  const editNow = (fields: Partial<Issue>) => {
    const issue = issueRef.current;

    if (!issue) return;
    const next = { ...issue, ...fields };

    issueRef.current = next;
    setLoaded(previous => previous ? { ...previous, issue: next } : previous);
  };

  const editTitle = (value: string) => {
    editNow({ title: value });
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      if (value.trim()) save({ title: value.trim() });
    }, SAVE_PAUSE);
  };

  const editDescription = (value: string) => {
    editNow({ description: value });
    if (descriptionTimer.current) clearTimeout(descriptionTimer.current);
    descriptionTimer.current = setTimeout(() => save({ description: value || null }), SAVE_PAUSE);
  };

  const reload = async () => {
    queue.current.reset();
    setStale(false);
    setError(null);
    await load();
  };

  if (!loaded) {
    return error ? (
      <bry-alert tone="danger" title="Couldn’t open this issue" description={error} />
    ) : (
      <bry-stack gap="2">
        <bry-skeleton shape="line" count={2} />
        <bry-skeleton shape="row" count={5} />
      </bry-stack>
    );
  }

  const issue = loaded.issue;
  const projectName = projects.get(issue.project ?? '')?.name ?? 'another project';
  const foreign = Boolean(currentProjectId && issue.project && currentProjectId !== issue.project);

  return (
    <bry-stack gap="4">
      <bry-stack direction="row" justify="between" align="center">
        <bry-button
          label="Back to issues"
          onPress={() => onBack ? onBack() : void navigate({ kind: 'item', id: null }).catch(() => undefined)}
        />
        <bry-button
          label="Ask about this issue"
          onPress={() => void askAbout(
            { collection: 'issues', id: issue.id, title: issue.title },
            `What should happen next on “${issue.title}”?`,
          ).catch(failure => setError(failure instanceof Error ? failure.message : String(failure)))}
        />
      </bry-stack>

      {foreign && <bry-alert tone="warn" title={`This issue belongs to ${projectName}.`} />}
      {error && (
        <bry-alert tone={stale ? 'warn' : 'danger'} title={error}>
          {stale && <bry-button label="Reload issue" onPress={() => void reload()} />}
        </bry-alert>
      )}

      <bry-stack gap="1">
        <bry-text tone="muted" text={issueIdentifier(issue, projectName)} />
        <bry-input
          label="Title"
          value={issue.title}
          required
          disabled={stale}
          onChange={(event: BryEvent<{ value: string }>) => editTitle(event.detail.value)}
        />
      </bry-stack>

      <bry-textarea
        label="Description"
        value={issue.description ?? ''}
        placeholder="Add context, a decision, or acceptance criteria."
        disabled={stale}
        onChange={(event: BryEvent<{ value: string }>) => editDescription(event.detail.value)}
      />

      <IssueProperties
        issue={issue}
        states={loaded.states}
        labels={loaded.labels}
        sprints={loaded.sprints}
        modules={loaded.modules}
        members={members.members}
        disabled={stale || saving}
        onSave={save}
      />
    </bry-stack>
  );
}
