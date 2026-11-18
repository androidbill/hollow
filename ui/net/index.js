// Picks how rooms are shared: Firebase if a config is present (and loads), else
// between tabs on this device.
import { FIREBASE_CONFIG } from './firebase-config.js';
import { createLocalTransport } from './local.js';

export async function connectTransport() {
  if (FIREBASE_CONFIG) {
    try {
      const { createFirebaseTransport } = await import('./firebase.js');
      return { net: await createFirebaseTransport(FIREBASE_CONFIG), note: 'Online: rooms are shared across devices.' };
    } catch (err) {
      console.warn('Firebase failed to load, falling back to this device only', err);
      return { net: createLocalTransport(), note: 'Could not reach Firebase. Rooms work between tabs on this device only.' };
    }
  }
  return { net: createLocalTransport(), note: 'Rooms work between tabs on this device. Add a Firebase config for online play.' };
}
