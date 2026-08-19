// Prevent browser extensions (like Google Translate, password managers, MetaMask) from crashing React.
if (typeof Node !== 'undefined' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      console.warn('removeChild: node is not a child of this parent.', child, this);
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn('insertBefore: referenceNode is not a child of this parent.', referenceNode, this);
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}

// Global app constants
(window as any).__app_id = (window as any).__app_id || 'avelut-app';

// PWA deferred prompt handler
if (typeof window !== 'undefined') {
  (window as any).deferredPrompt = (window as any).deferredPrompt || null;
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    (window as any).deferredPrompt = e;
    window.dispatchEvent(new CustomEvent('pwa-prompt-available'));
  });
  window.addEventListener('appinstalled', () => {
    (window as any).deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });
}

export {};
