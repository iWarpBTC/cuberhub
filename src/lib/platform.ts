/**
 * True in the app opened from an iPhone's (or iPad's) home screen, where it runs in its own window
 * without a browser around it. `navigator.standalone` is Apple's own flag for exactly that.
 */
export const IOS_APP: boolean = typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true;
