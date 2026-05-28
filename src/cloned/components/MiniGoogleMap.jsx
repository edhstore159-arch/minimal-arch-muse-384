import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { Map as MapIcon, Eye } from 'lucide-react';
import { modernMapStyle, pinIcon } from './mapStyle';
import { getGoogleMapsBrowserKey, getGoogleMapsChannel, MapFallback } from './googleMapsConfig';

const StreetViewPanel = ({ position, height, visible, panoramaData }) => {
  const containerRef = useRef(null);
  const panoramaRef = useRef(null);

  useEffect(() => {
    if (!visible || !panoramaData || !containerRef.current || !window.google?.maps) return;

    const panoramaOptions = {
      pano: panoramaData.location?.pano,
      position: panoramaData.location?.latLng || position,
      pov: { heading: 0, pitch: 0 },
      zoom: 0,
      addressControl: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
      panControl: false,
      zoomControl: true,
      linksControl: true,
      enableCloseButton: false,
    };

    if (!panoramaRef.current) {
      panoramaRef.current = new window.google.maps.StreetViewPanorama(containerRef.current, panoramaOptions);
    } else {
      panoramaRef.current.setOptions(panoramaOptions);
    }
  }, [panoramaData, position, visible]);

  return <div ref={containerRef} style={{ width: '100%', height, display: visible ? 'block' : 'none' }} />;
};

const MiniGoogleMap = ({ lat, lng, height = 200, zoom = 15, color = '#ef4444' }) => {
  const [showStreetView, setShowStreetView] = useState(false);
  const [panoramaData, setPanoramaData] = useState(null);
  const [streetViewStatus, setStreetViewStatus] = useState('idle');
  const apiKey = getGoogleMapsBrowserKey();
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    channel: getGoogleMapsChannel(),
    preventGoogleFontsLoading: true,
  });

  const position = useMemo(() => ({ lat, lng }), [lat, lng]);

  useEffect(() => {
    if (!isLoaded || !Number.isFinite(lat) || !Number.isFinite(lng) || !window.google?.maps) return;

    let cancelled = false;
    setStreetViewStatus('loading');

    const service = new window.google.maps.StreetViewService();
    service.getPanorama(
      {
        location: position,
        radius: 120,
        source: window.google.maps.StreetViewSource.OUTDOOR,
      },
      (data, status) => {
        if (cancelled) return;

        if (status === window.google.maps.StreetViewStatus.OK && data?.location) {
          setPanoramaData(data);
          setStreetViewStatus('ready');
          return;
        }

        setPanoramaData(null);
        setStreetViewStatus('unavailable');
      }
    );

    return () => {
      cancelled = true;
    };
  }, [isLoaded, lat, lng, position]);

  if (!apiKey || loadError || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return <MapFallback height={height} />;
  }

  if (!isLoaded) {
    return <div style={{ height }} className="bg-gray-100 animate-pulse rounded-xl" />;
  }

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ height }}>
      <StreetViewPanel position={position} height={height} visible={showStreetView && streetViewStatus === 'ready'} panoramaData={panoramaData} />

      {(!showStreetView || streetViewStatus !== 'ready') && (
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={position}
          zoom={zoom}
          options={{
            styles: modernMapStyle,
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
            gestureHandling: 'cooperative',
            backgroundColor: '#f5f5f7',
            streetViewControl: false,
          }}
        >
          <Marker
            position={position}
            title="Localização"
            zIndex={9999}
          />
          <Marker
            position={position}
            icon={{
              url: pinIcon(color),
              scaledSize: new window.google.maps.Size(40, 48),
              anchor: new window.google.maps.Point(20, 46),
            }}
            zIndex={10000}
          />
        </GoogleMap>
      )}

      {showStreetView && streetViewStatus === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/75 text-xs font-semibold text-foreground backdrop-blur-sm">
          Carregando Street View...
        </div>
      )}

      {showStreetView && streetViewStatus === 'unavailable' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 px-4 text-center text-xs font-semibold text-foreground backdrop-blur-sm">
          Street View indisponível para este local
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowStreetView((v) => !v);
        }}
        className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 hover:bg-white shadow-md text-xs font-medium text-gray-800 backdrop-blur"
        title={showStreetView ? 'Ver mapa' : 'Ver Street View'}
      >
        {showStreetView ? <MapIcon size={14} /> : <Eye size={14} />}
        {showStreetView ? 'Mapa' : 'Street View'}
      </button>
    </div>
  );
};

export default MiniGoogleMap;
