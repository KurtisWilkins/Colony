"""
Blueprint for telemetry data retrieval.
Provides endpoints to query historical and latest telemetry for a device.
"""

from datetime import datetime

from flask import Blueprint, request, jsonify
from models import db, Device, Telemetry

# Blueprint registered under /api/telemetry in app.py
telemetry_bp = Blueprint("telemetry", __name__)


# ---------------------------------------------------------------------------
# GET /api/telemetry/<device_id>  -- paginated telemetry history
# ---------------------------------------------------------------------------
@telemetry_bp.route("/api/telemetry/<device_id>", methods=["GET"])
def get_telemetry(device_id):
    """
    Return telemetry records for the given device.
    Query parameters:
      ?limit=  - max number of records to return (default 100)
      ?since=  - ISO 8601 timestamp; only records after this time
      ?until=  - ISO 8601 timestamp; only records before this time
    Records are returned newest-first.
    """
    # Verify the device exists
    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    # Start building the query
    query = Telemetry.query.filter_by(device_id=device_id)

    # Optional: filter by time range
    since = request.args.get("since")
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            query = query.filter(Telemetry.received_at >= since_dt)
        except ValueError:
            return jsonify({"error": "Invalid 'since' timestamp format. Use ISO 8601."}), 400

    until = request.args.get("until")
    if until:
        try:
            until_dt = datetime.fromisoformat(until)
            query = query.filter(Telemetry.received_at <= until_dt)
        except ValueError:
            return jsonify({"error": "Invalid 'until' timestamp format. Use ISO 8601."}), 400

    # Limit the number of returned records (default 100, capped at 10000)
    try:
        limit = min(int(request.args.get("limit", 100)), 10000)
    except ValueError:
        limit = 100

    # Order by most recent first and apply limit
    records = query.order_by(Telemetry.received_at.desc()).limit(limit).all()

    return jsonify([r.to_dict() for r in records]), 200


# ---------------------------------------------------------------------------
# GET /api/telemetry/latest/<device_id>  -- most recent telemetry record
# ---------------------------------------------------------------------------
@telemetry_bp.route("/api/telemetry/latest/<device_id>", methods=["GET"])
def get_latest_telemetry(device_id):
    """Return only the single most recent telemetry record for a device."""
    # Verify the device exists
    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    record = (
        Telemetry.query
        .filter_by(device_id=device_id)
        .order_by(Telemetry.received_at.desc())
        .first()
    )

    if not record:
        return jsonify({"error": "No telemetry data available for this device"}), 404

    return jsonify(record.to_dict()), 200
