## 2025-05-14 - [Architectural Redundancy in Component Rendering]
**Learning:** Large feature components (like `AdminPanel`) were being imported and rendered in multiple high-level files (`App.tsx` and `MainContent.tsx`). Static imports in either file would pull the component into the main bundle even if the other used lazy loading.
**Action:** Always check all potential entry points and parent components for static imports of large modules when implementing code splitting to ensure they are properly chunked out of the main bundle.

## 2026-06-26 - [Hook Dependency Narrowing]
**Learning:** Using a large, frequently updated object (like `userProfile` with a `last_seen` timestamp) as a dependency in high-level hooks (like AI client `useMemo` or data-sync `useEffect`) causes massive performance overhead.
**Action:** Always narrow dependencies to the specific primitive fields required by the hook logic to isolate them from unrelated state changes.
