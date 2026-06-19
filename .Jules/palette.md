## 2025-05-15 - [Icon-only Button Accessibility]
**Learning:** Many interactive elements in the chat interface (AvelutAI) were implemented as icon-only buttons without `aria-label` or `title` attributes, making them inaccessible to screen readers and providing no visual hint on hover.
**Action:** Always ensure icon-only buttons have descriptive `aria-label` for screen readers and `title` for native hover tooltips.

## 2025-05-15 - [Chat Message Utility]
**Learning:** Users often need to copy AI-generated content for use in other documents. Providing a discrete "Copy" button within the message bubble improves utility without cluttering the UI.
**Action:** Include a "Copy" action with immediate feedback (toast) for long-form AI responses.

## 2025-05-16 - [Password Visibility Toggles]
**Learning:** Authentication forms (Login and SignUp) should consistently include a password visibility toggle feature to improve usability. However, removing default focus outlines (`focus:outline-none`) for these toggles without providing an alternative (`focus-visible:ring`) breaks keyboard accessibility.
**Action:** Always implement password toggles with `focus-visible:ring-2` to ensure they are accessible to non-mouse users.
