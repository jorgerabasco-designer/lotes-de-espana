import React from 'react';

const Ic = ({ d, size = 20, fill, stroke = 1.5, children, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill || 'none'}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    {d ? <path d={d} /> : children}
  </svg>
);

export const I = {
  catalog: (p) => (<Ic {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></Ic>),
  product: (p) => (<Ic {...p}><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="M3 7l9 4 9-4"/><path d="M12 11v10"/></Ic>),
  history: (p) => (<Ic {...p}><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3.5 2"/></Ic>),
  settings: (p) => (<Ic {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></Ic>),
  search: (p) => (<Ic {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Ic>),
  upload: (p) => (<Ic {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></Ic>),
  excel: (p) => (<Ic {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13l6 6M15 13l-6 6"/></Ic>),
  plus: (p) => (<Ic {...p}><path d="M12 5v14M5 12h14"/></Ic>),
  check: (p) => (<Ic {...p}><path d="M5 12.5l4.5 4.5L19 7"/></Ic>),
  star: (p) => (<Ic {...p} fill="currentColor" stroke={0}><path d="M12 2.5l2.9 6 6.6 1-4.8 4.6 1.1 6.5L12 17.6 6.2 20.6l1.1-6.5L2.5 9.5l6.6-1z"/></Ic>),
  sparkle: (p) => (<Ic {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></Ic>),
  filter: (p) => (<Ic {...p}><path d="M3 5h18M6 12h12M10 19h4"/></Ic>),
  sort: (p) => (<Ic {...p}><path d="M7 4v16M7 4l-3 3M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/></Ic>),
  copy: (p) => (<Ic {...p}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></Ic>),
  download: (p) => (<Ic {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></Ic>),
  mail: (p) => (<Ic {...p}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 7l10 6 10-6"/></Ic>),
  share: (p) => (<Ic {...p}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4"/></Ic>),
  refresh: (p) => (<Ic {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></Ic>),
  trash: (p) => (<Ic {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></Ic>),
  expand: (p) => (<Ic {...p}><path d="M4 14v6h6M20 10V4h-6M14 4l6 6M10 20l-6-6"/></Ic>),
  edit: (p) => (<Ic {...p}><path d="M4 20h4l11-11-4-4L4 16v4z"/><path d="M14 5l4 4"/></Ic>),
  close: (p) => (<Ic {...p}><path d="M6 6l12 12M18 6l-12 12"/></Ic>),
  x: (p) => (<Ic {...p}><path d="M6 6l12 12M18 6l-12 12"/></Ic>),
  chevronDown: (p) => (<Ic {...p}><path d="M6 9l6 6 6-6"/></Ic>),
};
