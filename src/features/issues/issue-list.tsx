import type { Issue, State } from '../../model/schemas.ts';
import { issueIdentifier } from '../../model/issues.ts';

const ROW_WINDOW = 200;

export function IssueList({ issues, states, projectName, onOpen }: {
  issues: readonly Issue[];
  states: readonly State[];
  projectName: string;
  onOpen: (id: string) => void;
}) {
  const ordered = [...states].sort((left, right) => left.position - right.position);
  const known = new Set(ordered.map(one => one.id));
  const groups = [
    ...ordered.map(state => ({ id: state.id, name: state.name, issues: issues.filter(issue => issue.state === state.id) })),
    { id: 'none', name: 'No state', issues: issues.filter(issue => !issue.state || !known.has(issue.state)) },
  ].filter(group => group.issues.length > 0);

  return (
    <bry-stack gap="3">
      {groups.map(group => (
        <bry-card key={group.id} padding="2">
          <bry-stack gap="1">
            <bry-stack direction="row" justify="between" align="center">
              <bry-heading level={3} text={group.name} />
              <bry-badge text={String(group.issues.length)} tone="neutral" />
            </bry-stack>
            {group.issues
              .slice()
              .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
              .slice(0, ROW_WINDOW)
              .map(issue => (
                <bry-list-row
                  key={issue.id}
                  title={issue.title}
                  description={issueIdentifier(issue, projectName)}
                  meta={issue.priority && issue.priority !== 'none' ? issue.priority : undefined}
                  pressable
                  onPress={() => onOpen(issue.id)}
                >
                  <bry-text tone="muted" text={issueIdentifier(issue, projectName)} />
                </bry-list-row>
              ))}
            {group.issues.length > ROW_WINDOW && (
              <bry-text tone="muted" text={`Showing the first ${ROW_WINDOW} of ${group.issues.length} issues in this state.`} />
            )}
          </bry-stack>
        </bry-card>
      ))}
    </bry-stack>
  );
}
