"""
SQLAlchemy models for the IoT Platform.
Defines Device, Telemetry, Command, Alert, and Hierarchy tables.
"""

import uuid
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB

# Shared SQLAlchemy instance -- initialised with the Flask app in app.py
db = SQLAlchemy()


def _utcnow():
    """Return the current UTC time (timezone-aware)."""
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Facility model
# ---------------------------------------------------------------------------
class Facility(db.Model):
    """Top-level site / campus in the location hierarchy."""

    __tablename__ = "facilities"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(100), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    location = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    buildings = db.relationship("Building", backref="facility", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "location": self.location,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ---------------------------------------------------------------------------
# Building model
# ---------------------------------------------------------------------------
class Building(db.Model):
    """A building within a facility."""

    __tablename__ = "buildings"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    facility_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("facilities.id", ondelete="CASCADE"),
        nullable=False,
    )
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    floor_count = db.Column(db.Integer, default=1)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("facility_id", "name", name="uq_building_in_facility"),
    )

    units = db.relationship("Unit", backref="building", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "facility_id": str(self.facility_id),
            "name": self.name,
            "description": self.description,
            "floor_count": self.floor_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ---------------------------------------------------------------------------
# Unit model
# ---------------------------------------------------------------------------
class Unit(db.Model):
    """A room, zone, or logical unit within a building."""

    __tablename__ = "units"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    building_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("buildings.id", ondelete="CASCADE"),
        nullable=False,
    )
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    unit_type = db.Column(db.String(50), default="grow_tent")
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("building_id", "name", name="uq_unit_in_building"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "building_id": str(self.building_id),
            "name": self.name,
            "description": self.description,
            "unit_type": self.unit_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ---------------------------------------------------------------------------
# Device model
# ---------------------------------------------------------------------------
class Device(db.Model):
    """Represents a physical IoT device within the facility hierarchy."""

    __tablename__ = "devices"

    # Primary key: UUID generated automatically
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Hierarchical location fields (string-based, for MQTT topic compatibility)
    facility = db.Column(db.String(128), nullable=False)
    building = db.Column(db.String(128), nullable=False)
    unit = db.Column(db.String(128), nullable=False)
    device_name = db.Column(db.String(128), nullable=False)

    # Foreign key references to hierarchy tables (nullable for backward compat)
    facility_id = db.Column(UUID(as_uuid=True), db.ForeignKey("facilities.id"), nullable=True)
    building_id = db.Column(UUID(as_uuid=True), db.ForeignKey("buildings.id"), nullable=True)
    unit_id = db.Column(UUID(as_uuid=True), db.ForeignKey("units.id"), nullable=True)

    # Device metadata
    device_type = db.Column(db.String(64), nullable=False)

    # Timestamps and status
    registered_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    last_seen = db.Column(db.DateTime, nullable=True)
    is_online = db.Column(db.Boolean, default=False, nullable=False)

    # Each device must be uniquely identified by its location + name
    __table_args__ = (
        UniqueConstraint(
            "facility", "building", "unit", "device_name",
            name="uq_device_location",
        ),
    )

    # Relationships (cascade deletes so removing a device cleans up child rows)
    telemetry = db.relationship("Telemetry", backref="device", cascade="all, delete-orphan")
    commands = db.relationship("Command", backref="device", cascade="all, delete-orphan")
    alerts = db.relationship("Alert", backref="device", cascade="all, delete-orphan")

    def to_dict(self):
        """Serialise the device to a JSON-friendly dictionary."""
        return {
            "id": str(self.id),
            "facility": self.facility,
            "building": self.building,
            "unit": self.unit,
            "device_name": self.device_name,
            "device_type": self.device_type,
            "facility_id": str(self.facility_id) if self.facility_id else None,
            "building_id": str(self.building_id) if self.building_id else None,
            "unit_id": str(self.unit_id) if self.unit_id else None,
            "registered_at": self.registered_at.isoformat() if self.registered_at else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "is_online": self.is_online,
        }


# ---------------------------------------------------------------------------
# Telemetry model
# ---------------------------------------------------------------------------
class Telemetry(db.Model):
    """Stores raw telemetry payloads received from devices."""

    __tablename__ = "telemetry"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    received_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    # JSONB allows indexed queries on the payload contents
    payload = db.Column(JSONB, nullable=True)

    def to_dict(self):
        """Serialise the telemetry record to a dictionary."""
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "received_at": self.received_at.isoformat() if self.received_at else None,
            "payload": self.payload,
        }


# ---------------------------------------------------------------------------
# Command model
# ---------------------------------------------------------------------------
class Command(db.Model):
    """Tracks commands issued to devices and their acknowledgement status."""

    __tablename__ = "commands"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    issued_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    command_type = db.Column(db.String(64), nullable=False)
    payload = db.Column(JSONB, nullable=True)
    acknowledged = db.Column(db.Boolean, default=False, nullable=False)
    acknowledged_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        """Serialise the command record to a dictionary."""
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "issued_at": self.issued_at.isoformat() if self.issued_at else None,
            "command_type": self.command_type,
            "payload": self.payload,
            "acknowledged": self.acknowledged,
            "acknowledged_at": (
                self.acknowledged_at.isoformat() if self.acknowledged_at else None
            ),
        }


# ---------------------------------------------------------------------------
# Alert model
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# User model
# ---------------------------------------------------------------------------
class User(db.Model):
    """Represents a user account for platform authentication."""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(16), nullable=False, default="user")  # 'admin' or 'user'
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    def to_dict(self):
        """Serialise the user to a dictionary (never include password_hash)."""
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------------------------------------------------------------------------
# Alert model
# ---------------------------------------------------------------------------
class Alert(db.Model):
    """Stores alerts/alarms triggered by device conditions."""

    __tablename__ = "alerts"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    triggered_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    alert_type = db.Column(db.String(64), nullable=False)
    message = db.Column(db.Text, nullable=True)
    resolved = db.Column(db.Boolean, default=False, nullable=False)

    def to_dict(self):
        """Serialise the alert record to a dictionary."""
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "triggered_at": self.triggered_at.isoformat() if self.triggered_at else None,
            "alert_type": self.alert_type,
            "message": self.message,
            "resolved": self.resolved,
        }


# ---------------------------------------------------------------------------
# DeviceThreshold model
# ---------------------------------------------------------------------------
class DeviceThreshold(db.Model):
    """Per-device automation thresholds for environmental control."""

    __tablename__ = "device_thresholds"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    humidity_on_pct = db.Column(db.Float, nullable=False, default=80.0)
    humidity_off_pct = db.Column(db.Float, nullable=False, default=90.0)
    co2_high_ppm = db.Column(db.Integer, nullable=False, default=1000)
    co2_normal_ppm = db.Column(db.Integer, nullable=False, default=900)
    temp_min_c = db.Column(db.Float, nullable=False, default=18.0)
    temp_max_c = db.Column(db.Float, nullable=False, default=24.0)
    water_low_cm = db.Column(db.Float, nullable=False, default=10.0)
    water_full_cm = db.Column(db.Float, nullable=False, default=5.0)
    fan_default_speed = db.Column(db.Integer, nullable=False, default=50)
    fan_co2_speed = db.Column(db.Integer, nullable=False, default=100)
    sensor_interval_s = db.Column(db.Integer, nullable=False, default=300)
    valve_safety_min = db.Column(db.Integer, nullable=False, default=10)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    # Climate control columns
    heat_on_c = db.Column(db.Float, default=17.5)
    heat_off_c = db.Column(db.Float, default=19.0)
    cool_on_c = db.Column(db.Float, default=25.0)
    cool_off_c = db.Column(db.Float, default=23.5)
    dehumid_on_pct = db.Column(db.Float, default=92.0)
    dehumid_off_pct = db.Column(db.Float, default=88.0)
    heater_safety_min = db.Column(db.Integer, default=30)
    cooling_safety_min = db.Column(db.Integer, default=60)
    climate_enabled = db.Column(db.Boolean, default=True)
    schedule_enabled = db.Column(db.Boolean, default=False)
    day_start_hour = db.Column(db.Integer, default=6)
    night_start_hour = db.Column(db.Integer, default=22)
    night_heat_on_c = db.Column(db.Float, default=16.0)
    night_heat_off_c = db.Column(db.Float, default=18.0)
    night_cool_on_c = db.Column(db.Float, default=24.0)
    night_cool_off_c = db.Column(db.Float, default=22.5)

    def to_dict(self):
        """Serialise the threshold record to a dictionary."""
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
            "heat_on_c": self.heat_on_c,
            "heat_off_c": self.heat_off_c,
            "cool_on_c": self.cool_on_c,
            "cool_off_c": self.cool_off_c,
            "dehumid_on_pct": self.dehumid_on_pct,
            "dehumid_off_pct": self.dehumid_off_pct,
            "heater_safety_min": self.heater_safety_min,
            "cooling_safety_min": self.cooling_safety_min,
            "climate_enabled": self.climate_enabled,
            "schedule_enabled": self.schedule_enabled,
            "day_start_hour": self.day_start_hour,
            "night_start_hour": self.night_start_hour,
            "night_heat_on_c": self.night_heat_on_c,
            "night_heat_off_c": self.night_heat_off_c,
            "night_cool_on_c": self.night_cool_on_c,
            "night_cool_off_c": self.night_cool_off_c,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ---------------------------------------------------------------------------
# WaterUsageSession model
# ---------------------------------------------------------------------------
class WaterUsageSession(db.Model):
    """Tracks individual water usage sessions for irrigation/fill operations."""

    __tablename__ = "water_usage_sessions"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_start = db.Column(db.DateTime, nullable=False)
    session_end = db.Column(db.DateTime, nullable=True)
    duration_s = db.Column(db.Integer, nullable=True)
    liters_used = db.Column(db.Float, default=0.0)
    trigger_type = db.Column(db.String(20), nullable=False)
    trigger_source = db.Column(db.String(20), nullable=False, default="server")
    tank_pct_start = db.Column(db.Integer, nullable=True)
    tank_pct_end = db.Column(db.Integer, nullable=True)
    completed = db.Column(db.Boolean, default=False)

    def to_dict(self):
        """Serialise the water usage session to a dictionary."""
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "session_start": self.session_start.isoformat() if self.session_start else None,
            "session_end": self.session_end.isoformat() if self.session_end else None,
            "duration_s": self.duration_s,
            "liters_used": self.liters_used,
            "trigger_type": self.trigger_type,
            "trigger_source": self.trigger_source,
            "tank_pct_start": self.tank_pct_start,
            "tank_pct_end": self.tank_pct_end,
            "completed": self.completed,
        }


# ---------------------------------------------------------------------------
# AutomationEvent model
# ---------------------------------------------------------------------------
class AutomationEvent(db.Model):
    """Logs automation rule firings and the actions taken."""

    __tablename__ = "automation_events"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_time = db.Column(db.DateTime, default=_utcnow, nullable=False)
    rule_name = db.Column(db.String(100), nullable=False)
    trigger_value = db.Column(JSONB, nullable=True)
    action_taken = db.Column(db.String(100), nullable=False)
    command_sent = db.Column(JSONB, nullable=True)
    autonomous = db.Column(db.Boolean, default=False)

    def to_dict(self):
        """Serialise the automation event to a dictionary."""
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "event_time": self.event_time.isoformat() if self.event_time else None,
            "rule_name": self.rule_name,
            "trigger_value": self.trigger_value,
            "action_taken": self.action_taken,
            "command_sent": self.command_sent,
            "autonomous": self.autonomous,
        }


# ---------------------------------------------------------------------------
# IrrigationZone model
# ---------------------------------------------------------------------------
class IrrigationZone(db.Model):
    """Per-device irrigation zone configuration (up to 16 zones per device)."""

    __tablename__ = "irrigation_zones"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    zone_index = db.Column(db.SmallInteger, nullable=False)
    name = db.Column(db.String(100), nullable=False, default="")
    enabled = db.Column(db.Boolean, nullable=False, default=True)
    runtime_s = db.Column(db.Integer, nullable=False, default=600)
    zone_group = db.Column(db.String(50), nullable=True)
    gpio_pin = db.Column(db.SmallInteger, nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("device_id", "zone_index", name="uq_irrigation_zone"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "zone_index": self.zone_index,
            "name": self.name,
            "enabled": self.enabled,
            "runtime_s": self.runtime_s,
            "zone_group": self.zone_group,
            "gpio_pin": self.gpio_pin,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ---------------------------------------------------------------------------
# IrrigationSchedule model
# ---------------------------------------------------------------------------
class IrrigationSchedule(db.Model):
    """Per-zone watering schedule with day-of-week bitmask and time list."""

    __tablename__ = "irrigation_schedules"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    zone_index = db.Column(db.SmallInteger, nullable=False)
    enabled = db.Column(db.Boolean, nullable=False, default=True)
    runtime_s = db.Column(db.Integer, nullable=False, default=600)
    days_of_week = db.Column(db.SmallInteger, nullable=False, default=127)
    times = db.Column(JSONB, nullable=False, default=list)
    seasonal_config_index = db.Column(db.SmallInteger, nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("device_id", "zone_index", name="uq_irrigation_schedule"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "zone_index": self.zone_index,
            "enabled": self.enabled,
            "runtime_s": self.runtime_s,
            "days_of_week": self.days_of_week,
            "times": self.times,
            "seasonal_config_index": self.seasonal_config_index,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ---------------------------------------------------------------------------
# IrrigationSeasonalConfig model
# ---------------------------------------------------------------------------
class IrrigationSeasonalConfig(db.Model):
    """Seasonal adjustment profile (up to 8 per device)."""

    __tablename__ = "irrigation_seasonal_configs"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    config_index = db.Column(db.SmallInteger, nullable=False)
    name = db.Column(db.String(100), nullable=False, default="")
    start_month = db.Column(db.SmallInteger, nullable=False)
    start_day = db.Column(db.SmallInteger, nullable=False)
    end_month = db.Column(db.SmallInteger, nullable=False)
    end_day = db.Column(db.SmallInteger, nullable=False)
    runtime_multiplier = db.Column(db.Float, nullable=False, default=1.0)
    skip_if_rained = db.Column(db.Boolean, nullable=False, default=False)
    skip_rain_threshold_mm = db.Column(db.Float, nullable=False, default=5.0)
    enabled = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("device_id", "config_index", name="uq_irrigation_seasonal_config"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "config_index": self.config_index,
            "name": self.name,
            "start_month": self.start_month,
            "start_day": self.start_day,
            "end_month": self.end_month,
            "end_day": self.end_day,
            "runtime_multiplier": self.runtime_multiplier,
            "skip_if_rained": self.skip_if_rained,
            "skip_rain_threshold_mm": self.skip_rain_threshold_mm,
            "enabled": self.enabled,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ---------------------------------------------------------------------------
# IrrigationZoneEvent model
# ---------------------------------------------------------------------------
class IrrigationZoneEvent(db.Model):
    """Log of irrigation zone open/close/skip events."""

    __tablename__ = "irrigation_zone_events"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    zone_index = db.Column(db.SmallInteger, nullable=False)
    zone_name = db.Column(db.String(100), nullable=True)
    event_type = db.Column(db.String(30), nullable=False)
    trigger_type = db.Column(db.String(30), nullable=False)
    runtime_s = db.Column(db.Integer, nullable=True)
    seasonal_config = db.Column(db.String(100), nullable=True)
    timestamp = db.Column(db.DateTime, default=_utcnow, nullable=False)
    test_mode = db.Column(db.Boolean, nullable=False, default=False)

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "zone_index": self.zone_index,
            "zone_name": self.zone_name,
            "event_type": self.event_type,
            "trigger_type": self.trigger_type,
            "runtime_s": self.runtime_s,
            "seasonal_config": self.seasonal_config,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "test_mode": self.test_mode,
        }


# ---------------------------------------------------------------------------
# IrrigationWeather model
# ---------------------------------------------------------------------------
class IrrigationWeather(db.Model):
    """Weather data snapshots used for irrigation skip decisions."""

    __tablename__ = "irrigation_weather"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    recorded_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    rainfall_24h_mm = db.Column(db.Float, nullable=True)
    temperature_c = db.Column(db.Float, nullable=True)
    forecast_rain_mm = db.Column(db.Float, nullable=True)
    weather_skip_active = db.Column(db.Boolean, nullable=False, default=False)

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
            "rainfall_24h_mm": self.rainfall_24h_mm,
            "temperature_c": self.temperature_c,
            "forecast_rain_mm": self.forecast_rain_mm,
            "weather_skip_active": self.weather_skip_active,
        }


# ---------------------------------------------------------------------------
# ClimateRuntimeSession model
# ---------------------------------------------------------------------------
class ClimateRuntimeSession(db.Model):
    """Tracks individual climate control runtime sessions (heater, cooling, dehumidifier)."""

    __tablename__ = "climate_runtime_sessions"

    id = db.Column(db.BigInteger, primary_key=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    device_type = db.Column(db.String(20), nullable=False)
    session_start = db.Column(db.DateTime, default=_utcnow, nullable=False)
    session_end = db.Column(db.DateTime, nullable=True)
    duration_s = db.Column(db.Integer, nullable=True)
    trigger_type = db.Column(db.String(20), nullable=False, default="auto")
    temp_at_start = db.Column(db.Float, nullable=True)
    temp_at_end = db.Column(db.Float, nullable=True)
    humidity_at_start = db.Column(db.Float, nullable=True)
    safety_cutoff = db.Column(db.Boolean, default=False)
    test_mode = db.Column(db.Boolean, default=False)

    def to_dict(self):
        """Serialise the climate runtime session to a dictionary."""
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "device_type": self.device_type,
            "session_start": self.session_start.isoformat() if self.session_start else None,
            "session_end": self.session_end.isoformat() if self.session_end else None,
            "duration_s": self.duration_s,
            "trigger_type": self.trigger_type,
            "temp_at_start": self.temp_at_start,
            "temp_at_end": self.temp_at_end,
            "humidity_at_start": self.humidity_at_start,
            "safety_cutoff": self.safety_cutoff,
            "test_mode": self.test_mode,
        }
