/**
 * Cloudflare Worker for Avelut R2 Media Storage
 * Features:
 * - High-speed zero-egress CDN uploads & downloads
 * - Automatic "Burn-After-Download" (destroys file immediately after recipient downloads)
 * - Programmatic deletion for ephemeral AI chat attachments
 * - Global Edge CORS handling
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';

    // Global CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-File-Name, X-Burn-After-Download, X-User-Id',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const pathname = url.pathname;

    try {
      // 1. Health check / status
      if (pathname === '/' || pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', service: 'Avelut Cloudflare R2 Worker', timestamp: Date.now() }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. Upload Endpoint: POST /upload
      if (request.method === 'POST' && pathname === '/upload') {
        const burnAfterDownload = url.searchParams.get('burn') === 'true' ||
          request.headers.get('X-Burn-After-Download') === 'true';
        const customPath = url.searchParams.get('path');
        const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
        const fileNameHeader = request.headers.get('X-File-Name') || '';

        let fileBuffer;
        let mimeType = contentType;
        let originalFileName = fileNameHeader;

        // Check if multipart form data or raw binary stream
        if (contentType.includes('multipart/form-data')) {
          const formData = await request.formData();
          const file = formData.get('file');
          if (!file || typeof file === 'string') {
            return new Response(JSON.stringify({ error: 'No file provided in form data' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          fileBuffer = await file.arrayBuffer();
          mimeType = file.type || 'application/octet-stream';
          originalFileName = file.name || fileNameHeader || 'file';
        } else {
          fileBuffer = await request.arrayBuffer();
        }

        if (!fileBuffer || fileBuffer.byteLength === 0) {
          return new Response(JSON.stringify({ error: 'File content is empty' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const ext = originalFileName.split('.').pop() || mimeType.split('/')[1] || 'bin';
        const randomId = crypto.randomUUID().replace(/-/g, '');
        const fileKey = customPath || `media/${Date.now()}_${randomId}.${ext}`;

        // Store object in R2 bucket with custom metadata
        await env.R2_BUCKET.put(fileKey, fileBuffer, {
          httpMetadata: {
            contentType: mimeType,
            cacheControl: burnAfterDownload ? 'no-store, no-cache, must-revalidate' : 'public, max-age=31536000, immutable',
          },
          customMetadata: {
            burnAfterDownload: burnAfterDownload ? 'true' : 'false',
            uploadedAt: Date.now().toString(),
            originalName: encodeURIComponent(originalFileName),
          }
        });

        const downloadUrl = `${url.origin}/file/${fileKey}${burnAfterDownload ? '?burn=true' : ''}`;

        return new Response(JSON.stringify({
          success: true,
          key: fileKey,
          url: downloadUrl,
          size: fileBuffer.byteLength,
          contentType: mimeType,
          burnAfterDownload,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 3. File Retrieval Endpoint: GET /file/:key (with Auto-Delete / Burn-after-download)
      if (request.method === 'GET' && pathname.startsWith('/file/')) {
        const fileKey = decodeURIComponent(pathname.substring('/file/'.length));
        if (!fileKey) {
          return new Response('File key missing', { status: 400, headers: corsHeaders });
        }

        const object = await env.R2_BUCKET.get(fileKey);
        if (!object) {
          return new Response('File not found or already burned/deleted', {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
          });
        }

        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);

        const isBurnRequested = url.searchParams.get('burn') === 'true' ||
          object.customMetadata?.burnAfterDownload === 'true';

        // If burn-after-download is set, schedule immediate background deletion
        if (isBurnRequested) {
          ctx.waitUntil(
            (async () => {
              try {
                // Short safety delay to ensure recipient stream finishes downloading
                await new Promise((r) => setTimeout(r, 4000));
                await env.R2_BUCKET.delete(fileKey);
                console.log(`[R2 Auto-Burn] Successfully destroyed key: ${fileKey}`);
              } catch (err) {
                console.error(`[R2 Auto-Burn] Failed to destroy key: ${fileKey}`, err);
              }
            })()
          );
        }

        return new Response(object.body, { headers });
      }

      // 4. Manual Deletion Endpoint: DELETE /file/:key (used after AI response completion)
      if (request.method === 'DELETE' && pathname.startsWith('/file/')) {
        const fileKey = decodeURIComponent(pathname.substring('/file/'.length));
        if (!fileKey) {
          return new Response('File key missing', { status: 400, headers: corsHeaders });
        }

        await env.R2_BUCKET.delete(fileKey);
        return new Response(JSON.stringify({ success: true, deletedKey: fileKey }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not found', { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error('[R2 Worker Error]', err);
      return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
