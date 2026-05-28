import React, { useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { modernMapStyle, pinIcon, dotIcon } from './mapStyle';
import { getGoogleMapsBrowserKey, getGoogleMapsChannel, MapFallback } from './googleMapsConfig';

const GoogleMapComponent = ({ locations, userLocation, onClose }) => {
  const [map, setMap] = useState(null);
  const apiKey = getGoogleMapsBrowserKey();
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey || '',
    channel: getGoogleMapsChannel(),
    preventGoogleFontsLoading: true,
  });


  const mapContainerStyle = {
    width: '100%',
    height: '400px',
    borderRadius: '16px'
  };

  const mapOptions = {
    styles: modernMapStyle,
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
    gestureHandling: 'greedy',
    backgroundColor: '#f5f5f7',
  };

  const center = userLocation || {
    lat: 48.8566,
    lng: 2.3522 // Paris center
  };

  const onLoad = React.useCallback(function callback(map) {
    setMap(map);
  }, []);

  const onUnmount = React.useCallback(function callback(map) {
    setMap(null);
  }, []);

  if (!apiKey || loadError) {
    return <MapFallback height={400} />;
  }

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-lg ring-1 ring-black/5">
      {onClose && (
        <Button
          onClick={onClose}
          variant="ghost"
          size="sm"
          className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-md shadow-md rounded-full h-9 w-9 p-0"
        >
          <X className="w-4 h-4" />
        </Button>
      )}

      {!isLoaded ? (
        <div style={mapContainerStyle} className="bg-gray-100 animate-pulse" />
      ) : (
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={center}
          zoom={13}
          options={mapOptions}
          onLoad={onLoad}
          onUnmount={onUnmount}
        >
          {userLocation && (
            <Marker position={userLocation} icon={{ url: dotIcon('#3b82f6') }} title="Sua localização" />
          )}

          {locations && locations.map((location, index) => (
            <Marker
              key={index}
              position={{ lat: location.latitude, lng: location.longitude }}
              title={location.name}
              icon={{ url: pinIcon('#ef4444') }}
            />
          ))}
        </GoogleMap>
      )}
    </div>
  );
};

export default GoogleMapComponent;
