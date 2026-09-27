import type { BryEvent } from '@brydio/ui';

export type WorkspaceSection = 'home' | 'your-work' | 'analytics' | 'views';
export type ProjectSection = 'issues' | 'modules' | 'views' | 'inbox' | 'drafts' | 'archive' | 'settings';
export type PlanSection = WorkspaceSection | ProjectSection;

interface SectionItem {
  id: string;
  label: string;
  entries?: Array<{ id: string; label: string }>;
}

const WORKSPACE_SECTIONS: SectionItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'your-work', label: 'Your work' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'views', label: 'Views' },
];

const PROJECT_SECTIONS = [
  { id: 'issues', label: 'Issues', icon: 'tasks' },
  { id: 'modules', label: 'Modules', icon: 'docs' },
  { id: 'views', label: 'Views', icon: 'search' },
  { id: 'inbox', label: 'Inbox', icon: 'mail' },
  { id: 'drafts', label: 'Drafts', icon: 'notes' },
  { id: 'archive', label: 'Archive', icon: 'archive', separator: true },
  { id: 'settings', label: 'Plan settings', icon: 'settings' },
] as const;

export function defaultPlanSection(projectId?: string): PlanSection {
  return projectId ? 'issues' : 'home';
}

export function PlanNavigation({ section, onSelect }: {
  section: WorkspaceSection;
  onSelect: (section: WorkspaceSection) => void;
}) {
  return (
    <bry-section-menu
      label="Plan"
      sections={[...WORKSPACE_SECTIONS]}
      current={section}
      onSelect={(event: BryEvent<{ id: string }>) => onSelect(event.detail.id as WorkspaceSection)}
    />
  );
}

export function ProjectNavigation({ onSelect }: {
  section: ProjectSection;
  onSelect: (section: ProjectSection) => void;
}) {
  return (
    <bry-menu
      items={[...PROJECT_SECTIONS]}
      onSelect={(event: BryEvent<{ id: string }>) => onSelect(event.detail.id as ProjectSection)}
    >
      <bry-button label="More" icon="more" variant="ghost" size="sm" />
    </bry-menu>
  );
}
