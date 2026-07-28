import type {
  OpenCodeTimelineEvent,
  OpenCodeTimelineFilter,
  OpenCodeTimelineViewModel,
} from './model';
export interface OpenCodeTimelineState {
  activeFilter: OpenCodeTimelineFilter;
  query: string;
  draftQuery: string;
  expandedEventIds: Set<string>;
  sessionDetailsExpanded: boolean;
  focusedEventId?: string;
}
export function createInitialTimelineState(
  model: OpenCodeTimelineViewModel,
): OpenCodeTimelineState {
  return {
    activeFilter: model.initialState.activeFilter,
    query: '',
    draftQuery: '',
    expandedEventIds: new Set(model.initialState.expandedEventIds),
    sessionDetailsExpanded: false,
  };
}
export function setTimelineFilter(
  state: OpenCodeTimelineState,
  activeFilter: OpenCodeTimelineFilter,
): OpenCodeTimelineState {
  return { ...state, activeFilter };
}
export function setTimelineSearchDraft(
  state: OpenCodeTimelineState,
  draftQuery: string,
): OpenCodeTimelineState {
  return { ...state, draftQuery };
}
export function applyTimelineSearch(state: OpenCodeTimelineState): OpenCodeTimelineState {
  return { ...state, query: state.draftQuery };
}
export function clearTimelineSearch(state: OpenCodeTimelineState): OpenCodeTimelineState {
  return { ...state, query: '', draftQuery: '' };
}
export function toggleTimelineEvent(
  state: OpenCodeTimelineState,
  eventId: string,
): OpenCodeTimelineState {
  const expandedEventIds = new Set(state.expandedEventIds);
  if (expandedEventIds.has(eventId)) expandedEventIds.delete(eventId);
  else expandedEventIds.add(eventId);
  return { ...state, expandedEventIds };
}
export function expandVisibleTimelineEvents(
  state: OpenCodeTimelineState,
  events: OpenCodeTimelineEvent[],
): OpenCodeTimelineState {
  const expandedEventIds = new Set(state.expandedEventIds);
  for (const event of visibleTimelineEvents(events, state))
    if (event.expandable) expandedEventIds.add(event.id);
  return { ...state, expandedEventIds };
}
export function collapseVisibleTimelineEvents(
  state: OpenCodeTimelineState,
  events: OpenCodeTimelineEvent[],
): OpenCodeTimelineState {
  const expandedEventIds = new Set(state.expandedEventIds);
  for (const event of visibleTimelineEvents(events, state)) expandedEventIds.delete(event.id);
  return { ...state, expandedEventIds };
}
export function visibleTimelineEvents(
  events: OpenCodeTimelineEvent[],
  state: Pick<OpenCodeTimelineState, 'activeFilter' | 'query'>,
): OpenCodeTimelineEvent[] {
  const q = state.query.trim().toLowerCase();
  return events.filter(
    (event) => matchesFilter(event, state.activeFilter) && (!q || event.searchText.includes(q)),
  );
}
export function matchesFilter(
  event: OpenCodeTimelineEvent,
  filter: OpenCodeTimelineFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'tools') return event.kind === 'tool' || event.kind === 'skill';
  if (filter === 'skills') return event.kind === 'skill';
  if (filter === 'reasoning') return event.kind === 'reasoning';
  if (filter === 'errors') return event.category === 'error';
  if (filter === 'diffs') return event.category === 'diff';
  if (filter === 'text') return event.category === 'text';
  return event.category === 'subtask';
}
