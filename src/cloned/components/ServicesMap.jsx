import React, { useEffect, useState, useMemo } from 'react';
import { GoogleMap, LoadScript, Marker, InfoWindow } from '@react-google-maps/api';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, Loader2 } from 'lucide-react';

/**
 * Mapa com:
 * - Prestadores/voluntários (svc_profiles role helper/volunteer com lat/lng)
 * - Pedidos de ajuda (svc_posts com post_type != 'volunteer' e lat/lng)
 *
 * Os pedidos de ajuda só serão retornados pelo Supabase para usuários com
 * permissão (voluntários/admin) por causa das RLS policies já existentes.
 */
export default function ServicesMap({ height = 400, showHelpRequests = true }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
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
          ? supabase
              .from('svc_posts')
              .select('id, title, description, lat, lng, post_type, address')
              .neq('post_type', 'volunteer')
              .not('lat', 'is', null)
              .not('lng', 'is', null)
              .limit(200)
          : Promise.resolve({ data: [] }),
      ]);
      setHelpers(profs || []);
      setRequests(reqRes.data || []);
      setLoading(false);
    })();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {}
      );
    }
  }, [showHelpRequests]);

  const center = useMemo(() => {
    if (userLoc) return userLoc;
    if (helpers[0]?.lat) return { lat: helpers[0].lat, lng: helpers[0].lng };
    if (requests[0]?.lat) return { lat: requests[0].lat, lng: requests[0].lng };
    return { lat: 48.8566, lng: 2.3522 };
  }, [userLoc, helpers, requests]);

  if (!apiKey) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
        Configure <code>VITE_GOOGLE_MAPS_API_KEY</code> para exibir o mapa.
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-100" style={{ height }}>
      {loading && (
        <div className="absolute inset-0 z-10 bg-white/60 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" />
        </div>
      )}
      <LoadScript googleMapsApiKey={apiKey}>
        <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={center} zoom={12}>
          {userLoc && (
            <Marker
              position={userLoc}
              icon={{ url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' }}
              title="Você"
            />
          )}

          {helpers.map((h) => (
            <Marker
              key={`h-${h.user_id}`}
              position={{ lat: h.lat, lng: h.lng }}
              icon={{ url: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png' }}
              title={`${h.display_name} (${h.role === 'volunteer' ? 'Voluntário' : 'Prestador'})`}
              onClick={() => setSelected({ type: 'helper', data: h })}
            />
          ))}

          {requests.map((r) => (
            <Marker
              key={`r-${r.id}`}
              position={{ lat: r.lat, lng: r.lng }}
              icon={{ url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png' }}
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
      </LoadScript>

      <div className="absolute bottom-2 left-2 bg-white/95 rounded-lg px-3 py-1.5 text-xs shadow flex items-center gap-3">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Voluntários/Prestadores</span>
        {showHelpRequests && (
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Pedidos de ajuda</span>
        )}
      </div>
    </div>
  );
}
