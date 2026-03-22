"""
Blueprint for querying the facility/building/unit/device hierarchy.
Provides nested tree views of the organisational structure.
"""

from flask import Blueprint, jsonify
from models import db, Device

# Blueprint registered under /api/hierarchy in app.py
hierarchy_bp = Blueprint("hierarchy", __name__)


# ---------------------------------------------------------------------------
# GET /api/hierarchy  -- full nested tree
# ---------------------------------------------------------------------------
@hierarchy_bp.route("/api/hierarchy", methods=["GET"])
def get_full_hierarchy():
    """
    Return the complete facility -> building -> unit -> device hierarchy
    as a nested JSON structure.
    """
    devices = Device.query.order_by(
        Device.facility, Device.building, Device.unit, Device.device_name
    ).all()

    # Build a nested dict keyed by facility -> building -> unit
    tree = {}
    for d in devices:
        tree.setdefault(d.facility, {})
        tree[d.facility].setdefault(d.building, {})
        tree[d.facility][d.building].setdefault(d.unit, [])
        tree[d.facility][d.building][d.unit].append(d.to_dict())

    # Convert the nested dict into the specified JSON shape
    result = {
        "facilities": [
            {
                "name": facility,
                "buildings": [
                    {
                        "name": building,
                        "units": [
                            {
                                "name": unit,
                                "devices": devices_list,
                            }
                            for unit, devices_list in buildings.items()
                        ],
                    }
                    for building, buildings in facilities.items()
                ],
            }
            for facility, facilities in tree.items()
        ]
    }

    return jsonify(result), 200


# ---------------------------------------------------------------------------
# GET /api/hierarchy/<facility>  -- buildings within a facility
# ---------------------------------------------------------------------------
@hierarchy_bp.route("/api/hierarchy/<facility>", methods=["GET"])
def get_buildings(facility):
    """Return all distinct buildings within the specified facility."""
    # Query distinct building names for this facility
    rows = (
        db.session.query(Device.building)
        .filter(Device.facility == facility)
        .distinct()
        .order_by(Device.building)
        .all()
    )

    if not rows:
        return jsonify({"error": f"No buildings found for facility '{facility}'"}), 404

    buildings = [{"name": row[0]} for row in rows]
    return jsonify({"facility": facility, "buildings": buildings}), 200


# ---------------------------------------------------------------------------
# GET /api/hierarchy/<facility>/<building>  -- units within a building
# ---------------------------------------------------------------------------
@hierarchy_bp.route("/api/hierarchy/<facility>/<building>", methods=["GET"])
def get_units(facility, building):
    """Return all distinct units within the specified facility and building."""
    rows = (
        db.session.query(Device.unit)
        .filter(Device.facility == facility, Device.building == building)
        .distinct()
        .order_by(Device.unit)
        .all()
    )

    if not rows:
        return jsonify({
            "error": f"No units found for facility '{facility}', building '{building}'"
        }), 404

    units = [{"name": row[0]} for row in rows]
    return jsonify({"facility": facility, "building": building, "units": units}), 200


# ---------------------------------------------------------------------------
# GET /api/hierarchy/<facility>/<building>/<unit>  -- devices within a unit
# ---------------------------------------------------------------------------
@hierarchy_bp.route("/api/hierarchy/<facility>/<building>/<unit>", methods=["GET"])
def get_devices_in_unit(facility, building, unit):
    """Return all devices within the specified facility, building, and unit."""
    devices = (
        Device.query
        .filter_by(facility=facility, building=building, unit=unit)
        .order_by(Device.device_name)
        .all()
    )

    if not devices:
        return jsonify({
            "error": f"No devices found for facility '{facility}', "
                     f"building '{building}', unit '{unit}'"
        }), 404

    return jsonify({
        "facility": facility,
        "building": building,
        "unit": unit,
        "devices": [d.to_dict() for d in devices],
    }), 200
