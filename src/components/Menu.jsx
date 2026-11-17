import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function Menu({ label, trigger, children, className = '', placement = 'bottom', align = 'left', disabled = false }) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ visibility: 'hidden' });
    const root = useRef(null);
    const button = useRef(null);
    const panel = useRef(null);
    const id = useId();
    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const anchor = button.current.getBoundingClientRect();
            const box = panel.current.getBoundingClientRect();
            let top = placement === 'top' ? anchor.top - box.height - 8 : anchor.bottom + 8;
            if (top < 8) top = anchor.bottom + 8;
            if (top + box.height > innerHeight - 8) top = Math.max(8, anchor.top - box.height - 8);
            const left = Math.max(8, Math.min(align === 'right' ? anchor.right - box.width : anchor.left, innerWidth - box.width - 8));
            setPosition({ top, left });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    }, [open, align, placement, children]);
    useEffect(() => {
        if (!open) return;
        const close = event => {
            if (!root.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false);
        };
        const escape = event => {
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false); button.current?.focus(); }
        };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
    }, [open]);
    const navigate = event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || event.target.tagName === 'INPUT') return;
        const items = [...panel.current.querySelectorAll('[role^="menuitem"]:not(:disabled)')];
        if (!items.length) return;
        event.preventDefault();
        const current = items.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next].focus();
    };
    const blur = event => {
        if (event.relatedTarget && !root.current?.contains(event.relatedTarget) && event.relatedTarget.closest('[role="menu"]')?.id !== id) setOpen(false);
    };
    return <div ref={root} className={`oc-menu ${className}`} onBlur={blur}>
        <button ref={button} type="button" className="menu-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled}
            onClick={() => setOpen(!open)} onKeyDown={event => {
                if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); requestAnimationFrame(() => panel.current?.querySelector('input, [role^="menuitem"]')?.focus()); }
            }}>{trigger}</button>
        {open && createPortal(<div ref={panel} id={id} role="menu" aria-label={label} style={position} className={`menu-panel ${className}`} onKeyDown={navigate} onBlur={blur}
            onClick={event => { if (event.target.closest('[role^="menuitem"]') && !event.target.closest('[data-keep-open]')) { button.current?.focus(); setOpen(false); } }}>{children}</div>, document.body)}
    </div>;
}
