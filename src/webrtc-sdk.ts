import io, { Socket } from 'socket.io-client';
import {
  JOIN,
  JOINED,
  LEFT,
  LEAVE,
  MESSAGE,
  DISCONNECT,
  OTHER_JOINED,
  BYE,
  FULL,
  pcConfig,
  ClientState
} from './constants';

interface Events {
  onJoined: (total: number) => void;
  onLeft: () => void;
  onCustomerJoined: (roomid: string) => void;
  onFull: () => void;
  onBye: () => void;
  onConnectionFailed: (error: any) => void;
  onError: (error: any) => void;
}

interface WebRTCClientOptions {
  localElement?: HTMLVideoElement | HTMLAudioElement | boolean;
  remoteElement: HTMLVideoElement | HTMLAudioElement;
  events: Events;
  server: string;
  roomID: string;
}

export class WebRTCClient {
  localElement?: HTMLVideoElement | HTMLAudioElement | boolean;
  remoteElement: HTMLVideoElement | HTMLAudioElement;
  state: ClientState;
  server: string;
  roomID?: string;
  private socket?: Socket;
  private events: Events;
  private offerDesc?: RTCLocalSessionDescriptionInit;
  private pc?: RTCPeerConnection;
  private localStream?: MediaStream;
  private remoteStream?: MediaStream;

  constructor(options: WebRTCClientOptions) {
    console.log('Starting Debug');
    console.log(options);
    this.localElement = options.localElement;
    this.remoteElement = options.remoteElement;
    this.events = options.events;
    this.state = ClientState.INIT;
    this.server = options.server;
    this.roomID = options.roomID;
    this.connSignalServer();
  }

  private joined(roomID: string, id: string, total: number) {
    console.log('receive joined message:', roomID, this.state, id, total);
    this.state = ClientState.JOINED;
    this.createPeerConnection();
    this.bindTracks();
    this.events.onJoined(total);
  }

  private left(roomID: string) {
    console.log('receive left message:', roomID, this.state);
    this.state = ClientState.LEFT;
    this.socket?.disconnect();
    this.events.onLeft();
  }

  public leave() {
    if (this.socket) {
      this.socket.emit(LEAVE, this.roomID);
      this.pc && this.hangUp();
      this.closeLocalMedia();
    }
  }

  private otherJoined(roomID: string, id: string, total: number) {
    console.log('receive otherjoined message:', roomID, this.state);
    if (this.state === ClientState.JOINED_UNBIND) {
      this.createPeerConnection();
      this.bindTracks();
    }

    this.state = ClientState.JOINED_CONN;
    this.call();
    this.events.onCustomerJoined(roomID);
  }

  private call() {
    if (this.state === ClientState.JOINED_CONN && this.pc) {
      const offerOptions: RTCOfferOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      }

      this.pc.createOffer(offerOptions)
        .then(this.getOffer.bind(this))
        .catch(this.handleOfferError);
    }
  }

  private handleOfferError(err: any) {
    throw new Error('Failed to create offer:' + err);
  }

  private getOffer(desc: RTCLocalSessionDescriptionInit) {
    if (this.roomID) {
      this.pc?.setLocalDescription(desc);
      this.offerDesc = desc;
      this.sendMessage(this.roomID, this.offerDesc);
    }
  }

  private sendMessage(roomID: string, data: any) {
    if (!this.socket) {
      this.events.onError(new Error('socket is null'));
      return;
    }
    // 传递SDP给Signal server
    this.socket.emit(MESSAGE, roomID, data);
  }

  private full(roomID: string, id: string, total: number) {
    console.log('receive full message:', roomID, this.state);
    this.socket?.disconnect();
    this.hangUp();
    this.closeLocalMedia();
    this.state = ClientState.LEFT;
    // This room is full. Others can't join.
    this.events.onFull();
  }

  private closeLocalMedia() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
      });
    }
    this.localStream = undefined;
  }

  private hangUp() {
    if (!this.pc) {
      this.events.onError(new Error('pc is null or undefined!'));
      return;
    }

    this.offerDesc = undefined;
    this.pc.close();
    this.pc = undefined;
  }

  private bye(roomID: string) {
    console.log('receive bye message:', roomID, this.state);
    this.state = ClientState.JOINED_UNBIND;
    this.hangUp();
    this.events.onBye();
  }

  private disconnect() {
    console.log('receive disconnect message!', this.roomID);
    if (this.state !== ClientState.LEFT) {
      this.hangUp();
      this.closeLocalMedia();
    }
    this.state = ClientState.LEFT;
  }

  private bindTracks() {
    if (!this.pc) {
      this.events.onError(new Error('pc is null or undefined!'));
    }

    if (!this.localStream) {
      this.events.onError(new Error('localStream is null or undefined!'));
    }

    this.localStream.getTracks().forEach((track) => {
      this.pc?.addTrack(track, this.localStream as MediaStream);
    });
  }

  private message(roomID: string, data: any) {
    console.log('receive message!', this.roomID, data);

    if (!data) {
      this.events.onError(new Error('the message is invalid!'));
      return;
    }

    if (data.hasOwnProperty('type') && data.type === 'offer') {
      this.pc?.setRemoteDescription(new RTCSessionDescription(data));

      this.pc?.createAnswer()
        .then(this.getAnswer.bind(this))
        .catch(this.handleAnswerError);
    } else if (data.hasOwnProperty('type') && data.type === 'answer') {
      this.pc?.setRemoteDescription(new RTCSessionDescription(data));
    } else if (data.hasOwnProperty('type') && data.type === 'candidate') {
      let candidate = new RTCIceCandidate({
        sdpMLineIndex: data.label,
        candidate: data.candidate
      });
      this.pc?.addIceCandidate(candidate);
    } else {
      this.events.onError(new Error('the message is invalid!'));
    }
  }

  private getAnswer(desc: RTCLocalSessionDescriptionInit) {
    if (this.roomID) {
      this.pc?.setLocalDescription(desc);
      this.sendMessage(this.roomID, desc);
    }
  }

  private handleAnswerError(err: any) {
    console.error(err);
    throw new Error('Failed to create answer');
  }

  private bindEvents() {
    if (this.socket) {
      this.socket.on(JOINED, this.joined.bind(this));
      this.socket.on(LEFT, this.left.bind(this));
      this.socket.on(OTHER_JOINED, this.otherJoined.bind(this));
      this.socket.on(MESSAGE, this.message.bind(this));
      this.socket.on(FULL, this.full.bind(this));
      this.socket.on(BYE, this.bye.bind(this));
      this.socket.on(DISCONNECT, this.disconnect.bind(this));

      console.log('bind events');
      // init done
      this.join();
    }
  }

  private createPeerConnection() {
    if (!this.pc) {
      this.pc = new RTCPeerConnection(pcConfig);

      this.pc.onicecandidate = (e) => {
        if (e.candidate && this.roomID) {
          this.sendMessage(this.roomID, {
            type: 'candidate',
            label: e.candidate.sdpMLineIndex,
            id: e.candidate.sdpMid,
            candidate: e.candidate.candidate
          });
        } else {
          console.log('this is the end candidate');
        }
      }

      console.log('bind the on track event');
      this.pc.ontrack = this.getRemoteStream.bind(this);
    } else {
      this.events.onError(new Error('the pc have be created!'));
    }
  }

  private getRemoteStream(e: RTCTrackEvent) {
    this.remoteStream = e.streams[0];
    this.remoteElement.srcObject = e.streams[0];
    this.remoteElement.play();
  }

  private connSignalServer() {
    this.start();
  }

  private start() {
    if (!navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia) {
      this.handleError(Error('the getUserMedia is not supported!'));
    } else {
      console.log('navigator.mediaDevices.getUserMedia');
      let constraints;

      if (this.localElement instanceof HTMLAudioElement) {
        constraints = {
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        }
      } else if (this.localElement instanceof HTMLVideoElement) {
        constraints = {
          // video: {
          //   width: 400,
          //   height: 550,
          //   frameRate: 15,
          //   facingMode: 'enviroment'
          // },
          video: true,
          audio: false
        }
      } else if (this.localElement === false) {
        constraints = {
          // video: {
          //   width: 400,
          //   height: 550,
          //   frameRate: 15,
          //   facingMode: 'enviroment'
          // },
          video: true,
          audio: true
        }
      } else {
        constraints = {
          video: false,
          audio: true
        }
      }

      navigator.mediaDevices.getUserMedia(constraints)
        .then(this.getMediaStream.bind(this))
        .catch(this.handleError);
    }
  }

  private connect() {
    this.socket = io(this.server);

    console.log('Start conect');
    this.bindEvents();
  }

  private getMediaStream(stream: MediaStream) {
    console.log('getMediaStream callback');
    if (this.localStream) {
      stream.getAudioTracks().forEach((track) => {
        this.localStream?.addTrack(track);
        stream.removeTrack(track);
      });
    } else {
      this.localStream = stream;
    }

    if (this.localElement && typeof this.localElement !== 'boolean') {
      this.localElement.srcObject = this.localStream;
    }

    // setup connection
    this.connect();
  }

  private handleError(e: any) {
    this.events.onError(e);
  }

  private join() {
    if (this.socket) {
      console.log('Connect the room by socket');
      this.socket.emit(JOIN, this.roomID);
    } else {
      this.events.onConnectionFailed(new Error('Not connected to signaling server.'));
    }
  }

}
