"""WaterUsageSession ORM model for valve open/close cycles."""

from datetime import datetime, timezone

from sqlalchemy import Column, BigInteger, String, Float, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID

from models.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class WaterUsageSession(Base):
    __tablename__ = "water_usage_sessions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    device_id = Column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_start = Column(DateTime, nullable=False, default=_utcnow)
    session_end = Column(DateTime, nullable=True)
    duration_s = Column(Float, nullable=True)
    liters_used = Column(Float, nullable=True)
    trigger_type = Column(String(64), nullable=False, default="manual")
    trigger_source = Column(String(128), nullable=True)
    tank_pct_start = Column(Float, nullable=True)
    tank_pct_end = Column(Float, nullable=True)
    completed = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index("idx_water_sessions_device", "device_id"),
        Index("idx_water_sessions_start", "session_start"),
    )

    def to_dict(self):
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
