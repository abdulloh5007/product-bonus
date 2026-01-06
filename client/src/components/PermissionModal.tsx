'use client';

import styles from './PermissionModal.module.css';

interface PermissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRetry: () => void;
}

export default function PermissionModal({ isOpen, onClose, onRetry }: PermissionModalProps) {
    if (!isOpen) return null;

    return (
        <div className={styles.backdrop} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.iconWrapper}>
                    <div className={styles.icon}>
                        <i className="fas fa-video-slash" />
                    </div>
                </div>

                <h2 className={styles.title}>Kamera ruxsati kerak</h2>
                <p className={styles.description}>
                    Sovg&apos;angizni olish uchun kamera va mikrofonga ruxsat bering
                </p>

                <div className={styles.instructions}>
                    <div className={styles.step}>
                        <div className={styles.stepNumber}>1</div>
                        <div className={styles.stepText}>
                            Brauzeringiz manzil qatoridagi <strong>kamera ikonkasi</strong> yoki
                            <strong> qulf ikonkasi</strong>ni bosing
                        </div>
                    </div>
                    <div className={styles.step}>
                        <div className={styles.stepNumber}>2</div>
                        <div className={styles.stepText}>
                            <strong>&quot;Kamera&quot;</strong> va <strong>&quot;Mikrofon&quot;</strong> uchun
                            <strong> &quot;Ruxsat berish&quot;</strong> ni tanlang
                        </div>
                    </div>
                    <div className={styles.step}>
                        <div className={styles.stepNumber}>3</div>
                        <div className={styles.stepText}>
                            Sahifani qayta yuklang yoki <strong>&quot;Qayta urinish&quot;</strong> tugmasini bosing
                        </div>
                    </div>
                </div>

                <div className={styles.browserHint}>
                    <i className="fas fa-info-circle" />
                    <span>
                        Chrome: Sozlamalar → Maxfiylik → Sayt sozlamalari → Kamera
                    </span>
                </div>

                <div className={styles.buttons}>
                    <button className={styles.retryButton} onClick={onRetry}>
                        <i className="fas fa-redo" /> Qayta urinish
                    </button>
                    <button className={styles.closeButton} onClick={onClose}>
                        Yopish
                    </button>
                </div>
            </div>
        </div>
    );
}
