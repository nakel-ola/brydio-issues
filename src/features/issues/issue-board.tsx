import type { BryEvent } from '@brydio/ui';
import { useBoard } from '@brydio/app/preact';

import type { Issue, State } from '../../model/schemas.ts';
import { issueIdentifier } from '../../model/issues.ts';

interface Move {
  state: string;
  rank: number;
}

export function IssueBoard({ issues, states, projectName, onOpen, onMove }: {
  issues: readonly Issue[];
  states: readonly State[];
  projectName: string;
  onOpen: (id: string) => void;
  onMove: (issue: Issue, move: Move) => Promise<boolean>;
}) {
  const keys = useBoard<string, string>();
  const ordered = [...states].sort((left, right) => left.position - right.position);

  const move = async (event: BryEvent<{ card: string; from: string; to: string; position: number }>) => {
    const read = keys.read(event);

    if (!read) return keys.refuse(event);
    const issue = issues.find(one => one.id === read.card);

    if (!issue) return keys.refuse(event);

    const others = issues
      .filter(one => one.id !== issue.id && one.state === read.to)
      .slice()
      .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER));
    const at = Math.max(0, Math.min(read.position, others.length));
    const rankOf = (one: Issue | undefined) => typeof one?.rank === 'number' ? one.rank : undefined;
    const before = rankOf(others[at - 1]);
    const after = rankOf(others[at]);
    const rank = before === undefined
      ? after === undefined ? 1024 : after - 1024
      : after === undefined ? before + 1024 : (before + after) / 2;

    if (!(await onMove(issue, { state: read.to, rank }))) keys.refuse(event);
  };

  return (
    <bry-board label="Issues" cardSize="lg" onMove={move}>
      {ordered.map(state => {
        const cards = issues
          .filter(issue => issue.state === state.id)
          .slice()
          .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER));

        return (
          <bry-board-column
            key={state.id}
            ref={keys.column(state.id)}
            title={state.name}
            count={cards.length}
            empty="Nothing here."
          >
            {cards.map(issue => (
              <bry-card key={issue.id} ref={keys.card(issue.id)} padding="3" pressable onPress={() => onOpen(issue.id)}>
                <bry-stack gap="2">
                  <bry-text text={issue.title} />
                  <bry-stack direction="row" justify="between" align="center">
                    <bry-text tone="muted" text={issueIdentifier(issue, projectName)} />
                    {issue.priority && issue.priority !== 'none' && <bry-badge text={issue.priority} tone="neutral" />}
                  </bry-stack>
                </bry-stack>
              </bry-card>
            ))}
          </bry-board-column>
        );
      })}
    </bry-board>
  );
}
