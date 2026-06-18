## 2025-05-15 - [Icon-only Button Accessibility]
**Learning:** Many interactive elements in the chat interface (AvelutAI) were implemented as icon-only buttons without `aria-label` or `title` attributes, making them inaccessible to screen readers and providing no visual hint on hover.
**Action:** Always ensure icon-only buttons have descriptive `aria-label` for screen readers and `title` for native hover tooltips.

## 2025-05-15 - [Chat Message Utility]
**Learning:** Users often need to copy AI-generated content for use in other documents. Providing a discrete "Copy" button within the message bubble improves utility without cluttering the UI.
**Action:** Include a "Copy" action with immediate feedback (toast) for long-form AI responses.

## 2026-06-18 - [Password Visibility Toggles]
**Learning:** Authentication forms (Login, SignUp, Admin) significantly benefit from password visibility toggles to reduce entry errors, especially on mobile. Standardizing these across the app ensures a cohesive experience.
**Action:** Implement a consistent password toggle pattern using relative positioning and accessible buttons (`aria-label`, `title`) in all password-related inputs.
