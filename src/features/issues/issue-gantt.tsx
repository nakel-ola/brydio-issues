import type { Issue } from '../../model/schemas.ts';
import { issueIdentifier } from '../../model/issues.ts';

const DAY = 86_400_000;

function duration(issue: Issue) {
  if (!issue.start || !issue.target) return '—';

  return `${Math.max(1, Math.ceil((Date.parse(issue.target) - Date.parse(issue.start)) / DAY) + 1)} days`;
}

function progress(issue: Issue) {
  if (issue.completed) return 100;
  if (!issue.start || !issue.target) return 0;
  const now = Date.now();
  const start = Date.parse(issue.start);
  const end = Date.parse(issue.target);

  if (now <= start) return 0;
  if (now >= end || end <= start) return 100;

  return Math.round(((now - start) / (end - start)) * 100);
}

export function IssueGantt({ issues, projectName }: { issues: readonly Issue[]; projectName: string }) {
  const rows = issues.slice().sort((left, right) => String(left.start ?? left.target ?? '9999').localeCompare(String(right.start ?? right.target ?? '9999'))).slice(0, 200);

  return (
    <bry-stack gap="3">
      <bry-data-table
        label="Issue timeline"
        columns={[
          { key: 'issue', heading: 'Issue', sortable: true },
          { key: 'start', heading: 'Start', sortable: true },
          { key: 'target', heading: 'Target', sortable: true },
          { key: 'duration', heading: 'Duration' },
        ]}
        rows={rows.map(issue => ({ id: issue.id, cells: [
          `${issueIdentifier(issue, projectName)} ${issue.title}`, issue.start ?? '—', issue.target ?? '—', duration(issue),
        ] }))}
        perPage={100}
        empty="No issues match this timeline."
      />
      {rows.filter(issue => issue.start || issue.target).map(issue => (
        <bry-progress key={issue.id} label={`${issueIdentifier(issue, projectName)} timeline progress`} value={progress(issue)} />
      ))}
    </bry-stack>
  );
}
