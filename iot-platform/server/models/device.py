"""
Device ORM model -- mirrors the existing devices table from the backend.
Read-only from the automation server's perspective.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Boolean, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from models.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Device(Base):
    __tablename__ = "devices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    facility = Column(String(128), nullable=False)
    building = Column(String(128), nullable=False)
    unit = Column(String(128), nullable=False)
    device_name = Column(String(128), nullable=False)
    device_type = Column(String(64), nullable=False)
    registered_at = Column(DateTime, default=_utcnow, nullable=False)
    last_seen = Column(DateTime, nullable=True)
    is_online = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "facility", "building", "unit", "device_name",
            name="uq_device_location",
        ),
    )

    thresholds = relationship("DeviceThreshold", back_populates="device", uselist=False)

    def to_dict(self):
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

    @property
    def topic_prefix(self):
        """Return the MQTT topic prefix for this device."""
        return f"{self.facility}/{self.building}/{self.unit}/{self.device_name}"
