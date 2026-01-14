import geoip from 'geoip-lite';

/**
 * Get IP geolocation using MaxMind GeoLite2 (via geoip-lite)
 * Falls back to basic IP info if geolocation fails
 */
export async function getIPGeolocation(ipAddress) {
  try {
    // Remove port if present
    const cleanIP = ipAddress.split(':').pop();
    
    // Skip localhost/private IPs
    if (cleanIP === '127.0.0.1' || cleanIP === '::1' || cleanIP.startsWith('192.168.') || cleanIP.startsWith('10.') || cleanIP.startsWith('172.')) {
      return {
        method: 'ip',
        latitude: null,
        longitude: null,
        accuracy: null,
        city: null,
        region: null,
        country: null,
        countryCode: null,
        timezone: null,
      };
    }

    const geo = geoip.lookup(cleanIP);
    
    if (!geo) {
      return {
        method: 'ip',
        latitude: null,
        longitude: null,
        accuracy: null,
        city: null,
        region: null,
        country: null,
        countryCode: null,
        timezone: null,
      };
    }

    return {
      method: 'ip',
      latitude: geo.ll?.[0] || null,
      longitude: geo.ll?.[1] || null,
      accuracy: null, // IP geolocation doesn't have accuracy
      city: geo.city || null,
      region: geo.region || null,
      country: geo.country || null,
      countryCode: geo.country || null,
      timezone: geo.timezone || null,
    };
  } catch (error) {
    console.error('IP geolocation error:', error);
    return {
      method: 'ip',
      latitude: null,
      longitude: null,
      accuracy: null,
      city: null,
      region: null,
      country: null,
      countryCode: null,
      timezone: null,
    };
  }
}

/**
 * Get client IP from request
 */
export function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}
