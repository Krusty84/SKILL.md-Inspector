import * as l10n from '@vscode/l10n';

export function eventTogglePresentation(
  expanded: boolean,
  eventName = 'event',
): { ariaLabel: string; tooltip: string; expanded: boolean } {
  const safe = eventName.trim() || 'event';
  return {
    ariaLabel: expanded ? l10n.t('Collapse {0} event', safe) : l10n.t('Expand {0} event', safe),
    tooltip: expanded ? l10n.t('Collapse event') : l10n.t('Expand event'),
    expanded,
  };
}
