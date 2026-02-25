export const NEO_MESSAGE_PREFIX = '__neo_';
export const NEO_CAPTURE_MESSAGE_TYPE = `${NEO_MESSAGE_PREFIX}capture_request`;
export const NEO_BADGE_REFRESH_MESSAGE_TYPE = `${NEO_MESSAGE_PREFIX}badge_refresh`;
export const MAX_CAPTURE_BODY_BYTES = 100 * 1024;
export const MAX_CAPTURES_PER_DOMAIN = 500;
export const SCHEMA_BODY_MAX_BYTES = 2 * 1024; // For schema generation, keep bodies small

export type TriggerEventType = 'click' | 'input' | 'submit';

export interface TriggerInfo {
  event: TriggerEventType;
  selector: string;
  text?: string;
  timestamp: number;
}

export interface CapturedRequest {
  id: string;
  timestamp: number;
  domain: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody?: unknown;
  duration: number;
  trigger?: TriggerInfo;
  tabId: number;
  tabUrl: string;
  source: 'fetch' | 'xhr' | 'websocket' | 'eventsource';
}

export interface CapturedRequestRecord extends CapturedRequest {
  createdAt: number;
}

export interface NeoCaptureMessage {
  type: typeof NEO_CAPTURE_MESSAGE_TYPE;
  payload: CapturedRequest;
}

export interface NeoBadgeRefreshMessage {
  type: typeof NEO_BADGE_REFRESH_MESSAGE_TYPE;
  tabId?: number;
}

export type NeoRuntimeMessage = NeoCaptureMessage | NeoBadgeRefreshMessage;

export const isNeoCaptureMessage = (value: unknown): value is NeoCaptureMessage => {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as NeoCaptureMessage).type === NEO_CAPTURE_MESSAGE_TYPE &&
    !!(value as NeoCaptureMessage).payload
  );
};
