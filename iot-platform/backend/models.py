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

    # Device status: 'active' (registered), 'pending' (auto-discovered, unclaimed)
    status = db.Column(db.String(16), nullable=False, default="active")

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
            "status": self.status,
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
    role = db.Column(db.String(20), nullable=False, default="viewer")  # 'admin', 'operator', 'viewer'
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    email = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    created_by = db.Column(db.Integer, nullable=True)
    last_login = db.Column(db.DateTime, nullable=True)
    last_login_ip = db.Column(db.String(50), nullable=True)
    force_password_change = db.Column(db.Boolean, default=False, nullable=False)

    # Relationships
    device_assignments = db.relationship(
        "UserDeviceAssignment", backref="user", cascade="all, delete-orphan"
    )
    sessions = db.relationship(
        "UserSession", backref="user", cascade="all, delete-orphan"
    )

    def to_dict(self):
        """Serialise the user to a dictionary (never include password_hash)."""
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "created_by": self.created_by,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "last_login_ip": self.last_login_ip,
            "force_password_change": self.force_password_change,
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


# ---------------------------------------------------------------------------
# DeviceMqttCredential model
# ---------------------------------------------------------------------------
class DeviceMqttCredential(db.Model):
    """MQTT authentication credentials for a device."""

    __tablename__ = "device_mqtt_credentials"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    mqtt_username = db.Column(db.String(200), unique=True, nullable=False)
    mqtt_password_hash = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    last_used = db.Column(db.DateTime, nullable=True)
    revoked = db.Column(db.Boolean, default=False, nullable=False)

    def to_dict(self):
        """Serialise the credential record (never include password hash)."""
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "mqtt_username": self.mqtt_username,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_used": self.last_used.isoformat() if self.last_used else None,
            "revoked": self.revoked,
        }


# ---------------------------------------------------------------------------
# UserDeviceAssignment model
# ---------------------------------------------------------------------------
class UserDeviceAssignment(db.Model):
    """Maps users to devices they are authorised to access."""

    __tablename__ = "user_device_assignments"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    assigned_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    assigned_by = db.Column(db.Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "device_id", name="uq_user_device_assignment"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "device_id": str(self.device_id),
            "assigned_at": self.assigned_at.isoformat() if self.assigned_at else None,
            "assigned_by": self.assigned_by,
        }


# ---------------------------------------------------------------------------
# UserSession model
# ---------------------------------------------------------------------------
class UserSession(db.Model):
    """Tracks active user sessions for auditing and revocation."""

    __tablename__ = "user_sessions"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    ip_address = db.Column(db.String(50), nullable=True)
    user_agent = db.Column(db.String(500), nullable=True)
    revoked = db.Column(db.Boolean, default=False, nullable=False)

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "revoked": self.revoked,
        }


# ---------------------------------------------------------------------------
# SecurityEvent model
# ---------------------------------------------------------------------------
class SecurityEvent(db.Model):
    """Immutable log of security-relevant events for auditing."""

    __tablename__ = "security_events"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    event_time = db.Column(db.DateTime, default=_utcnow, nullable=False)
    event_type = db.Column(db.String(100), nullable=False)
    user_id = db.Column(db.Integer, nullable=True)
    ip_address = db.Column(db.String(50), nullable=True)
    details = db.Column(JSONB, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "event_time": self.event_time.isoformat() if self.event_time else None,
            "event_type": self.event_type,
            "user_id": self.user_id,
            "ip_address": self.ip_address,
            "details": self.details,
        }


# ===========================================================================
# Mushroom Inventory Models
# ===========================================================================


class MushroomStrain(db.Model):
    """Mushroom species / cultivar catalogue entry."""

    __tablename__ = "mushroom_strains"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(150), nullable=False, unique=True)
    species = db.Column(db.String(150))
    source = db.Column(db.String(200))
    generation = db.Column(db.String(50))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "species": self.species,
            "source": self.source,
            "generation": self.generation,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class SubstrateRecipe(db.Model):
    """Named substrate formulation."""

    __tablename__ = "substrate_recipes"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(150), nullable=False, unique=True)
    description = db.Column(db.Text)
    target_moisture_pct = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    components = db.relationship(
        "SubstrateRecipeComponent", backref="recipe", cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "target_moisture_pct": self.target_moisture_pct,
            "components": [c.to_dict() for c in self.components] if self.components else [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class SubstrateRecipeComponent(db.Model):
    """Ingredient within a substrate recipe."""

    __tablename__ = "substrate_recipe_components"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipe_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("substrate_recipes.id", ondelete="CASCADE"),
        nullable=False,
    )
    ingredient = db.Column(db.String(150), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    unit = db.Column(db.String(30), nullable=False, default="g")
    sort_order = db.Column(db.SmallInteger, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("recipe_id", "ingredient", name="uq_recipe_ingredient"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "recipe_id": str(self.recipe_id),
            "ingredient": self.ingredient,
            "quantity": self.quantity,
            "unit": self.unit,
            "sort_order": self.sort_order,
        }


class AutoclaveUnit(db.Model):
    """Registered sterilisation equipment."""

    __tablename__ = "autoclave_units"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(100), nullable=False, unique=True)
    model = db.Column(db.String(150))
    capacity_liters = db.Column(db.Float)
    device_id = db.Column(UUID(as_uuid=True), db.ForeignKey("devices.id", ondelete="SET NULL"))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "model": self.model,
            "capacity_liters": self.capacity_liters,
            "device_id": str(self.device_id) if self.device_id else None,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Location(db.Model):
    """Logical grow area (room, tent, shelf rack, etc.)."""

    __tablename__ = "locations"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(150), nullable=False)
    parent_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("locations.id", ondelete="CASCADE")
    )
    location_type = db.Column(db.String(50), nullable=False, default="room")
    unit_id = db.Column(UUID(as_uuid=True), db.ForeignKey("units.id", ondelete="SET NULL"))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("name", "parent_id", name="uq_location_name_parent"),
    )

    children = db.relationship(
        "Location", backref=db.backref("parent", remote_side="Location.id"),
        cascade="all, delete-orphan",
    )
    shelf_positions = db.relationship(
        "ShelfPosition", backref="location", cascade="all, delete-orphan"
    )

    def to_dict(self, include_children=False):
        result = {
            "id": str(self.id),
            "name": self.name,
            "parent_id": str(self.parent_id) if self.parent_id else None,
            "location_type": self.location_type,
            "unit_id": str(self.unit_id) if self.unit_id else None,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_children:
            result["children"] = [c.to_dict(include_children=True) for c in self.children]
            result["shelf_positions"] = [s.to_dict() for s in self.shelf_positions]
        return result


class ShelfPosition(db.Model):
    """Individual slot within a location."""

    __tablename__ = "shelf_positions"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
    )
    label = db.Column(db.String(50), nullable=False)
    row_num = db.Column(db.SmallInteger)
    col_num = db.Column(db.SmallInteger)
    occupied = db.Column(db.Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("location_id", "label", name="uq_shelf_position"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "location_id": str(self.location_id),
            "label": self.label,
            "row_num": self.row_num,
            "col_num": self.col_num,
            "occupied": self.occupied,
        }


class Jar(db.Model):
    """Central asset -- a physical jar being tracked through the workflow."""

    __tablename__ = "jars"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tag_id = db.Column(db.String(100), unique=True)
    label = db.Column(db.String(100))
    volume_ml = db.Column(db.Float, default=946)
    status = db.Column(db.String(30), nullable=False, default="clean")
    current_location_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("locations.id", ondelete="SET NULL")
    )
    current_shelf_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("shelf_positions.id", ondelete="SET NULL")
    )
    current_cycle_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("grow_cycles.id", ondelete="SET NULL")
    )
    total_cycles = db.Column(db.Integer, nullable=False, default=0)
    total_yield_g = db.Column(db.Float, nullable=False, default=0)
    notes = db.Column(db.Text)
    retired = db.Column(db.Boolean, nullable=False, default=False)
    retired_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    current_location = db.relationship("Location", foreign_keys=[current_location_id])
    current_shelf = db.relationship("ShelfPosition", foreign_keys=[current_shelf_id])

    def to_dict(self):
        return {
            "id": str(self.id),
            "tag_id": self.tag_id,
            "label": self.label,
            "volume_ml": self.volume_ml,
            "status": self.status,
            "current_location_id": str(self.current_location_id) if self.current_location_id else None,
            "current_shelf_id": str(self.current_shelf_id) if self.current_shelf_id else None,
            "current_cycle_id": str(self.current_cycle_id) if self.current_cycle_id else None,
            "total_cycles": self.total_cycles,
            "total_yield_g": self.total_yield_g,
            "notes": self.notes,
            "retired": self.retired,
            "retired_at": self.retired_at.isoformat() if self.retired_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Batch(db.Model):
    """A group of jars prepared together."""

    __tablename__ = "batches"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_code = db.Column(db.String(30), nullable=False, unique=True)
    strain_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("mushroom_strains.id", ondelete="SET NULL")
    )
    recipe_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("substrate_recipes.id", ondelete="SET NULL")
    )
    status = db.Column(db.String(30), nullable=False, default="preparing")
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    strain = db.relationship("MushroomStrain", foreign_keys=[strain_id])
    recipe = db.relationship("SubstrateRecipe", foreign_keys=[recipe_id])
    batch_jars = db.relationship("BatchJar", backref="batch", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "batch_code": self.batch_code,
            "strain_id": str(self.strain_id) if self.strain_id else None,
            "recipe_id": str(self.recipe_id) if self.recipe_id else None,
            "status": self.status,
            "notes": self.notes,
            "strain": self.strain.to_dict() if self.strain else None,
            "recipe": self.recipe.to_dict() if self.recipe else None,
            "jar_count": len(self.batch_jars) if self.batch_jars else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class BatchJar(db.Model):
    """Many-to-many between batches and jars."""

    __tablename__ = "batch_jars"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("batches.id", ondelete="CASCADE"),
        nullable=False,
    )
    jar_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("jars.id", ondelete="CASCADE"),
        nullable=False,
    )
    added_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("batch_id", "jar_id", name="uq_batch_jar"),
    )

    jar = db.relationship("Jar", foreign_keys=[jar_id])

    def to_dict(self):
        return {
            "id": str(self.id),
            "batch_id": str(self.batch_id),
            "jar_id": str(self.jar_id),
            "added_at": self.added_at.isoformat() if self.added_at else None,
        }


class SterilizationRun(db.Model):
    """An autoclave session for a batch of jars."""

    __tablename__ = "sterilization_runs"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("batches.id", ondelete="CASCADE"),
        nullable=False,
    )
    autoclave_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("autoclave_units.id", ondelete="SET NULL"),
    )
    start_time = db.Column(db.DateTime, default=_utcnow, nullable=False)
    end_time = db.Column(db.DateTime)
    target_temp_c = db.Column(db.Float, default=121)
    target_psi = db.Column(db.Float, default=15)
    duration_min = db.Column(db.Integer, default=90)
    status = db.Column(db.String(30), nullable=False, default="running")
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    jar_assignments = db.relationship(
        "SterilizationJarAssignment", backref="run", cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "batch_id": str(self.batch_id),
            "autoclave_id": str(self.autoclave_id) if self.autoclave_id else None,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "target_temp_c": self.target_temp_c,
            "target_psi": self.target_psi,
            "duration_min": self.duration_min,
            "status": self.status,
            "notes": self.notes,
            "jar_count": len(self.jar_assignments) if self.jar_assignments else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SterilizationJarAssignment(db.Model):
    """Which jars were in each sterilization run."""

    __tablename__ = "sterilization_jar_assignments"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("sterilization_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    jar_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("jars.id", ondelete="CASCADE"),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("run_id", "jar_id", name="uq_sterilization_jar"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "run_id": str(self.run_id),
            "jar_id": str(self.jar_id),
        }


class InoculationSession(db.Model):
    """A session where jars are inoculated with a strain."""

    __tablename__ = "inoculation_sessions"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("batches.id", ondelete="CASCADE"),
        nullable=False,
    )
    strain_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("mushroom_strains.id", ondelete="SET NULL"),
    )
    inoculation_type = db.Column(db.String(50), default="liquid_culture")
    started_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    ended_at = db.Column(db.DateTime)
    operator = db.Column(db.String(100))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    jar_logs = db.relationship(
        "InoculationJarLog", backref="session", cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "batch_id": str(self.batch_id),
            "strain_id": str(self.strain_id) if self.strain_id else None,
            "inoculation_type": self.inoculation_type,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "operator": self.operator,
            "notes": self.notes,
            "jar_count": len(self.jar_logs) if self.jar_logs else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class InoculationJarLog(db.Model):
    """Per-jar record within an inoculation session."""

    __tablename__ = "inoculation_jar_log"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("inoculation_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    jar_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("jars.id", ondelete="CASCADE"),
        nullable=False,
    )
    inoculated_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    cc_injected = db.Column(db.Float)
    injection_site = db.Column(db.String(50))
    notes = db.Column(db.Text)

    __table_args__ = (
        UniqueConstraint("session_id", "jar_id", name="uq_inoculation_jar"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "session_id": str(self.session_id),
            "jar_id": str(self.jar_id),
            "inoculated_at": self.inoculated_at.isoformat() if self.inoculated_at else None,
            "cc_injected": self.cc_injected,
            "injection_site": self.injection_site,
            "notes": self.notes,
        }


class GrowCycle(db.Model):
    """Colonisation + fruiting lifecycle per jar."""

    __tablename__ = "grow_cycles"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jar_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("jars.id", ondelete="CASCADE"),
        nullable=False,
    )
    batch_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("batches.id", ondelete="SET NULL")
    )
    strain_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("mushroom_strains.id", ondelete="SET NULL")
    )
    inoculation_date = db.Column(db.DateTime)
    colonization_start = db.Column(db.DateTime)
    colonization_end = db.Column(db.DateTime)
    fruiting_start = db.Column(db.DateTime)
    fruiting_end = db.Column(db.DateTime)
    status = db.Column(db.String(30), nullable=False, default="colonizing")
    total_yield_g = db.Column(db.Float, nullable=False, default=0)
    biological_efficiency_pct = db.Column(db.Float)
    substrate_dry_weight_g = db.Column(db.Float)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    flushes = db.relationship("Flush", backref="cycle", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "jar_id": str(self.jar_id),
            "batch_id": str(self.batch_id) if self.batch_id else None,
            "strain_id": str(self.strain_id) if self.strain_id else None,
            "inoculation_date": self.inoculation_date.isoformat() if self.inoculation_date else None,
            "colonization_start": self.colonization_start.isoformat() if self.colonization_start else None,
            "colonization_end": self.colonization_end.isoformat() if self.colonization_end else None,
            "fruiting_start": self.fruiting_start.isoformat() if self.fruiting_start else None,
            "fruiting_end": self.fruiting_end.isoformat() if self.fruiting_end else None,
            "status": self.status,
            "total_yield_g": self.total_yield_g,
            "biological_efficiency_pct": self.biological_efficiency_pct,
            "substrate_dry_weight_g": self.substrate_dry_weight_g,
            "notes": self.notes,
            "flushes": [f.to_dict() for f in self.flushes] if self.flushes else [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ColonizationCheck(db.Model):
    """Periodic mycelium growth observation."""

    __tablename__ = "colonization_checks"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jar_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("jars.id", ondelete="CASCADE"),
        nullable=False,
    )
    cycle_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("grow_cycles.id", ondelete="CASCADE")
    )
    check_date = db.Column(db.DateTime, default=_utcnow, nullable=False)
    colonization_pct = db.Column(db.Float, nullable=False, default=0)
    notes = db.Column(db.Text)
    photo_url = db.Column(db.String(500))
    checked_by = db.Column(db.String(100))

    def to_dict(self):
        return {
            "id": str(self.id),
            "jar_id": str(self.jar_id),
            "cycle_id": str(self.cycle_id) if self.cycle_id else None,
            "check_date": self.check_date.isoformat() if self.check_date else None,
            "colonization_pct": self.colonization_pct,
            "notes": self.notes,
            "photo_url": self.photo_url,
            "checked_by": self.checked_by,
        }


class ContaminationRecord(db.Model):
    """Contamination event on a jar."""

    __tablename__ = "contamination_records"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jar_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("jars.id", ondelete="CASCADE"),
        nullable=False,
    )
    cycle_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("grow_cycles.id", ondelete="SET NULL")
    )
    detected_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    contamination_type = db.Column(db.String(80))
    severity = db.Column(db.String(30), default="moderate")
    action_taken = db.Column(db.String(50), default="quarantine")
    disposed_at = db.Column(db.DateTime)
    notes = db.Column(db.Text)
    photo_url = db.Column(db.String(500))

    def to_dict(self):
        return {
            "id": str(self.id),
            "jar_id": str(self.jar_id),
            "cycle_id": str(self.cycle_id) if self.cycle_id else None,
            "detected_at": self.detected_at.isoformat() if self.detected_at else None,
            "contamination_type": self.contamination_type,
            "severity": self.severity,
            "action_taken": self.action_taken,
            "disposed_at": self.disposed_at.isoformat() if self.disposed_at else None,
            "notes": self.notes,
            "photo_url": self.photo_url,
        }


class JarMovement(db.Model):
    """Location transfer log for a jar."""

    __tablename__ = "jar_movements"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jar_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("jars.id", ondelete="CASCADE"),
        nullable=False,
    )
    from_location_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("locations.id", ondelete="SET NULL")
    )
    to_location_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("locations.id", ondelete="SET NULL")
    )
    from_shelf_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("shelf_positions.id", ondelete="SET NULL")
    )
    to_shelf_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("shelf_positions.id", ondelete="SET NULL")
    )
    moved_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    moved_by = db.Column(db.String(100))
    reason = db.Column(db.String(200))

    def to_dict(self):
        return {
            "id": str(self.id),
            "jar_id": str(self.jar_id),
            "from_location_id": str(self.from_location_id) if self.from_location_id else None,
            "to_location_id": str(self.to_location_id) if self.to_location_id else None,
            "from_shelf_id": str(self.from_shelf_id) if self.from_shelf_id else None,
            "to_shelf_id": str(self.to_shelf_id) if self.to_shelf_id else None,
            "moved_at": self.moved_at.isoformat() if self.moved_at else None,
            "moved_by": self.moved_by,
            "reason": self.reason,
        }


class Flush(db.Model):
    """Individual fruiting flush within a grow cycle."""

    __tablename__ = "flushes"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cycle_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("grow_cycles.id", ondelete="CASCADE"),
        nullable=False,
    )
    jar_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("jars.id", ondelete="CASCADE"),
        nullable=False,
    )
    flush_number = db.Column(db.SmallInteger, nullable=False, default=1)
    started_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    harvested_at = db.Column(db.DateTime)
    yield_g = db.Column(db.Float)
    notes = db.Column(db.Text)

    __table_args__ = (
        UniqueConstraint("cycle_id", "flush_number", name="uq_flush_number"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "cycle_id": str(self.cycle_id),
            "jar_id": str(self.jar_id),
            "flush_number": self.flush_number,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "harvested_at": self.harvested_at.isoformat() if self.harvested_at else None,
            "yield_g": self.yield_g,
            "notes": self.notes,
        }


class JarPhoto(db.Model):
    """Image reference for a jar."""

    __tablename__ = "jar_photos"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jar_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("jars.id", ondelete="CASCADE"),
        nullable=False,
    )
    cycle_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("grow_cycles.id", ondelete="SET NULL")
    )
    photo_path = db.Column(db.String(500), nullable=False)
    caption = db.Column(db.String(300))
    taken_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": str(self.id),
            "jar_id": str(self.jar_id),
            "cycle_id": str(self.cycle_id) if self.cycle_id else None,
            "photo_path": self.photo_path,
            "caption": self.caption,
            "taken_at": self.taken_at.isoformat() if self.taken_at else None,
        }


class ScanEvent(db.Model):
    """NFC / QR code scan log."""

    __tablename__ = "scan_events"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jar_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("jars.id", ondelete="SET NULL")
    )
    tag_id = db.Column(db.String(100))
    scanned_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    scanner_id = db.Column(db.String(100))
    action = db.Column(db.String(50))
    scan_metadata = db.Column(JSONB)

    def to_dict(self):
        return {
            "id": str(self.id),
            "jar_id": str(self.jar_id) if self.jar_id else None,
            "tag_id": self.tag_id,
            "scanned_at": self.scanned_at.isoformat() if self.scanned_at else None,
            "scanner_id": self.scanner_id,
            "action": self.action,
            "scan_metadata": self.scan_metadata,
        }


class JarEnvLink(db.Model):
    """Links a jar to an IoT environment sensor device."""

    __tablename__ = "jar_env_links"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jar_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("jars.id", ondelete="CASCADE"),
        nullable=False,
    )
    device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    linked_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    unlinked_at = db.Column(db.DateTime)

    __table_args__ = (
        UniqueConstraint("jar_id", "device_id", name="uq_jar_env_active"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "jar_id": str(self.jar_id),
            "device_id": str(self.device_id),
            "linked_at": self.linked_at.isoformat() if self.linked_at else None,
            "unlinked_at": self.unlinked_at.isoformat() if self.unlinked_at else None,
        }
