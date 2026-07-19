export type {
  OpenCodeTimelineEvent,
  OpenCodeTimelineEventDetails,
  OpenCodeTimelineFilter,
  OpenCodeTimelineViewModel,
} from '../../opencode/timelineViewModel';
export type ReportWebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'requestEventDetails'; eventId: string }
  | { type: 'copyText'; value: string }
  | { type: 'openRawSession' }
  | { type: 'openKnownFile'; eventId: string; fileIndex: number }
  | { type: 'openChildSession'; eventId: string };
export type ReportExtensionToWebviewMessage =
  | {
      type: 'initialize';
      model: import('../../opencode/timelineViewModel').OpenCodeTimelineViewModel;
    }
  | {
      type: 'eventDetails';
      eventId: string;
      details: import('../../opencode/timelineViewModel').OpenCodeTimelineEventDetails;
    }
  | { type: 'eventDetailsError'; eventId: string; message: string };
