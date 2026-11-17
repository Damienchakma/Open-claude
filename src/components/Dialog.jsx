import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Dialog({ open, onClose, title, children, className = '' }) {
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const previousFocus = document.activeElement;
        const dialog = ref.current;
        dialog.showModal();
        return () => {
            dialog.close();
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [open]);
    if (!open) return null;
    return createPortal(
        <dialog ref={ref} className={`oc-dialog ${className}`} aria-label={title}
            onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            onKeyDown={event => {
                if (event.key !== 'Tab') return;
                const items = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter(item => item.getClientRects().length && item.tabIndex !== -1);
                const first = items[0];
                const last = items.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }}>
            <div className="dialog-surface">
                <header className="dialog-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label={`Close ${title}`}><X size={19} /></button></header>
                {children}
            </div>
        </dialog>, document.body
    );
}
