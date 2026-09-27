import type { Issue } from '../../model/schemas.ts';
import { issueIdentifier } from '../../model/issues.ts';
import type { CalendarMode } from './issue-controls.tsx';

const day = (issue: Issue) => issue.target ?? issue.start;

export function IssueCalendar({ issues, projectName, mode, onOpen }: {
  issues: readonly Issue[];
  projectName: string;
  mode: CalendarMode;
  onOpen: (id: string) => void;
}) {
  const dated = issues.filter(issue => day(issue)).slice().sort((left, right) => day(left)!.localeCompare(day(right)!));
  const month = (dated[0] && day(dated[0])) ?? new Date().toISOString().slice(0, 10);

  return (
    <bry-grid columns="2" gap="4">
      <bry-calendar label={mode === 'month' ? 'Issue month' : 'Issue week'} month={month} values={dated.map(issue => day(issue)!)} mode="multiple" disabled />
      <bry-card padding="3">
        <bry-stack gap="2">
          <bry-heading level={3} text={mode === 'month' ? 'Month schedule' : 'Week schedule'} />
          {dated.length === 0 ? (
            <bry-text tone="muted" text="No issues have a start or target date." />
          ) : dated.slice(0, 200).map(issue => (
            <bry-list-row
              key={issue.id}
              title={issue.title}
              description={`${issueIdentifier(issue, projectName)} · ${day(issue)}`}
              meta={issue.target ? 'Target' : 'Start'}
              pressable
              onPress={() => onOpen(issue.id)}
            />
          ))}
        </bry-stack>
      </bry-card>
    </bry-grid>
  );
}
