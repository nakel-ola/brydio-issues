import { ToolError, tools } from '@brydio/app';
import { mount, useCallback, useEffect, useState } from '@brydio/app/preact';

import { COLUMNS, neighbour, reason, type Issue, type Status } from '../issues.ts';

/**
 * The Issues board (A8-F01, Phase 0).
 *
 * Three columns, To do, Doing and Done, each a stack of cards. A card shows
 * the issue's title and moves it one column left or right. "New issue" adds
 * one to To do. Phase 0 has no text box, so a new issue is called "New
 * issue" until the assistant, or a later version of this screen, renames it.
 *
 * Every write goes through the generated tools, and Brydio asks the person
 * first. Phase 0 has no live updates either, so the board reads the list
 * again after each write that worked, and after a write that failed because
 * somebody else got there first.
 */

function Board() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await tools.call<{ items: Issue[] }>('list_issues', { limit: 200 });

      setIssues(page.items);
      setError(null);
    } catch (failure) {
      setError(`Couldn’t load the issues. ${reason(failure)}`);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const write = async (tool: string, input: Record<string, unknown>, failed: string) => {
    setBusy(true);

    try {
      await tools.call(tool, input);
      await load();
    } catch (failure) {
      setError(`${failed} ${reason(failure)}`);

      // Somebody else changed it: show the board as it is now, so the next
      // press starts from the right version.
      if (failure instanceof ToolError && failure.code === 'stale') await load();
    } finally {
      setBusy(false);
    }
  };

  const move = (issue: Issue, status: Status) =>
    write('update_issue', { id: issue.id, version: issue.version, status }, `Couldn’t move “${issue.title}”.`);

  return (
    <bry-stack gap="4">
      <bry-stack direction="row" justify="between" align="center">
        <bry-heading level={1} text="Issues" />
        <bry-button
          label="New issue"
          variant="primary"
          disabled={busy}
          onPress={() => write('create_issue', { title: 'New issue', status: 'todo' }, 'Couldn’t add an issue.')}
        />
      </bry-stack>
      {error && <bry-text tone="danger" text={error} />}
      {!loaded && <bry-text tone="muted" text="Loading issues…" />}
      <bry-stack direction="row" gap="4" align="start">
        {COLUMNS.map(column => {
          const cards = issues.filter(issue => issue.status === column.status);

          return (
            <bry-stack key={column.status} gap="2">
              <bry-heading level={2} text={`${column.title} (${cards.length})`} />
              {loaded && cards.length === 0 && <bry-text tone="muted" size="sm" text="Nothing here." />}
              {cards.map(issue => {
                const left = neighbour(issue.status, -1);
                const right = neighbour(issue.status, 1);

                return (
                  <bry-card key={issue.id} padding="3">
                    <bry-stack gap="2">
                      <bry-text text={issue.title} />
                      <bry-stack direction="row" gap="2">
                        {left && <bry-button label="←" variant="ghost" size="sm" disabled={busy} onPress={() => move(issue, left)} />}
                        {right && <bry-button label="→" variant="ghost" size="sm" disabled={busy} onPress={() => move(issue, right)} />}
                      </bry-stack>
                    </bry-stack>
                  </bry-card>
                );
              })}
            </bry-stack>
          );
        })}
      </bry-stack>
    </bry-stack>
  );
}

void mount(Board);
