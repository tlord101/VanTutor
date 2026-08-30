/**
 * Cloudflare R2 Media & File Storage Service
 * Handles zero-egress high-speed uploads, downloads, and burn-after-download lifecycle.
 */

export interface R2UploadResult {
  success: boolean;
  url: string;
  key: string;
  size?: number;
  contentType?: string;
  burnAfterDownload?: boolean;
}

export interface R2UploadOptions {
  burnAfterDownload?: boolean;
  customPath?: string;
  fileName?: string;
  contentType?: string;
  userId?: string;
}

export const getR2WorkerUrl = (): string => {
  const envUrl = import.meta.env.VITE_CLOUDFLARE_R2_WORKER_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '';
};

export const isR2Configured = (): boolean => {
  return Boolean(getR2WorkerUrl());
};

/**
 * Uploads an image, voice note, or document to Cloudflare R2 via the edge worker.
 */
export const uploadToR2 = async (
  fileOrBlob: File | Blob,
  options: R2UploadOptions = {}
): Promise<R2UploadResult> => {
  const workerUrl = getR2WorkerUrl();
  if (!workerUrl) {
    throw new Error('Cloudflare R2 Worker URL is not configured.');
  }

  const {
    burnAfterDownload = false,
    customPath,
    fileName = (fileOrBlob as File).name || 'file',
    contentType = fileOrBlob.type || 'application/octet-stream',
    userId,
  } = options;

  const url = new URL(`${workerUrl}/upload`);
  if (burnAfterDownload) url.searchParams.set('burn', 'true');
  if (customPath) url.searchParams.set('path', customPath);

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'X-File-Name': encodeURIComponent(fileName),
  };
  if (burnAfterDownload) headers['X-Burn-After-Download'] = 'true';
  if (userId) headers['X-User-Id'] = userId;

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: fileOrBlob,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Upload failed');
    throw new Error(`R2 upload failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as R2UploadResult;
  return data;
};

/**
 * Programmatically purges a temporary/ephemeral file from Cloudflare R2
 * (useful after AI inference has finished reading a student's uploaded problem image/PDF).
 */
export const deleteFromR2 = async (fileKey: string): Promise<boolean> => {
  const workerUrl = getR2WorkerUrl();
  if (!workerUrl || !fileKey) return false;

  try {
    const cleanKey = encodeURIComponent(fileKey.replace(/^\/+/, ''));
    const response = await fetch(`${workerUrl}/file/${cleanKey}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (err) {
    console.warn('[R2 Delete Error]', err);
    return false;
  }
};
