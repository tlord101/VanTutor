/** firebase/functions stub */
export function getFunctions(_app?: any) {
  return null;
}

export function httpsCallable(_functions: any, name: string) {
  return async (_data?: any) => {
    console.warn(`[shim] Cloud Function '${name}' not available — use a Supabase Edge Function.`);
    return { data: null };
  };
}
