/**
 * Homestay Harmoni Vista — Configuration
 */
const CONFIG = {
  // Public iCal feed — no API key required
  ICAL_URL: 'https://calendar.google.com/calendar/ical/o1bn79hqeqsnmh62vhkdb5hc34%40group.calendar.google.com/public/basic.ics',

  // Embed URL (used as fallback iframe)
  EMBED_URL: 'https://calendar.google.com/calendar/embed?src=o1bn79hqeqsnmh62vhkdb5hc34%40group.calendar.google.com&ctz=Asia%2FKuala_Lumpur',

  PROPERTY_NAME: 'Homestay Harmoni Vista',

  // Direct booking WhatsApp
  WHATSAPP: '60197066093',

  // Property address
  ADDRESS: 'No 29, Jalan Harmoni Vista 1, Taman Harmoni Vista, Bandar Universiti Pagoh, 84600 Muar, Johor',

  // Google Maps
  MAPS_URL: 'https://maps.app.goo.gl/covSUCrECYoG1F5p8',

  // CORS proxies tried in order until one succeeds
  CORS_PROXIES: [
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://cors-anywhere.herokuapp.com/${url}`,
  ],
};
