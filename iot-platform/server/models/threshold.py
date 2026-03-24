"""DeviceThreshold ORM model for per-device automation thresholds."""

from datetime import datetime, timezone

from sqlalchemy import Column, BigInteger, Integer, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from models.base import Base

import config


def _utcnow():
    return datetime.now(timezone.utc)


class DeviceThreshold(Base):
    __tablename__ = "device_thresholds"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    device_id = Column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )

    humidity_on_pct = Column(Float, nullable=False, default=config.DEFAULT_HUMIDITY_ON_PCT)
    humidity_off_pct = Column(Float, nullable=False, default=config.DEFAULT_HUMIDITY_OFF_PCT)
    co2_high_ppm = Column(Float, nullable=False, default=config.DEFAULT_CO2_HIGH_PPM)
    co2_normal_ppm = Column(Float, nullable=False, default=config.DEFAULT_CO2_NORMAL_PPM)
    temp_min_c = Column(Float, nullable=False, default=config.DEFAULT_TEMP_MIN_C)
    temp_max_c = Column(Float, nullable=False, default=config.DEFAULT_TEMP_MAX_C)
    water_low_cm = Column(Float, nullable=False, default=config.DEFAULT_WATER_LOW_CM)
    water_full_cm = Column(Float, nullable=False, default=config.DEFAULT_WATER_FULL_CM)
    fan_default_speed = Column(Integer, nullable=False, default=config.DEFAULT_FAN_SPEED)
    fan_co2_speed = Column(Integer, nullable=False, default=config.DEFAULT_FAN_CO2_SPEED)
    sensor_interval_s = Column(Integer, nullable=False, default=config.DEFAULT_SENSOR_INTERVAL_S)
    valve_safety_min = Column(Integer, nullable=False, default=config.VALVE_SAFETY_MIN)

    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        UniqueConstraint("device_id", name="uq_device_thresholds"),
    )

    device = relationship("Device", back_populates="thresholds")

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "humidity_on_pct": self.humidity_on_pct,
            "humidity_off_pct": self.humidity_off_pct,
            "co2_high_ppm": self.co2_high_ppm,
            "co2_normal_ppm": self.co2_normal_ppm,
            "temp_min_c": self.temp_min_c,
            "temp_max_c": self.temp_max_c,
            "water_low_cm": self.water_low_cm,
            "water_full_cm": self.water_full_cm,
            "fan_default_speed": self.fan_default_speed,
            "fan_co2_speed": self.fan_co2_speed,
            "sensor_interval_s": self.sensor_interval_s,
            "valve_safety_min": self.valve_safety_min,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def reset_to_defaults(self):
        """Reset all thresholds to config defaults."""
        self.humidity_on_pct = config.DEFAULT_HUMIDITY_ON_PCT
        self.humidity_off_pct = config.DEFAULT_HUMIDITY_OFF_PCT
        self.co2_high_ppm = config.DEFAULT_CO2_HIGH_PPM
        self.co2_normal_ppm = config.DEFAULT_CO2_NORMAL_PPM
        self.temp_min_c = config.DEFAULT_TEMP_MIN_C
        self.temp_max_c = config.DEFAULT_TEMP_MAX_C
        self.water_low_cm = config.DEFAULT_WATER_LOW_CM
        self.water_full_cm = config.DEFAULT_WATER_FULL_CM
        self.fan_default_speed = config.DEFAULT_FAN_SPEED
        self.fan_co2_speed = config.DEFAULT_FAN_CO2_SPEED
        self.sensor_interval_s = config.DEFAULT_SENSOR_INTERVAL_S
        self.valve_safety_min = config.VALVE_SAFETY_MIN
        self.updated_at = _utcnow()
