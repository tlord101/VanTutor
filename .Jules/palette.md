## 2025-05-15 - [Icon-only Button Accessibility]
**Learning:** Many interactive elements in the chat interface (AvelutAI) were implemented as icon-only buttons without `aria-label` or `title` attributes, making them inaccessible to screen readers and providing no visual hint on hover.
**Action:** Always ensure icon-only buttons have descriptive `aria-label` for screen readers and `title` for native hover tooltips.

## 2025-05-15 - [Chat Message Utility]
**Learning:** Users often need to copy AI-generated content for use in other documents. Providing a discrete "Copy" button within the message bubble improves utility without cluttering the UI.
**Action:** Include a "Copy" action with immediate feedback (toast) for long-form AI responses.

## 2025-06-20 - [Automated Testing of Password Toggles]
**Learning:** When implementing password visibility toggles, standard Playwright locators like `get_by_role('textbox', name='Password')` will fail when the input is in `type="password"` mode, as it no longer carries the 'textbox' role. Additionally, multiple elements (input and toggle button) might share the same ARIA label or text, causing strict mode violations.
**Action:** Use unique `id` and `htmlFor` attributes for all form inputs. For testing toggles, prefer targeting by label (`get_by_label`) or specific CSS selectors to ensure the element is found regardless of its current `type` attribute.

## 2025-05-20 - [Multi-Modal Copy Feedback]
**Learning:** For critical utility actions like "Copy", providing feedback across multiple modes (visual icon change, text update, toast, and haptic feedback) ensures the user is immediately aware of success regardless of their focus or device type.
**Action:** Implement a stateful copy interaction that toggles between 'Copy' and 'Copied!' states (with icon change) for 2 seconds, triggers `triggerHaptic()`, and shows a toast. Ensure `aria-label` and `title` attributes are updated dynamically for accessibility.
