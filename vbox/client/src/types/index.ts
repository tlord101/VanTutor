export interface Attachment {
  id: string;
  emailId: string;
  filename: string;
  contentType: string;
  size: number;
  contentDisposition?: string;
  downloadUrl?: string;
}

export interface Email {
  id: string;
  resendEmailId: string;
  messageId?: string;
  threadId?: string;
  fromName?: string;
  fromEmail: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  preview?: string;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isTrash: boolean;
  createdAt: string;
  updatedAt: string;
  attachments?: Attachment[];
}

export interface User {
  id: string;
  email: string;
}

export interface EmailListResponse {
  emails: Email[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
