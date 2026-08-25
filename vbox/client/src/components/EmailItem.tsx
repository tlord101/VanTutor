import React from 'react';
import { Email } from '../types';
import { Star, Paperclip } from 'lucide-react';
import { formatDate, cn } from '../lib/utils';

interface EmailItemProps {
  email: Email;
  isSelected: boolean;
  onSelect: (email: Email) => void;
  onToggleStar: (e: React.MouseEvent, email: Email) => void;
  onCheckboxChange?: (e: React.ChangeEvent<HTMLInputElement>, email: Email) => void;
  isChecked?: boolean;
}

export const EmailItem: React.FC<EmailItemProps> = ({
  email,
  isSelected,
  onSelect,
  onToggleStar,
  onCheckboxChange,
  isChecked = false
}) => {
  const isUnread = !email.isRead;

  return (
    <div
      onClick={() => onSelect(email)}
      className={cn(
        'group flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-darkBorder cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-darkBorder/40',
        isSelected && 'bg-blue-50/80 dark:bg-blue-950/30 border-l-4 border-l-blue-600',
        isUnread && !isSelected && 'bg-white dark:bg-darkSurface font-semibold'
      )}
    >
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {onCheckboxChange && (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => onCheckboxChange(e, email)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        )}
        <button
          onClick={(e) => onToggleStar(e, email)}
          className="p-1 text-gray-400 hover:text-amber-500 transition-colors"
          title={email.isStarred ? 'Unstar' : 'Star'}
        >
          <Star
            className={cn(
              'w-4 h-4',
              email.isStarred ? 'fill-amber-400 text-amber-400' : 'text-gray-400'
            )}
          />
        </button>
      </div>

      <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center justify-between gap-1 md:gap-4">
        <div className="w-48 truncate text-sm font-medium text-gray-900 dark:text-darkTextPrimary">
          {email.fromName || email.fromEmail}
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className={cn('text-sm truncate', isUnread ? 'text-gray-900 dark:text-darkTextPrimary font-medium' : 'text-gray-600 dark:text-darkTextSecondary')}>
            {email.subject || '(No Subject)'}
          </span>
          <span className="hidden lg:inline text-xs text-gray-400 dark:text-gray-500 truncate max-w-xs">
            — {email.preview}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-darkTextSecondary shrink-0 ml-auto">
          {email.attachments && email.attachments.length > 0 && (
            <Paperclip className="w-3.5 h-3.5 text-gray-400" />
          )}
          <span>{formatDate(email.receivedAt)}</span>
        </div>
      </div>
    </div>
  );
};
