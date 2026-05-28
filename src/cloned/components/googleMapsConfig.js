export function getGoogleMapsBrowserKey() {
  const key =
    import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY ||
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    '';

  return key && key !== 'undefined' && key !== 'null' ? key : '';
}

export function getGoogleMapsChannel() {
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID || '';
  return channel && channel !== 'undefined' && channel !== 'null' ? channel : undefined;
}

export function MapFallback({ height = 200, message = 'Mapa indisponível no momento' }) {
  return (
    <div
      style={{ height }}
      className="flex h-full min-h-[140px] items-center justify-center bg-muted text-xs font-medium text-muted-foreground"
    >
      {message}
    </div>
  );
}