import { useState, useCallback } from 'react';
import { useToast } from './useToast';

interface GoogleDrivePickerOptions {
  clientId: string;
  apiKey: string;
  onFilesSelected: (files: File[]) => void;
  onProgress?: (status: string, percent: number) => void;
}

const GOOGLE_ACCESS_TOKEN_KEY = 'avelut_google_drive_token';

export const useGoogleDrivePicker = () => {
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const { addToast } = useToast();

  const openPicker = useCallback(async (options: GoogleDrivePickerOptions) => {
    const { clientId, apiKey, onFilesSelected, onProgress } = options;

    if (!clientId || !apiKey) {
      addToast("Google Drive credentials not configured in App Settings", "error");
      return;
    }

    setIsPickerLoading(true);

    const buildAndShowPicker = (token: string) => {
      const view = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.DOCS)
        .setMimeTypes('application/pdf');

      const picker = new (window as any).google.picker.PickerBuilder()
        .enableFeature((window as any).google.picker.Feature.MULTISELECT_ENABLED)
        .setAppId(clientId)
        .setOAuthToken(token)
        .addView(view)
        .setDeveloperKey(apiKey)
        .setCallback(async (data: any) => {
          if (data.action === (window as any).google.picker.Action.PICKED) {
            const docs = data.docs;
            const files: File[] = [];

            addToast(`Importing ${docs.length} file(s) from Drive...`, "info");

            for (let i = 0; i < docs.length; i++) {
              const doc = docs[i];
              try {
                const fileId = doc.id;
                const fileName = doc.name;
                
                if (onProgress) {
                  onProgress(`Preparing to download ${fileName}...`, 0);
                }

                const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                  headers: { Authorization: `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`Failed to fetch ${fileName}`);

                const contentLength = response.headers.get('content-length');
                const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
                let loadedBytes = 0;

                const reader = response.body?.getReader();
                if (!reader) throw new Error('Failed to get stream reader');

                const chunks: Uint8Array[] = [];
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  
                  if (value) {
                    chunks.push(value);
                    loadedBytes += value.length;
                    
                    if (onProgress && totalBytes > 0) {
                      // Calculate percentage, capping at 99% until complete
                      const percent = Math.min(Math.round((loadedBytes / totalBytes) * 100), 99);
                      onProgress(`Downloading ${fileName}...`, percent);
                    } else if (onProgress) {
                      // Fallback if no content-length
                      onProgress(`Downloading ${fileName} (${Math.round(loadedBytes / 1024 / 1024)}MB)...`, 50);
                    }
                  }
                }

                if (onProgress) {
                  onProgress(`Finalizing ${fileName}...`, 100);
                }

                const blob = new Blob(chunks, { type: 'application/pdf' });
                files.push(new File([blob], fileName, { type: 'application/pdf' }));
              } catch (err) {
                console.error(`Error downloading file from Drive:`, err);
                addToast(`Failed to download ${doc.name}`, "error");
                if (onProgress) onProgress(`Failed to download ${doc.name}`, 0);
              }
            }
            onFilesSelected(files);
          }
        })
        .build();
      picker.setVisible(true);
      setIsPickerLoading(false);
    };

    const initializePicker = (token: string) => {
      if (!(window as any).google?.picker) {
        // Load the picker library if not already loaded
        (window as any).gapi.load('picker', {
          callback: () => buildAndShowPicker(token)
        });
      } else {
        buildAndShowPicker(token);
      }
    };

    if (accessToken) {
      initializePicker(accessToken);
    } else {
      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
          callback: (response: any) => {
            if (response.access_token) {
              setAccessToken(response.access_token);
              try {
                localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, response.access_token);
              } catch (e) {
                console.warn("Failed to persist Google token:", e);
              }
              initializePicker(response.access_token);
            } else {
              setIsPickerLoading(false);
              addToast("Failed to acquire Google access token", "error");
            }
          },
          error_callback: (err: any) => {
            console.error('GIS Error:', err);
            setIsPickerLoading(false);
            addToast("Google Auth error", "error");
          }
        });
        client.requestAccessToken();
      } catch (err) {
        console.error('Failed to init GIS client:', err);
        setIsPickerLoading(false);
        addToast("Failed to initialize Google Auth", "error");
      }
    }
  }, [accessToken, addToast]);

  return { openPicker, isPickerLoading };
};
