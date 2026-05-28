// Modern, minimal map style inspired by Apple Maps / Mapbox Light
export const modernMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f7' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#e5e7eb' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dcfce7' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#16a34a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fde68a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#fbbf24' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#bfdbfe' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3b82f6' }] },
];

// Build a colored SVG pin data URL for markers
export function pinIcon(color = '#ef4444', stroke = '#ffffff') {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='44' viewBox='0 0 36 44'>
    <defs><filter id='s' x='-20%' y='-20%' width='140%' height='140%'>
      <feDropShadow dx='0' dy='2' stdDeviation='1.5' flood-color='#000' flood-opacity='0.25'/>
    </filter></defs>
    <path filter='url(#s)' d='M18 2C9.7 2 3 8.7 3 17c0 11 15 25 15 25s15-14 15-25c0-8.3-6.7-15-15-15z' fill='${color}' stroke='${stroke}' stroke-width='2'/>
    <circle cx='18' cy='17' r='5.5' fill='${stroke}'/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function jobPinIcon(color = '#2563eb', emoji = '💼') {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='42' height='52' viewBox='0 0 42 52'>
    <defs><filter id='s' x='-20%' y='-20%' width='140%' height='140%'>
      <feDropShadow dx='0' dy='3' stdDeviation='2' flood-color='#000' flood-opacity='0.28'/>
    </filter></defs>
    <path filter='url(#s)' d='M21 2C11.6 2 4 9.6 4 19c0 12.5 17 30 17 30s17-17.5 17-30C38 9.6 30.4 2 21 2z' fill='${color}' stroke='#ffffff' stroke-width='2.5'/>
    <circle cx='21' cy='19' r='10.5' fill='#ffffff' fill-opacity='0.96'/>
    <text x='21' y='24' text-anchor='middle' font-size='14'>${emoji}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function dotIcon(color = '#3b82f6') {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>
    <circle cx='14' cy='14' r='10' fill='${color}' fill-opacity='0.25'/>
    <circle cx='14' cy='14' r='6' fill='${color}' stroke='#fff' stroke-width='2.5'/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
