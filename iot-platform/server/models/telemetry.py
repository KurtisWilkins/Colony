"""Telemetry ORM model -- mirrors the existing telemetry table."""

from datetime import datetime, timezone

from sqlalchemy import Column, BigInteger, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from models.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Telemetry(Base):
    __tablename__ = "telemetry"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    device_id = Column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    received_at = Column(DateTime, default=_utcnow, nullable=False)
    payload = Column(JSONB, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "received_at": self.received_at.isoformat() if self.received_at else None,
            "payload": self.payload,
        }
