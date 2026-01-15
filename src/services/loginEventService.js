import { LoginEventModel } from '../models/index.js';
import { getIPGeolocation, getClientIP } from './geolocationService.js';

/**
 * Record a login event with location data
 */
export async function recordLoginEvent(userId, locationData, req) {
  try {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    let eventData = {
      userId,
      method: locationData.method || 'ip',
      geo_method: locationData.geo_method || locationData.method || 'ip',
      ipAddress,
      userAgent,
      timestamp: new Date(),
    };

    // If GPS data provided, use it
    if (locationData.method === 'gps' && locationData.latitude && locationData.longitude) {
      eventData = {
        ...eventData,
        method: 'gps',
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        accuracy: locationData.accuracy || null,
      };
    } else {
      // Fallback to IP geolocation
      const ipGeo = await getIPGeolocation(ipAddress);
      eventData = {
        ...eventData,
        method: 'ip',
        latitude: ipGeo.latitude,
        longitude: ipGeo.longitude,
        accuracy: ipGeo.accuracy,
        city: ipGeo.city,
        region: ipGeo.region,
        country: ipGeo.country,
        countryCode: ipGeo.countryCode,
        timezone: ipGeo.timezone,
      };
    }

    const loginEvent = new LoginEventModel(eventData);
    await loginEvent.save();
    
    return loginEvent;
  } catch (error) {
    console.error('Error recording login event:', error);
    throw error;
  }
}

/**
 * Get login events for a user or all users (admin)
 */
export async function getLoginEvents(userId = null, limit = 100) {
  try {
    const query = userId ? { userId } : {};
    const events = await LoginEventModel.find(query)
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    
    return events;
  } catch (error) {
    console.error('Error fetching login events:', error);
    throw error;
  }
}
