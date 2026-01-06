// Camera service for handling camera permissions and stream
export interface CameraState {
    stream: MediaStream | null;
    error: string | null;
    hasPermission: boolean;
    isRequesting: boolean;
}

export type CameraErrorType =
    | 'NotAllowedError'      // User denied permission
    | 'NotFoundError'        // No camera device found
    | 'NotReadableError'     // Camera in use by another app
    | 'OverconstrainedError' // Constraints cannot be satisfied
    | 'SecurityError'        // Security restriction (not HTTPS)
    | 'AbortError'           // Request was aborted
    | 'UnknownError';        // Other errors

export interface CameraError {
    type: CameraErrorType;
    message: string;
}

// Request camera permission and get stream
export async function requestCameraPermission(): Promise<{
    success: boolean;
    stream?: MediaStream;
    error?: CameraError;
}> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user', // Front camera
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
            audio: true, // Request microphone too
        });

        return {
            success: true,
            stream,
        };
    } catch (err) {
        const error = err as DOMException;

        let errorType: CameraErrorType = 'UnknownError';
        let message = 'An unknown error occurred while accessing the camera.';

        switch (error.name) {
            case 'NotAllowedError':
                errorType = 'NotAllowedError';
                message = 'Camera access was denied. Please allow camera access in your browser settings.';
                break;
            case 'NotFoundError':
                errorType = 'NotFoundError';
                message = 'No camera device was found on this device.';
                break;
            case 'NotReadableError':
                errorType = 'NotReadableError';
                message = 'Camera is already in use by another application.';
                break;
            case 'OverconstrainedError':
                errorType = 'OverconstrainedError';
                message = 'Camera does not support the required settings.';
                break;
            case 'SecurityError':
                errorType = 'SecurityError';
                message = 'Camera access is not allowed on insecure origins. Please use HTTPS.';
                break;
            case 'AbortError':
                errorType = 'AbortError';
                message = 'Camera access request was aborted.';
                break;
            default:
                errorType = 'UnknownError';
                message = error.message || 'An unknown error occurred.';
        }

        return {
            success: false,
            error: {
                type: errorType,
                message,
            },
        };
    }
}

// Stop camera stream
export function stopCameraStream(stream: MediaStream | null): void {
    if (stream) {
        stream.getTracks().forEach(track => {
            track.stop();
        });
    }
}

// Check if camera is available
export async function checkCameraAvailability(): Promise<boolean> {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some(device => device.kind === 'videoinput');
    } catch {
        return false;
    }
}

// Get camera permission status
export async function getCameraPermissionStatus(): Promise<'granted' | 'denied' | 'prompt'> {
    try {
        const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
        return result.state as 'granted' | 'denied' | 'prompt';
    } catch {
        // Fallback for browsers that don't support permissions API
        return 'prompt';
    }
}
