## 2025-05-14 - [Architectural Redundancy in Component Rendering]
**Learning:** Large feature components (like `AdminPanel`) were being imported and rendered in multiple high-level files (`App.tsx` and `MainContent.tsx`). Static imports in either file would pull the component into the main bundle even if the other used lazy loading.
**Action:** Always check all potential entry points and parent components for static imports of large modules when implementing code splitting to ensure they are properly chunked out of the main bundle.

## 2026-06-26 - [Hook Dependency Narrowing]
**Learning:** Using a large, frequently updated object (like `userProfile` with a `last_seen` timestamp) as a dependency in high-level hooks (like AI client `useMemo` or data-sync `useEffect`) causes massive performance overhead.
**Action:** Always narrow dependencies to the specific primitive fields required by the hook logic to isolate them from unrelated state changes.

## 2026-06-27 - [Stable Profile Pattern for Global Layouts]
**Learning:** Frequent background heartbeats (like `last_seen` or `is_online`) updated via Firebase trigger full-app re-renders when the entire `userProfile` object is used as a prop or context.
**Action:** Implement a `stableUserProfile` using `useMemo` that excludes volatile fields, ensuring that core layout components (Sidebar, Header, etc.) only re-render on meaningful profile changes.

## 2026-06-27 - [Leveraging Database Sort Order]
**Learning:** Performing a client-side `.sort()` ($O(n \log n)$) on data already ordered by the database (via Firebase `orderByChild`) is redundant and wastes CPU cycles, especially as lists grow.
**Action:** Trust the database sort order and use a simple $O(n)$ `.reverse()` if the display order needs to be inverted, rather than re-sorting the entire array.
