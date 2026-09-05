import React from "react";
import type { UserProfile } from "../types";

// Temporary stub — full Chat.tsx must be restored from git history.
// git checkout 8dd6e97974060d424d5469dc9bf0e698de51f8e9 -- components/Chat.tsx

interface ChatProps {
  userProfile: UserProfile;
}

export const Chat: React.FC<ChatProps> = ({ userProfile }) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-black text-center">
      <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">Restoring Chat…</h2>
      <p className="text-sm text-neutral-500 max-w-md mb-4">
        Run this in your local clone, then push:
      </p>
      <pre className="text-left text-xs bg-neutral-100 dark:bg-neutral-900 p-4 rounded-xl overflow-x-auto max-w-full text-neutral-800 dark:text-neutral-200">
{`git fetch origin
git checkout 8dd6e97974060d424d5469dc9bf0e698de51f8e9 -- components/Chat.tsx
git add components/Chat.tsx
git commit -m "Restore Chat.tsx from 8dd6e979"
git push origin main`}
      </pre>
      <p className="mt-4 text-xs text-neutral-400">Signed in as {userProfile?.display_name || "user"}</p>
    </div>
  );
};
