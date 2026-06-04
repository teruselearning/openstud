import React from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  /** 'danger' = red button (default). 'warning' = amber button. */
  variant?: 'danger' | 'warning';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
  variant = 'danger',
}) => {
  if (!isOpen) return null;

  const btnCls = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 shadow-red-100'
    : 'bg-amber-500 hover:bg-amber-600 shadow-amber-100';

  const iconBg = variant === 'danger'
    ? 'bg-red-100 text-red-600'
    : 'bg-amber-100 text-amber-600';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!isLoading ? onCancel : undefined}
      />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-150">
        {/* Close button */}
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="absolute top-4 right-4 text-slate-300 hover:text-slate-500 transition-colors disabled:opacity-40"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full flex-shrink-0 ${iconBg}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 min-w-0 pr-4">
            <h3 className="font-bold text-base text-slate-900">{title}</h3>
            <div className="text-sm text-slate-500 mt-1 leading-relaxed">{message}</div>
          </div>
        </div>

        <div className="flex gap-3 mt-6 justify-end">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-5 py-2 text-sm font-bold text-white rounded-xl flex items-center gap-2 shadow-lg transition-all disabled:opacity-50 ${btnCls}`}
          >
            {isLoading
              ? <Loader2 size={15} className="animate-spin" />
              : <Trash2 size={15} />
            }
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
