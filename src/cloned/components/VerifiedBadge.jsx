import React from 'react';

// Meta-style verified blue checkmark badge
export function VerifiedBadge({ size = 18, className = '', title = 'Perfil verificado' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`inline-block align-middle ${className}`}
      aria-label={title}
      role="img"
    >
      <title>{title}</title>
      <path
        fill="#1D9BF0"
        d="M12 1.5l2.4 2 3.1-.3.9 3 2.7 1.6-1.1 2.9 1.1 2.9-2.7 1.6-.9 3-3.1-.3L12 22.5l-2.4-2-3.1.3-.9-3-2.7-1.6 1.1-2.9-1.1-2.9 2.7-1.6.9-3 3.1.3z"
      />
      <path
        fill="#fff"
        d="M10.6 15.2l-3-3 1.3-1.3 1.7 1.7 4.4-4.4 1.3 1.3z"
      />
    </svg>
  );
}

export default VerifiedBadge;
