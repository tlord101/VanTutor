/** firebase/storage → Supabase Storage bucket `uploads` */
import { supabase } from '../supabaseClient';

export type FirebaseStorage = { app: { name: string } };

export function getStorage(_app?: any): FirebaseStorage {
  return { app: { name: 'supabase-storage' } };
}

export function ref(_storage: any, path: string) {
  return { fullPath: path, toString: () => path };
}

export async function uploadBytes(pathRef: { fullPath: string }, data: Blob) {
  const path = pathRef.fullPath;
  const { error } = await supabase.storage.from('uploads').upload(path, data, { upsert: true });
  if (error) throw error;
  return { metadata: { fullPath: path }, ref: pathRef };
}

export function uploadBytesResumable(pathRef: { fullPath: string }, data: Blob) {
  const task: any = {
    on(_event: string, next?: any, error?: any, complete?: any) {
      void uploadBytes(pathRef, data)
        .then(() => {
          next?.({ bytesTransferred: data.size, totalBytes: data.size, state: 'success' });
          complete?.();
        })
        .catch((e) => error?.(e));
      return task;
    },
    snapshot: { ref: pathRef },
    then(ok: any, fail?: any) {
      return uploadBytes(pathRef, data).then(ok, fail);
    },
  };
  return task;
}

export async function getDownloadURL(pathRef: { fullPath: string }) {
  const { data } = supabase.storage.from('uploads').getPublicUrl(pathRef.fullPath);
  return data.publicUrl;
}

export async function deleteObject(pathRef: { fullPath: string }) {
  await supabase.storage.from('uploads').remove([pathRef.fullPath]);
}
