import { createClient } from '@supabase/supabase-js';

// NOTE: This file should be deployed as a Supabase Edge Function.
// Follow the instructions in `supabase.ts` to deploy this cron job.
// Command to deploy:
// supabase functions deploy cron/delete-old-media --schedule "0 0 * * *"

// FIX: Declare Deno to resolve TypeScript errors in a non-Deno environment.
declare const Deno: any;

const BUCKETS_TO_CLEAN = ['private-chats', 'chat-media'];
const TIME_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

Deno.serve(async (req) => {
  try {
    // Create a Supabase client with the appropriate permissions
    // The `service_role` key is required for admin-level operations like bypassing RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();
    const timeLimit = new Date(now.getTime() - TIME_LIMIT_MS);
    
    console.log(`Starting media cleanup process. Deleting files older than ${timeLimit.toISOString()}`);

    let totalFilesDeleted = 0;

    for (const bucket of BUCKETS_TO_CLEAN) {
      console.log(`Processing bucket: ${bucket}`);
      
      const { data: files, error: listError } = await supabaseAdmin.storage
        .from(bucket)
        .list('', {
          limit: 1000, // Process up to 1000 files per run to avoid timeouts
          sortBy: { column: 'created_at', order: 'asc' },
        });

      if (listError) {
        console.error(`Error listing files in bucket ${bucket}:`, listError);
        continue; // Skip to the next bucket
      }

      const filesToDelete = files.filter(file => 
        file.created_at && new Date(file.created_at) < timeLimit
      );
      
      if (filesToDelete.length > 0) {
        const filePaths = filesToDelete.map(file => file.name);
        console.log(`Found ${filePaths.length} files to delete in ${bucket}.`);

        const { data: deleteData, error: deleteError } = await supabaseAdmin.storage
          .from(bucket)
          .remove(filePaths);

        if (deleteError) {
          console.error(`Error deleting files from bucket ${bucket}:`, deleteError);
        } else {
          console.log(`Successfully deleted ${deleteData?.length || 0} files from ${bucket}.`);
          totalFilesDeleted += deleteData?.length || 0;
        }
      } else {
        console.log(`No old files to delete in ${bucket}.`);
      }
    }

    const responseMessage = `Media cleanup complete. Total files deleted: ${totalFilesDeleted}.`;
    console.log(responseMessage);

    return new Response(JSON.stringify({ message: responseMessage }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('An unexpected error occurred in the cron job:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
