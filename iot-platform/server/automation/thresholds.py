"""
ThresholdCache -- loads and caches per-device thresholds from the database.
"""

import logging
import threading

import config
from db.connection import get_session
from models.threshold import DeviceThreshold

logger = logging.getLogger(__name__)


class ThresholdCache:
    """
    In-memory cache for device thresholds.
    Loads all thresholds from DB at startup and provides fast lookups.
    Falls back to DB on cache miss and caches the result.
    """

    def __init__(self):
        self._cache = {}  # device_id (str) -> dict of threshold values
        self._lock = threading.Lock()

    def load_all(self):
        """Load all thresholds from the database into cache."""
        session = get_session()
        try:
            thresholds = session.query(DeviceThreshold).all()
            with self._lock:
                for t in thresholds:
                    self._cache[str(t.device_id)] = self._to_dict(t)
            logger.info("Loaded %d device thresholds into cache", len(thresholds))
        except Exception:
            logger.exception("Failed to load thresholds from database")
        finally:
            session.close()

    def get(self, device_id):
        """
        Get thresholds for a device.

        Args:
            device_id: Device UUID (str or UUID).

        Returns:
            Dict of threshold values. Falls back to DB on cache miss,
            then to defaults if no DB entry exists.
        """
        device_id = str(device_id)

        with self._lock:
            if device_id in self._cache:
                return self._cache[device_id]

        # Cache miss -- try database
        session = get_session()
        try:
            t = session.query(DeviceThreshold).filter_by(device_id=device_id).first()
            if t:
                result = self._to_dict(t)
                with self._lock:
                    self._cache[device_id] = result
                return result
        except Exception:
            logger.exception("Failed to load thresholds for device %s", device_id)
        finally:
            session.close()

        # Return defaults
        return self._defaults()

    def update(self, device_id, values):
        """
        Update cached thresholds for a device.

        Args:
            device_id: Device UUID.
            values: Dict of threshold values to update.
        """
        device_id = str(device_id)
        with self._lock:
            if device_id in self._cache:
                self._cache[device_id].update(values)
            else:
                defaults = self._defaults()
                defaults.update(values)
                self._cache[device_id] = defaults
        logger.debug("Updated cached thresholds for device %s", device_id)

    def invalidate(self, device_id=None):
        """
        Invalidate cached thresholds.

        Args:
            device_id: If provided, invalidate only this device. Otherwise invalidate all.
        """
        with self._lock:
            if device_id:
                self._cache.pop(str(device_id), None)
                logger.debug("Invalidated threshold cache for device %s", device_id)
            else:
                self._cache.clear()
                logger.info("Invalidated all threshold caches")

    @staticmethod
    def _to_dict(threshold):
        """Convert a DeviceThreshold ORM instance to a plain dict."""
        return {
            "humidity_on_pct": threshold.humidity_on_pct,
            "humidity_off_pct": threshold.humidity_off_pct,
            "co2_high_ppm": threshold.co2_high_ppm,
            "co2_normal_ppm": threshold.co2_normal_ppm,
            "temp_min_c": threshold.temp_min_c,
            "temp_max_c": threshold.temp_max_c,
            "water_low_cm": threshold.water_low_cm,
            "water_full_cm": threshold.water_full_cm,
            "fan_default_speed": threshold.fan_default_speed,
            "fan_co2_speed": threshold.fan_co2_speed,
            "sensor_interval_s": threshold.sensor_interval_s,
            "valve_safety_min": threshold.valve_safety_min,
        }

    @staticmethod
    def _defaults():
        """Return default threshold values from config."""
        return {
            "humidity_on_pct": config.DEFAULT_HUMIDITY_ON_PCT,
            "humidity_off_pct": config.DEFAULT_HUMIDITY_OFF_PCT,
            "co2_high_ppm": config.DEFAULT_CO2_HIGH_PPM,
            "co2_normal_ppm": config.DEFAULT_CO2_NORMAL_PPM,
            "temp_min_c": config.DEFAULT_TEMP_MIN_C,
            "temp_max_c": config.DEFAULT_TEMP_MAX_C,
            "water_low_cm": config.DEFAULT_WATER_LOW_CM,
            "water_full_cm": config.DEFAULT_WATER_FULL_CM,
            "fan_default_speed": config.DEFAULT_FAN_SPEED,
            "fan_co2_speed": config.DEFAULT_FAN_CO2_SPEED,
            "sensor_interval_s": config.DEFAULT_SENSOR_INTERVAL_S,
            "valve_safety_min": config.VALVE_SAFETY_MIN,
        }
