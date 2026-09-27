import type { BryEvent } from '@brydio/ui';

import type { IssueFilters, IssueGroup, IssueSort } from '../../model/issues.ts';
import type { Label, Module, Sprint, State } from '../../model/schemas.ts';

export type IssueLayout = 'list' | 'kanban' | 'calendar' | 'gantt' | 'spreadsheet';
export type CalendarMode = 'month' | 'week';
export type IssueProperty = 'identifier' | 'state' | 'priority' | 'assignee' | 'sprint' | 'module' | 'start' | 'target' | 'estimate';

export interface IssueViewState {
  layout: IssueLayout;
  calendarMode: CalendarMode;
  filters: IssueFilters;
  group: IssueGroup;
  sort: IssueSort;
  showEmptyGroups: boolean;
  showSubIssues: boolean;
  properties: IssueProperty[];
}

export const DEFAULT_ISSUE_VIEW: IssueViewState = {
  layout: 'list',
  calendarMode: 'month',
  filters: {},
  group: 'state',
  sort: { field: 'rank', direction: 'asc' },
  showEmptyGroups: false,
  showSubIssues: true,
  properties: ['identifier', 'state', 'priority', 'assignee', 'sprint', 'target'],
};

const LAYOUTS = [
  { value: 'list', label: 'List', icon: 'tasks' },
  { value: 'kanban', label: 'Kanban', icon: 'tasks' },
  { value: 'calendar', label: 'Calendar', icon: 'calendar' },
  { value: 'gantt', label: 'Gantt', icon: 'arrowRight' },
  { value: 'spreadsheet', label: 'Spreadsheet', icon: 'docs' },
] as const;

const PROPERTIES: { value: IssueProperty; label: string }[] = [
  { value: 'identifier', label: 'Identifier' }, { value: 'state', label: 'State' },
  { value: 'priority', label: 'Priority' }, { value: 'assignee', label: 'Assignee' },
  { value: 'sprint', label: 'Sprint' }, { value: 'module', label: 'Module' },
  { value: 'start', label: 'Start date' }, { value: 'target', label: 'Target date' },
  { value: 'estimate', label: 'Estimate' },
];

const option = (id: string, name: string) => ({ value: id, label: name });

export function IssueControls({ value, states, labels, sprints, modules, members, onChange, onSelectVisible, selectedCount }: {
  value: IssueViewState;
  states: readonly State[];
  labels: readonly Label[];
  sprints: readonly Sprint[];
  modules: readonly Module[];
  members: readonly { id: string; name: string }[];
  onChange: (value: IssueViewState) => void;
  onSelectVisible: () => void;
  selectedCount: number;
}) {
  const changeFilters = (fields: Partial<IssueFilters>) => onChange({ ...value, filters: { ...value.filters, ...fields } });
  const chosen = (raw: string) => raw === 'all' ? undefined : raw;

  return (
    <bry-stack direction="row" gap="2" align="center" wrap>
      <bry-button-group label="Issue layout">
        {LAYOUTS.map(layout => (
          <bry-button
            key={layout.value}
            label={layout.label}
            icon={layout.icon}
            hideLabel
            size="sm"
            variant={value.layout === layout.value ? 'secondary' : 'ghost'}
            onPress={() => onChange({ ...value, layout: layout.value })}
          />
        ))}
      </bry-button-group>
      <bry-popover title="Display issues" align="end">
        <bry-button label="Display" icon="settings" size="sm" />
        <bry-stack gap="3">
          <bry-toggle-group
            type="single"
            label="Layout"
            items={[...LAYOUTS]}
            values={[value.layout]}
            variant="outline"
            size="sm"
            onChange={(event: BryEvent<{ values: string[] }>) => {
              const layout = event.detail.values[0] as IssueLayout | undefined;

              if (layout) onChange({ ...value, layout });
            }}
          />
          {value.layout === 'calendar' && (
            <bry-toggle-group
              type="single"
              label="Calendar range"
              items={[option('month', 'Month'), option('week', 'Week')]}
              values={[value.calendarMode]}
              size="sm"
              onChange={(event: BryEvent<{ values: string[] }>) => onChange({ ...value, calendarMode: (event.detail.values[0] as CalendarMode | undefined) ?? value.calendarMode })}
            />
          )}
          <bry-select
            label="Group by"
            value={value.group}
            options={['none', 'state', 'priority', 'assignee', 'sprint', 'module'].map(one => option(one, one[0]!.toUpperCase() + one.slice(1)))}
            onChange={(event: BryEvent<{ value: string }>) => onChange({ ...value, group: event.detail.value as IssueGroup })}
          />
          <bry-select
            label="Order by"
            value={value.sort.field}
            options={['rank', 'priority', 'title', 'createdAt', 'updatedAt', 'target'].map(one => option(one, one === 'rank' ? 'Manual order' : one))}
            onChange={(event: BryEvent<{ value: string }>) => onChange({ ...value, sort: { ...value.sort, field: event.detail.value as IssueSort['field'] } })}
          />
          <bry-toggle label="Show empty groups" pressed={value.showEmptyGroups} onChange={(event: BryEvent<{ pressed: boolean }>) => onChange({ ...value, showEmptyGroups: event.detail.pressed })} />
          <bry-toggle label="Show sub-issues" pressed={value.showSubIssues} onChange={(event: BryEvent<{ pressed: boolean }>) => onChange({ ...value, showSubIssues: event.detail.pressed })} />
          <bry-toggle-group type="multiple" label="Visible properties" items={PROPERTIES} values={value.properties} onChange={(event: BryEvent<{ values: string[] }>) => onChange({ ...value, properties: event.detail.values as IssueProperty[] })} />
          <bry-button label={selectedCount ? `${selectedCount} selected` : 'Select visible'} size="sm" onPress={onSelectVisible} />
        </bry-stack>
      </bry-popover>

      <bry-popover title="Filter issues" align="end">
        <bry-button label="Filters" icon="search" hideLabel size="sm" variant="ghost" />
        <bry-stack gap="2">
          <bry-input
            label="Search"
            value={value.filters.query ?? ''}
            placeholder="Title or description"
            onChange={(event: BryEvent<{ value: string }>) => changeFilters({ query: event.detail.value || undefined })}
          />
          <bry-grid columns="2" gap="2">
            <bry-select label="Filter state" value={value.filters.stateIds?.[0] ?? 'all'} options={[option('all', 'All states'), ...states.map(one => option(one.id, one.name))]} onChange={(event: BryEvent<{ value: string }>) => changeFilters({ stateIds: chosen(event.detail.value) ? [event.detail.value] : undefined })} />
            <bry-select label="Filter priority" value={value.filters.priorities?.[0] ?? 'all'} options={['all', 'urgent', 'high', 'medium', 'low', 'none'].map(one => option(one, one[0]!.toUpperCase() + one.slice(1)))} onChange={(event: BryEvent<{ value: string }>) => changeFilters({ priorities: chosen(event.detail.value) ? [event.detail.value as 'urgent' | 'high' | 'medium' | 'low' | 'none'] : undefined })} />
            <bry-select label="Filter assignee" value={value.filters.assigneeId ?? 'all'} options={[option('all', 'All assignees'), ...members.map(one => option(one.id, one.name))]} onChange={(event: BryEvent<{ value: string }>) => changeFilters({ assigneeId: chosen(event.detail.value) })} />
            <bry-select label="Filter label" value={value.filters.labelId ?? 'all'} options={[option('all', 'All labels'), ...labels.map(one => option(one.id, one.name))]} onChange={(event: BryEvent<{ value: string }>) => changeFilters({ labelId: chosen(event.detail.value) })} />
            <bry-select label="Filter sprint" value={value.filters.sprintId ?? 'all'} options={[option('all', 'All sprints'), ...sprints.map(one => option(one.id, one.name))]} onChange={(event: BryEvent<{ value: string }>) => changeFilters({ sprintId: chosen(event.detail.value) })} />
            <bry-select label="Filter module" value={value.filters.moduleId ?? 'all'} options={[option('all', 'All modules'), ...modules.map(one => option(one.id, one.name))]} onChange={(event: BryEvent<{ value: string }>) => changeFilters({ moduleId: chosen(event.detail.value) })} />
            <bry-select label="Filter creator" value={value.filters.creatorId ?? 'all'} options={[option('all', 'All creators'), ...members.map(one => option(one.id, one.name))]} onChange={(event: BryEvent<{ value: string }>) => changeFilters({ creatorId: chosen(event.detail.value) })} />
          </bry-grid>
          <bry-grid columns="2" gap="2">
            <bry-date label="Start from" value={value.filters.startFrom} onChange={(event: BryEvent<{ value: string }>) => changeFilters({ startFrom: event.detail.value || undefined })} />
            <bry-date label="Start through" value={value.filters.startTo} onChange={(event: BryEvent<{ value: string }>) => changeFilters({ startTo: event.detail.value || undefined })} />
            <bry-date label="Target from" value={value.filters.targetFrom} onChange={(event: BryEvent<{ value: string }>) => changeFilters({ targetFrom: event.detail.value || undefined })} />
            <bry-date label="Target through" value={value.filters.targetTo} onChange={(event: BryEvent<{ value: string }>) => changeFilters({ targetTo: event.detail.value || undefined })} />
          </bry-grid>
          <bry-button label="Clear filters" onPress={() => onChange({ ...value, filters: {} })} />
        </bry-stack>
      </bry-popover>
    </bry-stack>
  );
}
