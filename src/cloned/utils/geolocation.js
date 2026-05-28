import { toast } from 'sonner';

/**
 * Obtém localização aproximada via IP (sem prompt de permissão).
 * Útil como fallback automático quando o usuário não concede acesso ao GPS.
 */
export const getIpLocation = async () => {
  try {
    const providers = [
      async () => {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) throw new Error('ipapi failed');
        const data = await res.json();
        return {
          lat: data.latitude,
          lng: data.longitude,
          city: data.city,
          region: data.region,
          country: data.country_name,
        };
      },
      async () => {
        const res = await fetch('https://ipwho.is/?fields=success,city,region,country,latitude,longitude');
        if (!res.ok) throw new Error('ipwho failed');
        const data = await res.json();
        if (data.success === false) throw new Error('ipwho unsuccessful');
        return {
          lat: data.latitude,
          lng: data.longitude,
          city: data.city,
          region: data.region,
          country: data.country,
        };
      },
    ];

    for (const provider of providers) {
      try {
        const data = await provider();
        if (typeof data.lat !== 'number' || typeof data.lng !== 'number') continue;
        return {
          lat: data.lat,
          lng: data.lng,
          accuracy: 50000, // cidade
          city: data.city || '',
          region: data.region || '',
          country: data.country || '',
          address: [data.city, data.region, data.country].filter(Boolean).join(', '),
          source: 'ip',
        };
      } catch (_) {
        /* tenta próximo provedor */
      }
    }
    throw new Error('no ip provider coords');
  } catch (e) {
    console.log('IP geolocation falhou:', e);
    return null;
  }
};

/**
 * Solicita localização do usuário.
 * - Por padrão tenta obter a posição AUTOMATICAMENTE via IP, sem mostrar prompts.
 * - Se a permissão de GPS já estiver concedida, usa o GPS (mais preciso).
 * - Passe { forceBrowser: true } para forçar o pedido nativo de permissão do navegador.
 *
 * @param {Object} options
 * @returns {Promise<{lat: number, lng: number, address?: string}|null>}
 */
export const requestLocationPermission = async (options = {}) => {
  const {
    onStart = () => {},
    onSuccess = () => {},
    onError = () => {},
    showToast = false,
    fallbackLocation = null,
    forceBrowser = false,
  } = options;

  onStart();

  // Descobrir o estado da permissão sem disparar o prompt
  let permState = 'unknown';
  try {
    if (navigator.permissions) {
      const p = await navigator.permissions.query({ name: 'geolocation' });
      permState = p.state; // 'granted' | 'denied' | 'prompt'
    }
  } catch (_) {
    /* ignore */
  }

  const tryBrowserGeo = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const location = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            source: 'gps',
          };
          try {
            const r = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lng}`
            );
            const d = await r.json();
            if (d?.display_name) location.address = d.display_name;
            const a = d?.address || {};
            location.city = a.city || a.town || a.village || a.municipality || a.county || '';
            location.region = a.state || a.region || '';
            location.country = a.country || '';
          } catch (_) {
            /* ignore */
          }
          resolve(location);
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });

  // 1) Se já concedido ou explicitamente forçado, tente o navegador
  if (permState === 'granted' || forceBrowser) {
    const browserLoc = await tryBrowserGeo();
    if (browserLoc) {
      if (showToast) toast.success('📍 Localização obtida');
      onSuccess(browserLoc);
      return browserLoc;
    }
  }

  // 2) Caso contrário, faça automaticamente via IP (sem prompt)
  const ipLoc = await getIpLocation();
  if (ipLoc) {
    onSuccess(ipLoc);
    return ipLoc;
  }

  const err = new Error('Não foi possível obter localização automaticamente');
  onError(err);
  return fallbackLocation;
};

/**
 * Verifica o status da permissão de localização
 */
export const checkLocationPermission = async () => {
  if (!navigator.geolocation) return 'unavailable';
  if (!navigator.permissions) return 'unknown';
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    return permission.state;
  } catch (_) {
    return 'unknown';
  }
};

/**
 * Mostra instruções para ativar localização (uso opcional)
 */
export const showLocationInstructions = () => {
  toast.info('🗺️ Como ativar a localização', {
    description:
      '📱 No celular: Configurações > Apps > Navegador > Permissões > Localização\n' +
      '💻 No computador: clique no cadeado 🔒 ao lado da URL > Permissões > Localização',
    duration: 12000,
  });
};
