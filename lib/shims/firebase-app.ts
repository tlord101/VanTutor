/** Empty firebase/app shim — Firebase SDK removed */
export function initializeApp(_config?: any) {
  return { name: '[DEFAULT]', options: _config || {} };
}
export function getApp() {
  return initializeApp();
}
export function getApps() {
  return [initializeApp()];
}
