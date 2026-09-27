import { defaultBridge, navigate, tools } from '@brydio/app';
import type { BryEvent } from '@brydio/ui';
import { useLayoutEffect, useState } from '@brydio/app/preact';

import { nextSequence } from '../../model/planning.ts';
import type { Attachment, Issue, Link, Relation } from '../../model/schemas.ts';
import { issueIdentifier } from '../../model/issues.ts';

interface ProjectFile {
  id: string;
  name: string;
  kind: string;
  mimeType?: string;
  size?: number;
}

const fileKind = (kind: string) => ['document', 'spreadsheet', 'presentation', 'pdf', 'image', 'video', 'audio', 'code', 'archive', 'folder'].includes(kind) ? kind : 'other';

export function IssueSubIssues({ issue, issues, projectName, onRefresh }: {
  issue: Issue;
  issues: readonly Issue[];
  projectName: string;
  onRefresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const children = issues.filter(one => one.parent === issue.id && !one.archived);

  const create = async (raw = title) => {
    const value = raw.trim();

    if (!value) return;
    if (!issue.project) {
      setError('This issue is not attached to a project.');
      return;
    }
    setError(null);
    try {
      await tools.call('create_issue', {
        title: value,
        project: issue.project,
        sequence: nextSequence(issues, issue.project),
        state: issue.state,
        priority: 'none',
        assignees: [], labels: [], modules: [], parent: issue.id,
        archived: false, draft: false, inbox: 'none', rank: (children.length + 1) * 1024,
      });
      setTitle('');
      await onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="2">
      {error && <bry-alert tone="danger" title="Couldn’t add the sub-issue" description={error} />}
      <bry-stack direction="row" gap="2" align="end">
        <bry-input label="Sub-issue title" value={title} onChange={(event: BryEvent<{ value: string }>) => setTitle(event.detail.value)} onSubmit={(event: BryEvent<{ value: string }>) => void create(event.detail.value)} />
        <bry-button label="Add sub-issue" variant="primary" disabled={!title.trim()} onPress={() => void create()} />
      </bry-stack>
      {children.length === 0 ? <bry-text tone="muted" text="No sub-issues yet." /> : children.map(child => (
        <bry-list-row key={child.id} title={child.title} description={issueIdentifier(child, projectName)} pressable onPress={() => void navigate({ kind: 'item', id: child.id })} />
      ))}
    </bry-stack>
  );
}

export function IssueRelations({ issue, issues, relations, projectName, onRefresh }: {
  issue: Issue;
  issues: readonly Issue[];
  relations: readonly Relation[];
  projectName: string;
  onRefresh: () => Promise<void>;
}) {
  const candidates = issues.filter(one => one.id !== issue.id && one.project === issue.project && !one.archived);
  const [target, setTarget] = useState(candidates[0]?.id ?? '');
  const [kind, setKind] = useState<'blocks' | 'relates' | 'duplicates'>('relates');
  const [error, setError] = useState<string | null>(null);
  const mine = relations.filter(one => one.issue === issue.id);

  const manage = async (relation?: Relation) => {
    const selected = relation?.target ?? target;

    if (!selected) return;
    const reverse = relation?.kind === 'blocked_by' || relation?.kind === 'duplicated_by';
    const base = relation?.kind === 'blocked_by' ? 'blocks' : relation?.kind === 'duplicated_by' ? 'duplicates' : relation?.kind ?? kind;
    setError(null);
    try {
      await tools.call('manage_relations', {
        project: issue.project,
        issue: reverse ? selected : issue.id,
        target: reverse ? issue.id : selected,
        kind: base,
        ...(relation ? { remove: true } : {}),
      });
      await onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="2">
      {error && <bry-alert tone="danger" title="Couldn’t update relations" description={error} />}
      <bry-grid columns="3" gap="2">
        <bry-select label="Relation" value={kind} options={[
          { value: 'blocks', label: 'Blocks' }, { value: 'relates', label: 'Relates to' }, { value: 'duplicates', label: 'Duplicates' },
        ]} onChange={(event: BryEvent<{ value: string }>) => setKind(event.detail.value as typeof kind)} />
        <bry-select label="Related issue" value={target} options={candidates.map(one => ({ value: one.id, label: `${issueIdentifier(one, projectName)} ${one.title}` }))} onChange={(event: BryEvent<{ value: string }>) => setTarget(event.detail.value)} />
        <bry-button label="Add relation" variant="primary" disabled={!target} onPress={() => void manage()} />
      </bry-grid>
      {mine.length === 0 ? <bry-text tone="muted" text="No relations yet." /> : mine.map(relation => {
        const targetIssue = issues.find(one => one.id === relation.target);

        return (
          <bry-list-row key={relation.id} title={targetIssue?.title ?? 'Unavailable issue'} description={relation.kind} meta={targetIssue ? issueIdentifier(targetIssue, projectName) : undefined}>
            <bry-button label="Remove relation" onPress={() => void manage(relation)} />
          </bry-list-row>
        );
      })}
    </bry-stack>
  );
}

export function IssueAttachments({ issue, attachments, onRefresh }: {
  issue: Issue;
  attachments: readonly Attachment[];
  onRefresh: () => Promise<void>;
}) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [fileId, setFileId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    let active = true;
    void defaultBridge().callApi<ProjectFile[]>('files.list', { projectId: issue.project }, 'files')
      .then(found => { if (active) setFiles(found); })
      .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });

    return () => { active = false; };
  }, [issue.project]);

  const attach = async () => {
    const file = files.find(one => one.id === fileId);

    if (!file) return;
    setError(null);
    try {
      await tools.call('create_attachment', {
        issue: issue.id, project: issue.project, file_id: file.id, name: file.name,
        ...(file.size === undefined ? {} : { size: file.size }), ...(file.mimeType ? { mime: file.mimeType } : {}),
      });
      setFileId('');
      await onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const remove = async (attachment: Attachment) => {
    try {
      await tools.call('delete_attachment', { id: attachment.id, version: attachment.version });
      await onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="2">
      {error && <bry-alert tone="danger" title="Couldn’t update attachments" description={error} />}
      <bry-stack direction="row" gap="2" align="end">
        <bry-select label="Project file" value={fileId} options={files.filter(file => !attachments.some(one => one.file_id === file.id)).map(file => ({ value: file.id, label: file.name }))} onChange={(event: BryEvent<{ value: string }>) => setFileId(event.detail.value)} />
        <bry-button label="Attach project file" variant="primary" disabled={!fileId} onPress={() => void attach()} />
      </bry-stack>
      {attachments.length === 0 ? <bry-text tone="muted" text="No attachments yet." /> : attachments.map(attachment => (
        <bry-attachment
          key={attachment.id}
          name={attachment.name}
          kind={fileKind(attachment.mime?.split('/')[0] ?? '') as 'document'}
          bytes={attachment.size ?? undefined}
          pressable
          removable
          onOpen={() => void navigate({ kind: 'file', id: attachment.file_id })}
          onRemove={() => void remove(attachment)}
        />
      ))}
    </bry-stack>
  );
}

export function IssueExternalLinks({ issue, links, onRefresh }: {
  issue: Issue;
  links: readonly Link[];
  onRefresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState<Link | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim() || !/^https?:\/\//i.test(url.trim())) return;
    setError(null);
    try {
      if (editing) await tools.call('update_link', { id: editing.id, version: editing.version, title: title.trim(), url: url.trim() });
      else await tools.call('create_link', { issue: issue.id, project: issue.project, title: title.trim(), url: url.trim() });
      setTitle(''); setUrl(''); setEditing(null);
      await onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const remove = async (link: Link) => {
    try {
      await tools.call('delete_link', { id: link.id, version: link.version });
      await onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="2">
      {error && <bry-alert tone="danger" title="Couldn’t update links" description={error} />}
      <bry-grid columns="3" gap="2">
        <bry-input label="Link title" value={title} onChange={(event: BryEvent<{ value: string }>) => setTitle(event.detail.value)} />
        <bry-input label="URL" kind="url" value={url} onChange={(event: BryEvent<{ value: string }>) => setUrl(event.detail.value)} />
        <bry-button label={editing ? 'Save link' : 'Add link'} variant="primary" disabled={!title.trim() || !/^https?:\/\//i.test(url.trim())} onPress={() => void save()} />
      </bry-grid>
      {links.length === 0 ? <bry-text tone="muted" text="No links yet." /> : links.map(link => (
        <bry-list-row key={link.id} title={link.title} description={link.url} pressable onPress={() => void navigate({ kind: 'item', id: issue.id })}>
          <bry-button label="Edit link" onPress={() => { setEditing(link); setTitle(link.title); setUrl(link.url); }} />
          <bry-button label="Delete link" onPress={() => void remove(link)} />
        </bry-list-row>
      ))}
    </bry-stack>
  );
}
