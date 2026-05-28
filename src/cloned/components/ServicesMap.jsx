import React, { useEffect, useState, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, Loader2 } from 'lucide-react';
import { modernMapStyle, pinIcon, dotIcon } from './mapStyle';
import { getGoogleMapsBrowserKey, getGoogleMapsChannel, MapFallback } from './googleMapsConfig';

/**
 * Mapa com:
 * - Prestadores/voluntários (svc_profiles role helper/volunteer com lat/lng)
 * - Pedidos de ajuda (svc_posts com post_type != 'volunteer' e lat/lng)
 *
 * Os pedidos de ajuda só serão retornados pelo Supabase para usuários com
 * permissão (voluntários/admin) por causa das RLS policies já existentes.
 */
const distanceKm = (a, b) => {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export default function ServicesMap({ height = 400, showHelpRequests = true, postTypeFilter = 'needs', categories = [], radiusKm = 0, userLocation = null }) {
  const apiKey = getGoogleMapsBrowserKey();
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey || '',
    channel: getGoogleMapsChannel(),
    preventGoogleFontsLoading: true,
  });
  const [helpers, setHelpers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [userLoc, setUserLoc] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: profs }, reqRes] = await Promise.all([
        supabase
          .from('svc_profiles')
          .select('user_id, display_name, role, avatar_url, lat, lng, categories')
          .in('role', ['helper', 'volunteer'])
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .limit(200),
        showHelpRequests
          ? (() => {
              let query = supabase
                .from('svc_posts')
                .select('id, title, description, lat, lng, post_type, address, category_slug, status')
                .eq('status', 'open')
                .not('lat', 'is', null)
                .not('lng', 'is', null)
                .limit(200);
              if (postTypeFilter === 'needs') query = query.neq('post_type', 'volunteer');
              if (postTypeFilter === 'offers') query = query.eq('post_type', 'volunteer');
              return query;
            })()
          : Promise.resolve({ data: [] }),
      ]);
      setHelpers(profs || []);
      const selectedCategories = (categories || []).filter(Boolean);
      const filteredRequests = (reqRes.data || []).filter((request) => {
        if (selectedCategories.length && !selectedCategories.includes(request.category_slug)) return false;
        const distance = distanceKm(userLocation, request);
        if (distance != null && radiusKm > 0) return distance <= radiusKm;
        return true;
      });
      setRequests(filteredRequests);
      setLoading(false);
    })();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {}
      );
    }
  }, [showHelpRequests, postTypeFilter, categories, radiusKm, userLocation?.lat, userLocation?.lng]);

  const center = useMemo(() => {
    if (userLoc) return userLoc;
    if (helpers[0]?.lat) return { lat: helpers[0].lat, lng: helpers[0].lng };
    if (requests[0]?.lat) return { lat: requests[0].lat, lng: requests[0].lng };
    return { lat: 48.8566, lng: 2.3522 };
  }, [userLoc, helpers, requests]);

  if (!apiKey || loadError) {
    return <MapFallback height={height} />;
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border shadow-lg ring-1 ring-black/5" style={{ height }}>
      {(loading || !isLoaded) && (
        <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-sm flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" />
        </div>
      )}
      {isLoaded && (
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={center}
          zoom={12}
          options={{
            styles: modernMapStyle,
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
            gestureHandling: 'greedy',
            backgroundColor: '#f5f5f7',
          }}
        >
          {userLoc && (
            <Marker position={userLoc} icon={{ url: dotIcon('#3b82f6') }} title="Você" />
          )}

          {helpers.map((h) => (
            <Marker
              key={`h-${h.user_id}`}
              position={{ lat: h.lat, lng: h.lng }}
              icon={{ url: pinIcon('#10b981') }}
              title={`${h.display_name} (${h.role === 'volunteer' ? 'Voluntário' : 'Prestador'})`}
              onClick={() => setSelected({ type: 'helper', data: h })}
            />
          ))}

          {requests.map((r) => (
            <Marker
              key={`r-${r.id}`}
              position={{ lat: r.lat, lng: r.lng }}
              icon={{ url: pinIcon('#ef4444') }}
              title={r.title}
              onClick={() => setSelected({ type: 'request', data: r })}
            />
          ))}

          {selected && (
            <InfoWindow
              position={{ lat: selected.data.lat, lng: selected.data.lng }}
              onCloseClick={() => setSelected(null)}
            >
              <div className="max-w-[220px]">
                {selected.type === 'helper' ? (
                  <>
                    <p className="font-semibold text-sm">{selected.data.display_name}</p>
                    <p className="text-xs text-gray-500 capitalize">
                      {selected.data.role === 'volunteer' ? 'Voluntário' : 'Prestador'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-sm">{selected.data.title}</p>
                    {selected.data.address && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <MapPin size={10} /> {selected.data.address}
                      </p>
                    )}
                  </>
                )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      )}

      <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-md rounded-full px-4 py-2 text-xs shadow-lg ring-1 ring-black/5 flex items-center gap-4 font-medium">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-100" /> Voluntários</span>
        {showHelpRequests && (
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-100" /> Pedidos</span>
        )}
        {userLoc && (
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-100" /> Você</span>
        )}
      </div>
    </div>
  );
}
