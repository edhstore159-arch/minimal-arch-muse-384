import React, { useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, StreetViewPanorama } from '@react-google-maps/api';
import { Map as MapIcon, Eye } from 'lucide-react';
import { modernMapStyle, pinIcon } from './mapStyle';
import { getGoogleMapsBrowserKey, getGoogleMapsChannel, MapFallback } from './googleMapsConfig';

const MiniGoogleMap = ({ lat, lng, height = 200, zoom = 15, color = '#ef4444' }) => {
  const [showStreetView, setShowStreetView] = useState(false);
  const apiKey = getGoogleMapsBrowserKey();
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    channel: getGoogleMapsChannel(),
    preventGoogleFontsLoading: true,
  });

  if (!apiKey || loadError || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return <MapFallback height={height} />;
  }

  if (!isLoaded) {
    return <div style={{ height }} className="bg-gray-100 animate-pulse rounded-xl" />;
  }

  const position = { lat, lng };

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ height }}>
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
        <Marker position={position} icon={{ url: pinIcon(color) }} />
        {showStreetView && (
          <StreetViewPanorama
            position={position}
            visible
            options={{
              addressControl: false,
              fullscreenControl: false,
              motionTracking: false,
              motionTrackingControl: false,
              enableCloseButton: false,
            }}
          />
        )}
      </GoogleMap>
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
