"""
Flask blueprint for water usage data.

Endpoints:
    GET /api/water/<device_id>/sessions                  -- paginated, filterable
    GET /api/water/<device_id>/sessions/<session_id>     -- single session
    GET /api/water/<device_id>/summary                   -- totals and averages
    GET /api/water/summary                               -- all devices
"""

import logging
from datetime import datetime, timezone, timedelta

from flask import Blueprint, jsonify, request

from db.connection import get_session
from models.water_usage import WaterUsageSession
from models.device import Device
from sqlalchemy import func, and_

logger = logging.getLogger(__name__)

water_usage_bp = Blueprint("water_usage", __name__)


@water_usage_bp.route("/api/water/<device_id>/sessions", methods=["GET"])
def get_sessions(device_id):
    """
    Get water usage sessions for a device.
    Query params: page (default 1), per_page (default 20),
                  trigger_type, completed, start_after, start_before
    """
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    per_page = min(per_page, 100)  # Cap at 100

    session = get_session()
    try:
        # Verify device exists
        device = session.query(Device).filter_by(id=device_id).first()
        if not device:
            return jsonify({"error": "Device not found"}), 404

        query = session.query(WaterUsageSession).filter_by(device_id=device_id)

        # Apply filters
        trigger_type = request.args.get("trigger_type")
        if trigger_type:
            query = query.filter_by(trigger_type=trigger_type)

        completed = request.args.get("completed")
        if completed is not None:
            query = query.filter_by(completed=completed.lower() == "true")

        start_after = request.args.get("start_after")
        if start_after:
            try:
                dt = datetime.fromisoformat(start_after)
                query = query.filter(WaterUsageSession.session_start >= dt)
            except ValueError:
                pass

        start_before = request.args.get("start_before")
        if start_before:
            try:
                dt = datetime.fromisoformat(start_before)
                query = query.filter(WaterUsageSession.session_start <= dt)
            except ValueError:
                pass

        # Get total count
        total = query.count()

        # Paginate
        sessions = (
            query.order_by(WaterUsageSession.session_start.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )

        return jsonify({
            "sessions": [s.to_dict() for s in sessions],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page if per_page > 0 else 0,
        }), 200

    except Exception:
        logger.exception("Error getting sessions for device %s", device_id)
        return jsonify({"error": "Internal server error"}), 500
    finally:
        session.close()


@water_usage_bp.route("/api/water/<device_id>/sessions/<int:session_id>", methods=["GET"])
def get_session_detail(device_id, session_id):
    """Get a single water usage session."""
    session = get_session()
    try:
        water_session = session.query(WaterUsageSession).filter_by(
            id=session_id, device_id=device_id,
        ).first()

        if not water_session:
            return jsonify({"error": "Session not found"}), 404

        return jsonify(water_session.to_dict()), 200

    except Exception:
        logger.exception("Error getting session %d for device %s", session_id, device_id)
        return jsonify({"error": "Internal server error"}), 500
    finally:
        session.close()


@water_usage_bp.route("/api/water/<device_id>/summary", methods=["GET"])
def get_device_summary(device_id):
    """
    Get water usage summary for a device.
    Returns totals for today, this week, this month, all time, plus averages.
    """
    session = get_session()
    try:
        device = session.query(Device).filter_by(id=device_id).first()
        if not device:
            return jsonify({"error": "Device not found"}), 404

        summary = _build_summary(session, device_id)
        return jsonify(summary), 200

    except Exception:
        logger.exception("Error getting summary for device %s", device_id)
        return jsonify({"error": "Internal server error"}), 500
    finally:
        session.close()


@water_usage_bp.route("/api/water/summary", methods=["GET"])
def get_all_summary():
    """Get water usage summary across all devices."""
    session = get_session()
    try:
        # Get all devices that have water sessions
        device_ids = session.query(WaterUsageSession.device_id).distinct().all()
        device_ids = [str(d[0]) for d in device_ids]

        summaries = {}
        for device_id in device_ids:
            device = session.query(Device).filter_by(id=device_id).first()
            device_name = device.device_name if device else device_id
            summaries[device_name] = _build_summary(session, device_id)

        # Build aggregate totals
        totals = _build_summary(session, device_id=None)

        return jsonify({
            "devices": summaries,
            "totals": totals,
        }), 200

    except Exception:
        logger.exception("Error getting all-device water summary")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        session.close()


def _build_summary(session, device_id=None):
    """
    Build a water usage summary with totals and averages.

    Args:
        session: DB session.
        device_id: Optional device UUID filter. None = all devices.

    Returns:
        Dict with today, week, month, all_time, averages.
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)

    def _query_period(start_dt, end_dt=None):
        """Query totals for a time period."""
        q = session.query(
            func.count(WaterUsageSession.id),
            func.coalesce(func.sum(WaterUsageSession.liters_used), 0),
            func.coalesce(func.sum(WaterUsageSession.duration_s), 0),
        ).filter(
            WaterUsageSession.completed == True,
            WaterUsageSession.session_start >= start_dt,
        )
        if device_id:
            q = q.filter(WaterUsageSession.device_id == device_id)
        if end_dt:
            q = q.filter(WaterUsageSession.session_start < end_dt)

        result = q.first()
        return {
            "session_count": result[0] or 0,
            "total_liters": round(float(result[1] or 0), 2),
            "total_duration_s": round(float(result[2] or 0), 1),
        }

    def _query_all_time():
        """Query all-time totals."""
        q = session.query(
            func.count(WaterUsageSession.id),
            func.coalesce(func.sum(WaterUsageSession.liters_used), 0),
            func.coalesce(func.sum(WaterUsageSession.duration_s), 0),
            func.coalesce(func.avg(WaterUsageSession.liters_used), 0),
            func.coalesce(func.avg(WaterUsageSession.duration_s), 0),
        ).filter(
            WaterUsageSession.completed == True,
        )
        if device_id:
            q = q.filter(WaterUsageSession.device_id == device_id)

        result = q.first()
        return {
            "session_count": result[0] or 0,
            "total_liters": round(float(result[1] or 0), 2),
            "total_duration_s": round(float(result[2] or 0), 1),
            "avg_liters_per_session": round(float(result[3] or 0), 2),
            "avg_duration_s": round(float(result[4] or 0), 1),
        }

    today = _query_period(today_start)
    week = _query_period(week_start)
    month = _query_period(month_start)
    all_time = _query_all_time()

    return {
        "today": today,
        "week": week,
        "month": month,
        "all_time": all_time,
        "averages": {
            "liters_per_session": all_time["avg_liters_per_session"],
            "duration_per_session_s": all_time["avg_duration_s"],
        },
    }
