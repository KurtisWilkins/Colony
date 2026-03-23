"""Command ORM model -- mirrors the existing commands table."""

from datetime import datetime, timezone

from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from models.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Command(Base):
    __tablename__ = "commands"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    device_id = Column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    issued_at = Column(DateTime, default=_utcnow, nullable=False)
    command_type = Column(String(64), nullable=False)
    payload = Column(JSONB, nullable=True)
    acknowledged = Column(Boolean, default=False, nullable=False)
    acknowledged_at = Column(DateTime, nullable=True)

    def to_dict(self):
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
