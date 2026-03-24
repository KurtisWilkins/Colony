"""AutomationEvent ORM model for the audit log."""

from datetime import datetime, timezone

from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB

from models.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class AutomationEvent(Base):
    __tablename__ = "automation_events"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    device_id = Column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_time = Column(DateTime, nullable=False, default=_utcnow)
    rule_name = Column(String(128), nullable=False)
    trigger_value = Column(JSONB, nullable=True)
    action_taken = Column(String(256), nullable=False)
    command_sent = Column(JSONB, nullable=True)
    autonomous = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        Index("idx_automation_events_device", "device_id"),
        Index("idx_automation_events_time", "event_time"),
    )

    def to_dict(self):
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
