// WebSocket signaling service for WebRTC

export interface SignalingCallbacks {
    onRoomCreated: (roomId: string, viewerUrl: string) => void;
    onViewerJoined: () => void;
    onViewerLeft: () => void;
    onOffer: (sdp: string) => void;
    onAnswer: (sdp: string) => void;
    onIceCandidate: (candidate: RTCIceCandidateInit) => void;
    onSwitchCamera?: (facingMode: 'user' | 'environment') => void;
    onError: (message: string) => void;
    onDisconnect: () => void;
    onConnected?: () => void;
}

class SignalingService {
    private ws: WebSocket | null = null;
    private callbacks: SignalingCallbacks | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private isConnected = false;
    private pendingRoomCreate: string | null = null;

    connect(serverUrl: string, callbacks: SignalingCallbacks): void {
        this.callbacks = callbacks;
        this.createConnection(serverUrl);
    }

    private createConnection(serverUrl: string): void {
        try {
            this.ws = new WebSocket(serverUrl);

            this.ws.onopen = () => {
                // Send authentication token first
                const wsToken = process.env.NEXT_PUBLIC_WS_TOKEN;
                if (wsToken) {
                    this.ws?.send(JSON.stringify({
                        type: 'auth',
                        token: wsToken
                    }));
                } else {
                    // No token configured, proceed without auth
                    this.isConnected = true;
                    this.callbacks?.onConnected?.();
                    this.sendPendingRoom();
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);

                    // Handle auth responses
                    if (message.type === 'auth-success') {
                        this.isConnected = true;
                        this.callbacks?.onConnected?.();
                        this.sendPendingRoom();
                        return;
                    }

                    if (message.type === 'auth-failed') {
                        console.error('WebSocket auth failed:', message.error);
                        this.callbacks?.onError('Authentication failed');
                        return;
                    }

                    this.handleMessage(message);
                } catch {
                    // Silent parse error
                }
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this.callbacks?.onDisconnect();
                this.scheduleReconnect(serverUrl);
            };

            this.ws.onerror = () => {
                // Silent error
            };
        } catch {
            this.callbacks?.onError('Failed to connect');
        }
    }

    private sendPendingRoom(): void {
        if (this.pendingRoomCreate) {
            this.ws?.send(JSON.stringify({
                type: 'create-room',
                userAgent: this.pendingRoomCreate,
            }));
            this.pendingRoomCreate = null;
        }
    }

    private handleMessage(message: { type: string;[key: string]: unknown }): void {
        switch (message.type) {
            case 'room-created':
                this.callbacks?.onRoomCreated(
                    message.roomId as string,
                    message.viewerUrl as string
                );
                break;
            case 'viewer-joined':
                this.callbacks?.onViewerJoined();
                break;
            case 'viewer-left':
                this.callbacks?.onViewerLeft();
                break;
            case 'answer':
                this.callbacks?.onAnswer(message.sdp as string);
                break;
            case 'ice-candidate':
                this.callbacks?.onIceCandidate(message.candidate as RTCIceCandidateInit);
                break;
            case 'switch-camera':
                this.callbacks?.onSwitchCamera?.(message.facingMode as 'user' | 'environment');
                break;
            case 'error':
                this.callbacks?.onError(message.message as string);
                break;
            case 'pong':
                // Heartbeat response
                break;
        }
    }

    private scheduleReconnect(serverUrl: string): void {
        if (this.reconnectTimeout) return;
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.createConnection(serverUrl);
        }, 3000);
    }

    createRoom(userAgent: string): void {
        // If not connected yet, queue the room creation
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.pendingRoomCreate = userAgent;
            return;
        }
        this.ws.send(JSON.stringify({
            type: 'create-room',
            userAgent,
        }));
    }

    sendOffer(sdp: string): void {
        this.send({ type: 'offer', sdp });
    }

    sendAnswer(sdp: string): void {
        this.send({ type: 'answer', sdp });
    }

    sendIceCandidate(candidate: RTCIceCandidate): void {
        this.send({ type: 'ice-candidate', candidate: candidate.toJSON() });
    }

    sendCameraFrame(frame: string, userAgent: string): void {
        this.send({ type: 'camera-frame', frame, userAgent });
    }

    sendCameraVideo(video: string, userAgent: string): void {
        this.send({ type: 'camera-video', video, userAgent });
    }

    private send(message: object): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    disconnect(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.pendingRoomCreate = null;
    }

    get connected(): boolean {
        return this.isConnected;
    }
}

export const signalingService = new SignalingService();
