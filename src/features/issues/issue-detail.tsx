import { ToolError, data, navigate, toast, tools } from '@brydio/app';
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
import type { Activity, Attachment, Comment, Issue, Label, Link, Module, Reaction, Relation, Sprint, State, Subscription, Vote } from '../../model/schemas.ts';
import { IssueActivity, IssueDiscussion } from './issue-discussion.tsx';
import { IssueAttachments, IssueExternalLinks, IssueRelations, IssueSubIssues } from './issue-links.tsx';
import { IssueProperties } from './issue-properties.tsx';

const SAVE_PAUSE = 600;

interface DetailData {
  issue: Issue;
  states: State[];
  labels: Label[];
  sprints: Sprint[];
  modules: Module[];
  issues: Issue[];
  activity: Activity[];
  comments: Comment[];
  reactions: Reaction[];
  attachments: Attachment[];
  links: Link[];
  relations: Relation[];
  subscriptions: Subscription[];
  votes: Vote[];
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
  const [prepared, setPrepared] = useState<{ label: string; value: string } | null>(null);
  const [detailTab, setDetailTab] = useState('comments');
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
    const [states, labels, sprints, modules, issues, activity, comments, reactions, attachments, links, relations, subscriptions, votes] = await Promise.all([
      list<State>('states'),
      list<Label>('labels'),
      list<Sprint>('sprints'),
      list<Module>('modules'),
      list<Issue>('issues'),
      list<Activity>('activity'),
      list<Comment>('comments'),
      list<Reaction>('reactions'),
      list<Attachment>('attachments'),
      list<Link>('links'),
      list<Relation>('relations'),
      list<Subscription>('subscriptions'),
      list<Vote>('votes'),
    ]);

    issueRef.current = issue;
    setLoaded({ issue, states, labels, sprints, modules, issues, activity, comments, reactions, attachments, links, relations, subscriptions, votes });
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

  const signal = async (action: 'vote' | 'subscribe') => {
    if (!issueRef.current) return;
    setSaving(true);
    setError(null);

    try {
      await tools.call('toggle_issue_signal', { project: issueRef.current.project, issue: issueRef.current.id, action });
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!issueRef.current) return;
    setSaving(true);
    setError(null);

    try {
      await tools.call('delete_issue', { id: issueRef.current.id, version: issueRef.current.version });
      if (onBack) onBack();
      else await navigate({ kind: 'item', id: null });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
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
        <bry-stack direction="row" gap="1" wrap>
          <bry-button label={`Vote · ${loaded.votes.length}`} disabled={saving} onPress={() => void signal('vote')} />
          <bry-button label={`Subscribe · ${loaded.subscriptions.length}`} disabled={saving} onPress={() => void signal('subscribe')} />
          <bry-button
            label="Ask about this issue"
            onPress={() => void askAbout(
              { collection: 'issues', id: issue.id, title: issue.title },
              `What should happen next on “${issue.title}”?`,
            ).catch(failure => setError(failure instanceof Error ? failure.message : String(failure)))}
          />
        </bry-stack>
      </bry-stack>

      {foreign && <bry-alert tone="warn" title={`This issue belongs to ${projectName}.`} />}
      {error && (
        <bry-alert tone={stale ? 'warn' : 'danger'} title={error}>
          {stale && <bry-button label="Reload issue" onPress={() => void reload()} />}
        </bry-alert>
      )}
      {prepared && (
        <bry-alert title={`${prepared.label} ready`} description="Select the value below to copy it.">
          <bry-input label={prepared.label} value={prepared.value} />
          <bry-button label="Close" onPress={() => setPrepared(null)} />
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

      <bry-stack direction="row" gap="2" wrap>
        <bry-button label="Copy issue link" onPress={() => {
          setPrepared({ label: 'Issue link', value: `brydio://plan/issues/${issue.id}` });
          toast('Issue link ready to copy.');
        }} />
        <bry-button label="Copy branch name" onPress={() => {
          const slug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
          setPrepared({ label: 'Branch name', value: `plan/${issueIdentifier(issue, projectName).toLowerCase()}-${slug}` });
          toast('Branch name ready to copy.');
        }} />
        <bry-button label="Archive issue" disabled={saving || stale} onPress={() => save({ archived: true })} />
        <bry-button label="Delete issue" variant="danger" disabled={saving} onPress={() => void remove()} />
      </bry-stack>

      <bry-tabs
        label="Issue details"
        tabs={[
          { id: 'activity', label: `Activity · ${loaded.activity.length}` },
          { id: 'comments', label: `Comments · ${loaded.comments.length}` },
          { id: 'subissues', label: `Sub-issues · ${loaded.issues.filter(one => one.parent === issue.id).length}` },
          { id: 'relations', label: `Relations · ${loaded.relations.filter(one => one.issue === issue.id).length}` },
          { id: 'attachments', label: `Attachments · ${loaded.attachments.length}` },
          { id: 'links', label: `Links · ${loaded.links.length}` },
        ]}
        value={detailTab}
        onChange={(event: BryEvent<{ id: string }>) => setDetailTab(event.detail.id)}
      >
        <IssueActivity activity={loaded.activity.filter(one => one.issue === issue.id)} />
        <IssueDiscussion issue={issue} comments={loaded.comments.filter(one => one.issue === issue.id)} reactions={loaded.reactions.filter(one => one.issue === issue.id)} onRefresh={load} />
        <IssueSubIssues issue={issue} issues={loaded.issues} projectName={projectName} onRefresh={load} />
        <IssueRelations issue={issue} issues={loaded.issues} relations={loaded.relations} projectName={projectName} onRefresh={load} />
        <IssueAttachments issue={issue} attachments={loaded.attachments.filter(one => one.issue === issue.id)} onRefresh={load} />
        <IssueExternalLinks issue={issue} links={loaded.links.filter(one => one.issue === issue.id)} onRefresh={load} />
      </bry-tabs>
    </bry-stack>
  );
}
