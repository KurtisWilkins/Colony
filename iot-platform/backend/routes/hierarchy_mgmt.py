"""
Blueprint for hierarchy CRUD management.
Provides endpoints to create, read, update, and delete
facilities, buildings, units, and manage device assignments.
"""

import logging

from flask import Blueprint, request, jsonify
from sqlalchemy import func
from models import db, Facility, Building, Unit, Device
from routes.auth import login_required

logger = logging.getLogger(__name__)

hierarchy_mgmt_bp = Blueprint("hierarchy_mgmt", __name__)


# ═══════════════════════════════════════════════════════════════════════════
# Facilities
# ═══════════════════════════════════════════════════════════════════════════

@hierarchy_mgmt_bp.route("/api/manage/facilities", methods=["GET"])
@login_required
def list_facilities():
    """Return all facilities with building and device counts."""
    facilities = Facility.query.order_by(Facility.name).all()
    result = []
    for f in facilities:
        building_count = Building.query.filter_by(facility_id=f.id).count()
        device_count = Device.query.filter_by(facility_id=f.id).count()
        data = f.to_dict()
        data["building_count"] = building_count
        data["device_count"] = device_count
        result.append(data)
    return jsonify(result), 200


@hierarchy_mgmt_bp.route("/api/manage/facilities", methods=["POST"])
@login_required
def create_facility():
    """Create a new facility."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Facility name is required"}), 400

    if Facility.query.filter(func.lower(Facility.name) == name.lower()).first():
        return jsonify({"error": f"Facility '{name}' already exists"}), 409

    facility = Facility(
        name=name,
        description=data.get("description"),
        location=data.get("location"),
    )
    db.session.add(facility)
    db.session.commit()
    return jsonify(facility.to_dict()), 201


@hierarchy_mgmt_bp.route("/api/manage/facilities/<facility_id>", methods=["GET"])
@login_required
def get_facility(facility_id):
    """Return facility with nested buildings and units."""
    facility = Facility.query.get(facility_id)
    if not facility:
        return jsonify({"error": "Facility not found"}), 404

    buildings_data = []
    for b in Building.query.filter_by(facility_id=facility.id).order_by(Building.name).all():
        units_data = []
        for u in Unit.query.filter_by(building_id=b.id).order_by(Unit.name).all():
            ud = u.to_dict()
            ud["device_count"] = Device.query.filter_by(unit_id=u.id).count()
            units_data.append(ud)
        bd = b.to_dict()
        bd["units"] = units_data
        bd["unit_count"] = len(units_data)
        bd["device_count"] = Device.query.filter_by(building_id=b.id).count()
        buildings_data.append(bd)

    result = facility.to_dict()
    result["buildings"] = buildings_data
    return jsonify(result), 200


@hierarchy_mgmt_bp.route("/api/manage/facilities/<facility_id>", methods=["PUT"])
@login_required
def update_facility(facility_id):
    """Update facility fields."""
    facility = Facility.query.get(facility_id)
    if not facility:
        return jsonify({"error": "Facility not found"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    if "name" in data:
        new_name = (data["name"] or "").strip()
        if not new_name:
            return jsonify({"error": "Facility name cannot be empty"}), 400
        existing = Facility.query.filter(
            func.lower(Facility.name) == new_name.lower(),
            Facility.id != facility.id,
        ).first()
        if existing:
            return jsonify({"error": f"Facility '{new_name}' already exists"}), 409
        facility.name = new_name

    if "description" in data:
        facility.description = data["description"]
    if "location" in data:
        facility.location = data["location"]

    db.session.commit()
    return jsonify(facility.to_dict()), 200


@hierarchy_mgmt_bp.route("/api/manage/facilities/<facility_id>", methods=["DELETE"])
@login_required
def delete_facility(facility_id):
    """Delete facility. Blocked if devices are assigned."""
    facility = Facility.query.get(facility_id)
    if not facility:
        return jsonify({"error": "Facility not found"}), 404

    device_count = Device.query.filter_by(facility_id=facility.id).count()
    if device_count > 0:
        return jsonify({
            "error": f"Cannot delete — {device_count} device(s) assigned to this facility"
        }), 409

    db.session.delete(facility)
    db.session.commit()
    return jsonify({"message": "Facility deleted"}), 200


# ═══════════════════════════════════════════════════════════════════════════
# Buildings
# ═══════════════════════════════════════════════════════════════════════════

@hierarchy_mgmt_bp.route("/api/manage/buildings", methods=["GET"])
@login_required
def list_buildings():
    """Return buildings for a facility."""
    facility_id = request.args.get("facility_id")
    if not facility_id:
        return jsonify({"error": "facility_id query parameter is required"}), 400

    buildings = Building.query.filter_by(facility_id=facility_id).order_by(Building.name).all()
    result = []
    for b in buildings:
        unit_count = Unit.query.filter_by(building_id=b.id).count()
        device_count = Device.query.filter_by(building_id=b.id).count()
        data = b.to_dict()
        data["unit_count"] = unit_count
        data["device_count"] = device_count
        result.append(data)
    return jsonify(result), 200


@hierarchy_mgmt_bp.route("/api/manage/buildings", methods=["POST"])
@login_required
def create_building():
    """Create a new building within a facility."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    facility_id = data.get("facility_id")
    name = (data.get("name") or "").strip()

    if not facility_id or not name:
        return jsonify({"error": "facility_id and name are required"}), 400

    facility = Facility.query.get(facility_id)
    if not facility:
        return jsonify({"error": "Facility not found"}), 404

    existing = Building.query.filter_by(facility_id=facility_id, name=name).first()
    if existing:
        return jsonify({"error": f"Building '{name}' already exists in this facility"}), 409

    building = Building(
        facility_id=facility_id,
        name=name,
        description=data.get("description"),
        floor_count=data.get("floor_count", 1),
    )
    db.session.add(building)
    db.session.commit()
    return jsonify(building.to_dict()), 201


@hierarchy_mgmt_bp.route("/api/manage/buildings/<building_id>", methods=["GET"])
@login_required
def get_building(building_id):
    """Return building with nested units."""
    building = Building.query.get(building_id)
    if not building:
        return jsonify({"error": "Building not found"}), 404

    units_data = []
    for u in Unit.query.filter_by(building_id=building.id).order_by(Unit.name).all():
        ud = u.to_dict()
        ud["device_count"] = Device.query.filter_by(unit_id=u.id).count()
        units_data.append(ud)

    result = building.to_dict()
    result["units"] = units_data
    return jsonify(result), 200


@hierarchy_mgmt_bp.route("/api/manage/buildings/<building_id>", methods=["PUT"])
@login_required
def update_building(building_id):
    """Update building fields."""
    building = Building.query.get(building_id)
    if not building:
        return jsonify({"error": "Building not found"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    if "name" in data:
        new_name = (data["name"] or "").strip()
        if not new_name:
            return jsonify({"error": "Building name cannot be empty"}), 400
        existing = Building.query.filter(
            Building.facility_id == building.facility_id,
            Building.name == new_name,
            Building.id != building.id,
        ).first()
        if existing:
            return jsonify({"error": f"Building '{new_name}' already exists in this facility"}), 409
        building.name = new_name

    if "description" in data:
        building.description = data["description"]
    if "floor_count" in data:
        building.floor_count = data["floor_count"]

    db.session.commit()
    return jsonify(building.to_dict()), 200


@hierarchy_mgmt_bp.route("/api/manage/buildings/<building_id>", methods=["DELETE"])
@login_required
def delete_building(building_id):
    """Delete building. Blocked if devices are assigned."""
    building = Building.query.get(building_id)
    if not building:
        return jsonify({"error": "Building not found"}), 404

    device_count = Device.query.filter_by(building_id=building.id).count()
    if device_count > 0:
        return jsonify({
            "error": f"Cannot delete — {device_count} device(s) assigned to this building"
        }), 409

    db.session.delete(building)
    db.session.commit()
    return jsonify({"message": "Building deleted"}), 200


# ═══════════════════════════════════════════════════════════════════════════
# Units
# ═══════════════════════════════════════════════════════════════════════════

@hierarchy_mgmt_bp.route("/api/manage/units", methods=["GET"])
@login_required
def list_units():
    """Return units for a building."""
    building_id = request.args.get("building_id")
    if not building_id:
        return jsonify({"error": "building_id query parameter is required"}), 400

    units = Unit.query.filter_by(building_id=building_id).order_by(Unit.name).all()
    result = []
    for u in units:
        device_count = Device.query.filter_by(unit_id=u.id).count()
        data = u.to_dict()
        data["device_count"] = device_count
        result.append(data)
    return jsonify(result), 200


@hierarchy_mgmt_bp.route("/api/manage/units", methods=["POST"])
@login_required
def create_unit():
    """Create a new unit within a building."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    building_id = data.get("building_id")
    name = (data.get("name") or "").strip()

    if not building_id or not name:
        return jsonify({"error": "building_id and name are required"}), 400

    building = Building.query.get(building_id)
    if not building:
        return jsonify({"error": "Building not found"}), 404

    existing = Unit.query.filter_by(building_id=building_id, name=name).first()
    if existing:
        return jsonify({"error": f"Unit '{name}' already exists in this building"}), 409

    valid_types = ["grow_tent", "reservoir", "server_room", "other"]
    unit_type = data.get("unit_type", "grow_tent")
    if unit_type not in valid_types:
        return jsonify({"error": f"unit_type must be one of: {', '.join(valid_types)}"}), 400

    unit = Unit(
        building_id=building_id,
        name=name,
        description=data.get("description"),
        unit_type=unit_type,
    )
    db.session.add(unit)
    db.session.commit()
    return jsonify(unit.to_dict()), 201


@hierarchy_mgmt_bp.route("/api/manage/units/<unit_id>", methods=["GET"])
@login_required
def get_unit(unit_id):
    """Return unit with assigned devices."""
    unit = Unit.query.get(unit_id)
    if not unit:
        return jsonify({"error": "Unit not found"}), 404

    devices = Device.query.filter_by(unit_id=unit.id).order_by(Device.device_name).all()
    result = unit.to_dict()
    result["devices"] = [d.to_dict() for d in devices]
    return jsonify(result), 200


@hierarchy_mgmt_bp.route("/api/manage/units/<unit_id>", methods=["PUT"])
@login_required
def update_unit(unit_id):
    """Update unit fields."""
    unit = Unit.query.get(unit_id)
    if not unit:
        return jsonify({"error": "Unit not found"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    if "name" in data:
        new_name = (data["name"] or "").strip()
        if not new_name:
            return jsonify({"error": "Unit name cannot be empty"}), 400
        existing = Unit.query.filter(
            Unit.building_id == unit.building_id,
            Unit.name == new_name,
            Unit.id != unit.id,
        ).first()
        if existing:
            return jsonify({"error": f"Unit '{new_name}' already exists in this building"}), 409
        unit.name = new_name

    if "description" in data:
        unit.description = data["description"]
    if "unit_type" in data:
        valid_types = ["grow_tent", "reservoir", "server_room", "other"]
        if data["unit_type"] not in valid_types:
            return jsonify({"error": f"unit_type must be one of: {', '.join(valid_types)}"}), 400
        unit.unit_type = data["unit_type"]

    db.session.commit()
    return jsonify(unit.to_dict()), 200


@hierarchy_mgmt_bp.route("/api/manage/units/<unit_id>", methods=["DELETE"])
@login_required
def delete_unit(unit_id):
    """Delete unit. Blocked if devices are assigned."""
    unit = Unit.query.get(unit_id)
    if not unit:
        return jsonify({"error": "Unit not found"}), 404

    device_count = Device.query.filter_by(unit_id=unit.id).count()
    if device_count > 0:
        return jsonify({
            "error": f"Cannot delete — {device_count} device(s) assigned to this unit"
        }), 409

    db.session.delete(unit)
    db.session.commit()
    return jsonify({"message": "Unit deleted"}), 200


# ═══════════════════════════════════════════════════════════════════════════
# Device assignment
# ═══════════════════════════════════════════════════════════════════════════

@hierarchy_mgmt_bp.route("/api/manage/devices/unassigned", methods=["GET"])
@login_required
def get_unassigned_devices():
    """Return devices that have no unit_id assigned."""
    devices = Device.query.filter(Device.unit_id.is_(None)).order_by(Device.device_name).all()
    return jsonify([d.to_dict() for d in devices]), 200


@hierarchy_mgmt_bp.route("/api/manage/devices/<device_id>/assign", methods=["PUT"])
@login_required
def assign_device(device_id):
    """Assign a device to a facility/building/unit."""
    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    unit_id = data.get("unit_id")
    if not unit_id:
        return jsonify({"error": "unit_id is required"}), 400

    unit = Unit.query.get(unit_id)
    if not unit:
        return jsonify({"error": "Unit not found"}), 404

    building = Building.query.get(unit.building_id)
    if not building:
        return jsonify({"error": "Building not found"}), 404

    facility = Facility.query.get(building.facility_id)
    if not facility:
        return jsonify({"error": "Facility not found"}), 404

    # Update FK references
    device.facility_id = facility.id
    device.building_id = building.id
    device.unit_id = unit.id

    # Update string columns for MQTT topic backward compatibility
    device.facility = facility.name
    device.building = building.name
    device.unit = unit.name

    db.session.commit()
    return jsonify(device.to_dict()), 200


@hierarchy_mgmt_bp.route("/api/manage/devices/<device_id>/assign", methods=["DELETE"])
@login_required
def unassign_device(device_id):
    """Remove unit assignment from a device."""
    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    device.facility_id = None
    device.building_id = None
    device.unit_id = None

    db.session.commit()
    return jsonify(device.to_dict()), 200


# ═══════════════════════════════════════════════════════════════════════════
# Full hierarchy tree
# ═══════════════════════════════════════════════════════════════════════════

@hierarchy_mgmt_bp.route("/api/manage/tree", methods=["GET"])
@login_required
def get_tree():
    """Return complete nested hierarchy tree."""
    facilities = Facility.query.order_by(Facility.name).all()
    result = []

    for f in facilities:
        buildings_data = []
        for b in Building.query.filter_by(facility_id=f.id).order_by(Building.name).all():
            units_data = []
            for u in Unit.query.filter_by(building_id=b.id).order_by(Unit.name).all():
                devices = Device.query.filter_by(unit_id=u.id).order_by(Device.device_name).all()
                units_data.append({
                    "unit": u.to_dict(),
                    "devices": [
                        {
                            "id": str(d.id),
                            "device_name": d.device_name,
                            "is_online": d.is_online,
                            "last_seen": d.last_seen.isoformat() if d.last_seen else None,
                        }
                        for d in devices
                    ],
                })
            buildings_data.append({
                "building": b.to_dict(),
                "units": units_data,
            })
        result.append({
            "facility": f.to_dict(),
            "buildings": buildings_data,
        })

    return jsonify(result), 200
