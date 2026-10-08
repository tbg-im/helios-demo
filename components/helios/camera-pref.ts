/**
 * Whether the presenter turned on the camera glow. Kept in memory and in
 * localStorage, so it survives a reload when storage works and still toggles
 * when it doesn't.
 */
const KEY = 'helios-camera';
const listeners = new Set<() => void>();
let cameraOn: boolean | null = null;

export function getCameraPref(): boolean {
  if (cameraOn === null) {
    try {
      cameraOn = localStorage.getItem(KEY) === 'on';
    } catch {
      cameraOn = false;
    }
  }
  return cameraOn;
}

export function setCameraPref(on: boolean) {
  cameraOn = on;
  try {
    if (on) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable (private mode): the choice lasts until reload.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeCameraPref(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
