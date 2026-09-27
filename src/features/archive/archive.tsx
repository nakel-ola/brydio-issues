import { navigate, tools } from '@brydio/app';
import { useState } from '@brydio/app/preact';

import { issueIdentifier } from '../../model/issues.ts';
import type { Issue } from '../../model/schemas.ts';

export function Archive({ projectName, issues, refresh }: {
  projectName: string;
  issues: readonly Issue[];
  refresh: () => Promise<void>;
}) {
  const archived = issues.filter(one => one.archived);
  const [error, setError] = useState<string | null>(null);

  const restore = async (issue: Issue) => {
    setError(null);
    try {
      await tools.call('update_issue', { id: issue.id, version: issue.version, archived: false });
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="4">
      <bry-heading level={1} text="Archived issues" />
      {error && <bry-alert tone="danger" title="Couldn’t restore the issue" description={error} />}
      {archived.length === 0 ? <bry-empty-state title="Archive is empty" text="Archived project issues will appear here." /> : archived.map(issue => (
        <bry-list-row key={issue.id} title={issue.title} description={issueIdentifier(issue, projectName)} meta="Archived" pressable onPress={() => void navigate({ kind: 'item', id: issue.id })}>
          <bry-button label="Restore issue" onPress={() => void restore(issue)} />
        </bry-list-row>
      ))}
    </bry-stack>
  );
}
