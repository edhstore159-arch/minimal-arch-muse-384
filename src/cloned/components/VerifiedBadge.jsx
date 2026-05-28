import React from 'react';

// Meta-style verified blue badge (scalloped/wavy circle + white check)
export function VerifiedBadge({ size = 18, className = '', title = 'Perfil verificado' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={`inline-block align-middle ${className}`}
      aria-label={title}
      role="img"
    >
      <title>{title}</title>
      {/* Meta scalloped shape: 8-lobed wave around a circle */}
      <path
        fill="#1877F2"
        d="M20 2.2l3.2 2.6 4.1-.6 1.8 3.7 3.7 1.8-.6 4.1L34.8 17l-2.6 3.2.6 4.1-3.7 1.8-1.8 3.7-4.1-.6L20 31.8l-3.2-2.6-4.1.6-1.8-3.7-3.7-1.8.6-4.1L5.2 17l2.6-3.2-.6-4.1L10.9 7.9l1.8-3.7 4.1.6z"
      />
      <path
        fill="#fff"
        d="M17.4 25.2l-6.1-6.1 2.5-2.5 3.6 3.6 8.8-8.8 2.5 2.5z"
      />
    </svg>
  );
}

export default VerifiedBadge;
