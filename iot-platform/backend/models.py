"""
SQLAlchemy models for the IoT Platform.
Defines Device, Telemetry, Command, and Alert tables.
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
# Device model
# ---------------------------------------------------------------------------
class Device(db.Model):
    """Represents a physical IoT device within the facility hierarchy."""

    __tablename__ = "devices"

    # Primary key: UUID generated automatically
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Hierarchical location fields
    facility = db.Column(db.String(128), nullable=False)
    building = db.Column(db.String(128), nullable=False)
    unit = db.Column(db.String(128), nullable=False)
    device_name = db.Column(db.String(128), nullable=False)

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
