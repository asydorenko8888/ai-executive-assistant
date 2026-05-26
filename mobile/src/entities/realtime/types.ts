export type RealtimeConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type RealtimeEvent<TPayload = unknown> = {
  channel: string;
  type: string;
  payload: TPayload;
  receivedAt: string;
};
