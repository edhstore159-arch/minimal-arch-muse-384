import { useEffect, useState } from 'react';
import { requestLocationPermission } from '../utils/geolocation';

const STORAGE_KEY = 'svc:user-location:v1';
const EVENT = 'svc:user-location-change';

let current = null;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) current = JSON.parse(raw);
} catch {}

const broadcast = () => {
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: current })); } catch {}
};

export const getUserLocation = () => current;

export const setUserLocation = (loc) => {
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
  current = { ...loc, updatedAt: Date.now() };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch {}
  broadcast();
  return current;
};

export const clearUserLocation = () => {
  current = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  broadcast();
};

export const refreshUserLocationAuto = async ({ forceBrowser = false, silent = true } = {}) => {
  const loc = await requestLocationPermission({ forceBrowser, showToast: !silent });
  if (loc) return setUserLocation(loc);
  return null;
};

// Live GPS watcher when permission already granted
let watchStarted = false;
export const startUserLocationWatch = () => {
  if (watchStarted || typeof navigator === 'undefined' || !navigator.geolocation) return;
  watchStarted = true;
  const begin = () => {
    try {
      navigator.geolocation.watchPosition(
        (p) => setUserLocation({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          source: 'gps-watch',
        }),
        () => {},
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
      );
    } catch {}
  };
  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' })
      .then((p) => { if (p.state === 'granted') begin(); })
      .catch(() => {});
  }
};

export const useUserLocation = () => {
  const [location, setLocation] = useState(current);
  useEffect(() => {
    const handler = (e) => setLocation(e.detail);
    window.addEventListener(EVENT, handler);
    if (!current) {
      // Detecta automaticamente (IP, sem prompt) na primeira montagem global
      refreshUserLocationAuto({ silent: true });
    }
    startUserLocationWatch();
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return {
    location,
    setManualLocation: setUserLocation,
    refreshAuto: refreshUserLocationAuto,
    clear: clearUserLocation,
  };
};
