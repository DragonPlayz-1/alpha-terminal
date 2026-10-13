"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton, cn } from "@/components/ui";

// Native modal dialogs keep the background inert, trap Tab, and restore focus.
export function Dialog({ title, onClose, children, className }: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return createPortal(<dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); closeRef.current(); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeRef.current(); } }} className={cn("m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-white/[.12] bg-[#111722] p-0 text-white shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm", className)}>
    <div className="border-b border-white/[.08] px-4 py-3"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{title}</h2><IconButton label={`Close ${title.toLowerCase()}`} onClick={onClose}><X size={16} /></IconButton></div></div>
    <div>{children}</div>
  </dialog>, document.body);
}
