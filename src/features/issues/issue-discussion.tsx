import { tools } from '@brydio/app';
import type { BryEvent } from '@brydio/ui';
import { useMembers, useState } from '@brydio/app/preact';

import type { Activity, Comment, Issue, Reaction } from '../../model/schemas.ts';

const clean = (value: string) => value.replace(/<[^>]*>/g, '').trim();

export function IssueActivity({ activity }: { activity: readonly Activity[] }) {
  const people = useMembers(activity.map(one => one.actor));

  return (
    <bry-stack gap="2">
      {activity.length === 0 ? <bry-text tone="muted" text="No activity yet." /> : activity.map(one => (
        <bry-list-row
          key={one.id}
          title={one.action}
          description={one.detail ?? undefined}
          meta={one.actor ? people.get(one.actor)?.name ?? 'Workspace member' : 'Plan'}
        />
      ))}
    </bry-stack>
  );
}

export function IssueDiscussion({ issue, comments, reactions, onRefresh }: {
  issue: Issue;
  comments: readonly Comment[];
  reactions: readonly Reaction[];
  onRefresh: () => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [editing, setEditing] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authors = useMembers(comments.map(one => one.author ?? one.createdBy));
  const counts = new Map<string, number>();

  for (const reaction of reactions) counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);

  const submit = async (raw = body) => {
    const text = clean(raw);

    if (!text) return;
    setBusy(true);
    setError(null);

    try {
      if (editing) await tools.call('update_comment', { id: editing.id, version: editing.version, body: text, edited: true });
      else await tools.call('create_comment', { issue: issue.id, project: issue.project, body: text, ...(parent ? { parent } : {}) });
      setBody('');
      setParent(null);
      setEditing(null);
      await onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (comment: Comment) => {
    setBusy(true);
    setError(null);

    try {
      await tools.call('delete_comment', { id: comment.id, version: comment.version });
      await onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const react = async (emoji: string) => {
    setBusy(true);
    setError(null);

    try {
      await tools.call('toggle_issue_signal', { project: issue.project, issue: issue.id, action: 'react', emoji });
      await onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const roots = comments.filter(one => !one.parent);
  const replies = (id: string) => comments.filter(one => one.parent === id);
  const card = (comment: Comment, reply = false) => (
    <bry-card key={comment.id} padding="2">
      <bry-stack gap="1">
        <bry-stack direction="row" justify="between" align="center">
          <bry-text text={`${reply ? 'Reply · ' : ''}${authors.get(comment.author ?? comment.createdBy ?? '')?.name ?? 'Workspace member'}`} />
          {comment.edited && <bry-badge text="edited" tone="neutral" />}
        </bry-stack>
        <bry-markdown text={comment.body} />
        <bry-stack direction="row" gap="1">
          {!reply && <bry-button label="Reply" size="sm" disabled={busy} onPress={() => { setParent(comment.id); setEditing(null); setBody(''); }} />}
          <bry-button label="Edit comment" size="sm" disabled={busy} onPress={() => { setEditing(comment); setParent(null); setBody(comment.body); }} />
          <bry-button label="Delete comment" size="sm" disabled={busy} onPress={() => void remove(comment)} />
        </bry-stack>
      </bry-stack>
    </bry-card>
  );

  return (
    <bry-stack gap="3">
      {error && <bry-alert tone="danger" title="Couldn’t update the discussion" description={error} />}
      <bry-stack direction="row" gap="1" align="center" wrap>
        {['👍', '❤️', '🎉', '👀'].map(emoji => (
          <bry-button key={emoji} label={`${emoji} ${counts.get(emoji) ?? 0}`} disabled={busy} onPress={() => void react(emoji)} />
        ))}
      </bry-stack>
      <bry-card padding="3">
        <bry-stack gap="2">
          {(parent || editing) && (
            <bry-alert title={editing ? 'Editing comment' : 'Writing a reply'} description={editing ? undefined : `Replying to ${parent}`}>
              <bry-button label="Cancel reply" onPress={() => { setParent(null); setEditing(null); setBody(''); }} />
            </bry-alert>
          )}
          <bry-textarea
            label={editing ? 'Edit comment' : parent ? 'Reply' : 'Comment'}
            value={body}
            placeholder="Write a comment…"
            disabled={busy}
            onChange={(event: BryEvent<{ value: string }>) => setBody(event.detail.value)}
          />
          <bry-button label={editing ? 'Save comment' : parent ? 'Add reply' : 'Add comment'} variant="primary" disabled={busy || !clean(body)} onPress={() => void submit()} />
        </bry-stack>
      </bry-card>
      {roots.length === 0 ? <bry-text tone="muted" text="No comments yet." /> : roots.map(comment => (
        <bry-stack key={comment.id} gap="1">
          {card(comment)}
          {replies(comment.id).map(reply => card(reply, true))}
        </bry-stack>
      ))}
    </bry-stack>
  );
}
