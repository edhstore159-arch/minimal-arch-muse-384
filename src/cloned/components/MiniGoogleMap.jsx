import React from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { modernMapStyle, pinIcon } from './mapStyle';

const MiniGoogleMap = ({ lat, lng, height = 200, zoom = 15, color = '#ef4444' }) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
  });

  if (!apiKey) {
    return (
      <div style={{ height }} className="flex items-center justify-center bg-gray-50 text-xs text-gray-500">
        Mapa indisponível
      </div>
    );
  }

  if (!isLoaded) {
    return <div style={{ height }} className="bg-gray-100 animate-pulse" />;
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height, borderRadius: '12px' }}
      center={{ lat, lng }}
      zoom={zoom}
      options={{
        styles: modernMapStyle,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: 'cooperative',
        backgroundColor: '#f5f5f7',
      }}
    >
      <Marker position={{ lat, lng }} icon={{ url: pinIcon(color) }} />
    </GoogleMap>
  );
};

export default MiniGoogleMap;
