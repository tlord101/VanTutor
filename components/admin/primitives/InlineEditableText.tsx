import React, { useState, useRef, useEffect } from 'react';
import { Edit2, Loader2, Check } from 'lucide-react';

interface InlineEditableTextProps {
    value: string;
    onSave: (newValue: string) => Promise<void> | void;
    className?: string;
    inputClassName?: string;
    placeholder?: string;
    showEditIcon?: boolean;
}

export const InlineEditableText: React.FC<InlineEditableTextProps> = ({
    value,
    onSave,
    className = '',
    inputClassName = '',
    placeholder = 'Click to edit',
    showEditIcon = true,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(value);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setText(value);
    }, [value]);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    const handleSave = async () => {
        const trimmed = text.trim();
        if (!trimmed || trimmed === value) {
            setText(value);
            setIsEditing(false);
            return;
        }

        setIsSaving(true);
        try {
            await onSave(trimmed);
            setIsEditing(false);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
        } catch (error) {
            setText(value);
        } finally {
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            setText(value);
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <div className="inline-flex items-center gap-2 relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    disabled={isSaving}
                    className={`px-3 py-1.5 rounded-xl border border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 text-slate-900 dark:text-white font-bold outline-none ring-4 ring-amber-500/20 transition-all ${inputClassName}`}
                />
                {isSaving && <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />}
            </div>
        );
    }

    return (
        <span
            onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
            }}
            className={`group inline-flex items-center gap-2 cursor-pointer transition-colors hover:text-amber-600 dark:hover:text-amber-400 ${className}`}
            title="Double-click to edit"
        >
            <span>{value || placeholder}</span>
            {showSuccess ? (
                <Check className="w-4 h-4 text-emerald-500 animate-in zoom-in duration-200" />
            ) : (
                showEditIcon && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsEditing(true);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-amber-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                )
            )}
        </span>
    );
};
