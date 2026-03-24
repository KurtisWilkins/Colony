"""
AlertManager -- deduplicates alerts and manages alert lifecycle.
"""

import logging
from datetime import datetime, timezone

from db.connection import get_session
from models.device import Device

logger = logging.getLogger(__name__)

# Import Alert from the backend's model pattern
# The alerts table already exists in the shared database
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from models.base import Base


class Alert(Base):
    """Mirrors the existing alerts table."""
    __tablename__ = "alerts"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    triggered_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    alert_type = Column(String(64), nullable=False)
    message = Column(Text, nullable=True)
    resolved = Column(Boolean, default=False, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": str(self.device_id),
            "triggered_at": self.triggered_at.isoformat() if self.triggered_at else None,
            "alert_type": self.alert_type,
            "message": self.message,
            "resolved": self.resolved,
        }


class AlertManager:
    """
    Manages alert lifecycle with deduplication.
    Only one unresolved alert of a given type per device at a time.
    """

    def __init__(self):
        pass

    def create_alert(self, device_id, alert_type, message):
        """
        Create an alert if no unresolved alert of the same type exists for this device.

        Args:
            device_id: UUID of the device.
            alert_type: Alert type string (e.g. 'temp_high').
            message: Human-readable alert description.

        Returns:
            The Alert instance if created, None if deduplicated.
        """
        session = get_session()
        try:
            # Check for existing unresolved alert of same type
            existing = session.query(Alert).filter_by(
                device_id=str(device_id),
                alert_type=alert_type,
                resolved=False,
            ).first()

            if existing:
                logger.debug(
                    "Skipping duplicate alert %s for device %s (existing id=%d)",
                    alert_type, device_id, existing.id,
                )
                return None

            alert = Alert(
                device_id=str(device_id),
                alert_type=alert_type,
                message=message,
                resolved=False,
            )
            session.add(alert)
            session.commit()
            logger.info("Created alert: %s for device %s -- %s", alert_type, device_id, message)
            return alert
        except Exception:
            session.rollback()
            logger.exception("Failed to create alert %s for device %s", alert_type, device_id)
            return None
        finally:
            session.close()

    def resolve_alert(self, device_id, alert_type):
        """
        Resolve all unresolved alerts of a given type for a device.

        Args:
            device_id: UUID of the device.
            alert_type: Alert type string to resolve.

        Returns:
            Number of alerts resolved.
        """
        session = get_session()
        try:
            alerts = session.query(Alert).filter_by(
                device_id=str(device_id),
                alert_type=alert_type,
                resolved=False,
            ).all()

            count = 0
            for alert in alerts:
                alert.resolved = True
                count += 1

            if count > 0:
                session.commit()
                logger.info("Resolved %d alert(s) of type %s for device %s", count, alert_type, device_id)
            return count
        except Exception:
            session.rollback()
            logger.exception("Failed to resolve alerts for device %s", device_id)
            return 0
        finally:
            session.close()

    def get_active_alerts(self, device_id=None):
        """
        Get all unresolved alerts, optionally filtered by device.

        Args:
            device_id: Optional UUID to filter by device.

        Returns:
            List of Alert dicts.
        """
        session = get_session()
        try:
            query = session.query(Alert).filter_by(resolved=False)
            if device_id:
                query = query.filter_by(device_id=str(device_id))
            alerts = query.order_by(Alert.triggered_at.desc()).all()
            return [a.to_dict() for a in alerts]
        except Exception:
            logger.exception("Failed to get active alerts")
            return []
        finally:
            session.close()
