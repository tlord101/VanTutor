import React from 'react';
import DOMPurify from 'dompurify';
import { Email } from '../types';
import {
  ArrowLeft,
  Reply,
  Star,
  Archive,
  Trash2,
  Paperclip,
  Download,
  MoreVertical,
  RotateCcw
} from 'lucide-react';
import { formatDate, formatBytes, cn } from '../lib/utils';

interface EmailReaderProps {
  email: Email;
  onBack: () => void;
  onStar: (email: Email) => void;
  onArchive: (email: Email) => void;
  onTrash: (email: Email) => void;
  onRestore?: (email: Email) => void;
  onDeletePermanently?: (email: Email) => void;
}

export const EmailReader: React.FC<EmailReaderProps> = ({
  email,
  onBack,
  onStar,
  onArchive,
  onTrash,
  onRestore,
  onDeletePermanently
}) => {
  // Sanitize HTML safely
  const sanitizedHtml = React.useMemo(() => {
    if (!email.htmlBody) return null;
    return DOMPurify.sanitize(email.htmlBody, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['target']
    });
  }, [email.htmlBody]);

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-darkSurface overflow-y-auto">
      {/* Reader Toolbar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-darkBorder bg-white/90 dark:bg-darkSurface/90 backdrop-blur-md">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-darkTextSecondary hover:text-gray-900 dark:hover:text-darkTextPrimary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onStar(email)}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-darkBorder rounded-lg transition-colors"
            title={email.isStarred ? 'Unstar' : 'Star'}
          >
            <Star
              className={cn(
                'w-4 h-4',
                email.isStarred ? 'fill-amber-400 text-amber-400' : 'text-gray-500'
              )}
            />
          </button>

          {!email.isTrash ? (
            <>
              <button
                onClick={() => onArchive(email)}
                className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-darkBorder rounded-lg transition-colors"
                title="Archive"
              >
                <Archive className="w-4 h-4" />
              </button>
              <button
                onClick={() => onTrash(email)}
                className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-darkBorder rounded-lg transition-colors"
                title="Move to Trash"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              {onRestore && (
                <button
                  onClick={() => onRestore(email)}
                  className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-darkBorder rounded-lg transition-colors"
                  title="Restore from Trash"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              {onDeletePermanently && (
                <button
                  onClick={() => onDeletePermanently(email)}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                  title="Delete Permanently"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          <div className="h-4 w-px bg-gray-200 dark:bg-darkBorder mx-1" />

          <button
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-darkBorder rounded-lg transition-colors"
            title="More Options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Email Body & Details */}
      <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-darkTextPrimary mb-4">
            {email.subject || '(No Subject)'}
          </h1>

          <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-gray-50 dark:bg-darkBg border border-gray-100 dark:border-darkBorder">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                {(email.fromName || email.fromEmail).charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-darkTextPrimary text-sm">
                    {email.fromName || email.fromEmail}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-darkTextSecondary">
                    &lt;{email.fromEmail}&gt;
                  </span>
                </div>
                <div className="text-xs text-gray-400 dark:text-darkTextSecondary mt-0.5">
                  To: me ({Array.isArray(email.to) ? email.to.join(', ') : email.to})
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-400 dark:text-darkTextSecondary">
              {formatDate(email.receivedAt)}
            </div>
          </div>
        </div>

        {/* Email Content Container (Sandboxed rendering) */}
        <div className="pt-4 border-t border-gray-100 dark:border-darkBorder">
          {sanitizedHtml ? (
            <div
              className="prose dark:prose-invert max-w-none text-gray-800 dark:text-gray-200"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <div className="whitespace-pre-wrap font-sans text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
              {email.textBody || '(Empty body)'}
            </div>
          )}
        </div>

        {/* Attachments Section */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="pt-6 border-t border-gray-200 dark:border-darkBorder">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-darkTextSecondary uppercase tracking-wider mb-3 flex items-center gap-2">
              <Paperclip className="w-3.5 h-3.5" />
              Attachments ({email.attachments.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {email.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-darkBorder bg-gray-50 dark:bg-darkBg hover:border-blue-500 dark:hover:border-blue-500 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                      {att.filename.split('.').pop()?.toUpperCase() || 'FILE'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-darkTextPrimary truncate">
                        {att.filename}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-darkTextSecondary">
                        {formatBytes(att.size)}
                      </p>
                    </div>
                  </div>
                  <a
                    href={`/api/emails/${email.id}/attachments/${att.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
                    title="Download Attachment"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
