// WebRTC service for peer connection management

import { signalingService } from './signaling';

export interface WebRTCCallbacks {
    onConnectionStateChange: (state: RTCPeerConnectionState) => void;
    onTrack?: (stream: MediaStream) => void;
}

class WebRTCService {
    private pc: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private callbacks: WebRTCCallbacks | null = null;

    private readonly iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ];

    init(stream: MediaStream, callbacks: WebRTCCallbacks): void {
        this.localStream = stream;
        this.callbacks = callbacks;
        this.createPeerConnection();
    }

    private createPeerConnection(): void {
        this.pc = new RTCPeerConnection({
            iceServers: this.iceServers,
        });

        // Add local stream tracks to connection
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => {
                this.pc!.addTrack(track, this.localStream!);
            });
        }

        // Handle ICE candidates
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                signalingService.sendIceCandidate(event.candidate);
            }
        };

        // Handle connection state changes
        this.pc.onconnectionstatechange = () => {
            if (this.pc) {
                this.callbacks?.onConnectionStateChange(this.pc.connectionState);
                console.log('WebRTC connection state:', this.pc.connectionState);
            }
        };

        // Handle incoming tracks (for viewer)
        this.pc.ontrack = (event) => {
            if (event.streams[0]) {
                this.callbacks?.onTrack?.(event.streams[0]);
            }
        };
    }

    async createOffer(): Promise<void> {
        if (!this.pc) {
            throw new Error('Peer connection not initialized');
        }

        const offer = await this.pc.createOffer({
            offerToReceiveVideo: false,
            offerToReceiveAudio: false,
        });

        await this.pc.setLocalDescription(offer);

        if (offer.sdp) {
            signalingService.sendOffer(offer.sdp);
        }
    }

    async handleAnswer(sdp: string): Promise<void> {
        if (!this.pc) {
            throw new Error('Peer connection not initialized');
        }

        await this.pc.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp })
        );
    }

    async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (!this.pc) {
            throw new Error('Peer connection not initialized');
        }

        if (candidate) {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }

    close(): void {
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        this.localStream = null;
        this.callbacks = null;
    }

    get connectionState(): RTCPeerConnectionState | null {
        return this.pc?.connectionState ?? null;
    }
}

export const webrtcService = new WebRTCService();
