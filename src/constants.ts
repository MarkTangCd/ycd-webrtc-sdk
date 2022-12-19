// Event name
export const JOIN = 'join';
export const MESSAGE = 'message';
export const LEAVE = 'leave';
export const FULL = 'full';
export const JOINED = 'joined';
export const LEFT = 'left';
export const DISCONNECT = 'disconnect';
export const OTHER_JOINED = 'other_joined';
export const BYE = 'bye';

// Other
export const pcConfig = {
  iceServers: [
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    }
  ]
}
export enum ClientState {
  JOINED_UNBIND = 'joined_unbind',
  JOINED_CONN = 'joined_conn',
  JOINED = 'joined',
  INIT = 'init',
  LEFT = 'left',
}
