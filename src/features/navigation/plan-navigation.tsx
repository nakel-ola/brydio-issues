import type { BryEvent } from '@brydio/ui';

export type WorkspaceSection = 'home' | 'your-work' | 'analytics' | 'views';
export type ProjectSection = 'issues' | 'overview' | 'sprints' | 'modules' | 'views' | 'inbox' | 'drafts' | 'archive' | 'settings';
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

const PROJECT_SECTIONS: SectionItem[] = [
  { id: 'issues', label: 'Issues' },
  { id: 'overview', label: 'Overview' },
  { id: 'sprints', label: 'Sprints' },
  { id: 'modules', label: 'Modules' },
  { id: 'views', label: 'Views' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'drafts', label: 'Drafts' },
  {
    id: 'manage',
    label: 'Manage',
    entries: [
      { id: 'archive', label: 'Archive' },
      { id: 'settings', label: 'Settings' },
    ],
  },
];

export function defaultPlanSection(projectId?: string): PlanSection {
  return projectId ? 'issues' : 'home';
}

export function PlanNavigation({ projectId, section, onSelect }: {
  projectId?: string;
  section: PlanSection;
  onSelect: (section: PlanSection) => void;
}) {
  const sections = projectId ? PROJECT_SECTIONS : WORKSPACE_SECTIONS;

  return (
    <bry-section-menu
      label={projectId ? 'Project planning' : 'Plan'}
      sections={[...sections]}
      current={section}
      onSelect={(event: BryEvent<{ id: string }>) => onSelect(event.detail.id as PlanSection)}
    />
  );
}
