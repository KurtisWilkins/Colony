"""
Blueprint for mushroom jar inventory management.
Provides endpoints for jars, batches, sterilization, inoculation,
colonization checks, contamination, movements, flushes/harvests,
scanning, analytics, and reference data.
"""

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta, date

from flask import Blueprint, request, jsonify
from sqlalchemy import func, desc

from models import (
    db, Jar, Batch, BatchJar, GrowCycle, ColonizationCheck,
    ContaminationRecord, JarMovement, Flush, ScanEvent, JarPhoto,
    MushroomStrain, SubstrateRecipe, SubstrateRecipeComponent,
    AutoclaveUnit, Location, ShelfPosition,
    SterilizationRun, SterilizationJarAssignment,
    InoculationSession, InoculationJarLog,
)
from routes.auth import login_required

logger = logging.getLogger(__name__)

inventory_bp = Blueprint("inventory", __name__)


def _utcnow():
    return datetime.now(timezone.utc)


# ═══════════════════════════════════════════════════════════════════════════
# JARS
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/jars", methods=["POST"])
@login_required
def create_jar():
    data = request.get_json(silent=True) or {}
    tag_id = (data.get("tag_id") or "").strip()
    if not tag_id:
        return jsonify({"error": "tag_id is required"}), 400
    if Jar.query.filter_by(tag_id=tag_id).first():
        return jsonify({"error": f"Tag '{tag_id}' already registered"}), 409
    jar = Jar(
        tag_id=tag_id,
        tag_type=data.get("tag_type", "nfc"),
        jar_size_ml=data.get("jar_size_ml", 1000),
        jar_material=data.get("jar_material", "glass"),
        lid_type=data.get("lid_type"),
        purchase_date=data.get("purchase_date"),
        purchase_batch=data.get("purchase_batch"),
        notes=data.get("notes"),
    )
    db.session.add(jar)
    db.session.commit()
    return jsonify(jar.to_dict()), 201


@inventory_bp.route("/api/inventory/jars", methods=["GET"])
@login_required
def list_jars():
    query = Jar.query
    status = request.args.get("status")
    if status:
        query = query.filter(Jar.status == status)
    location_id = request.args.get("location_id")
    if location_id:
        query = query.filter(Jar.current_location_id == location_id)
    try:
        limit = min(int(request.args.get("limit", 50)), 500)
    except ValueError:
        limit = 50
    try:
        offset = max(int(request.args.get("offset", 0)), 0)
    except ValueError:
        offset = 0
    total = query.count()
    jars = query.order_by(Jar.created_at.desc()).offset(offset).limit(limit).all()
    return jsonify({"total": total, "limit": limit, "offset": offset,
                    "jars": [j.to_dict() for j in jars]}), 200


@inventory_bp.route("/api/inventory/jars/<jar_id>", methods=["GET"])
@login_required
def get_jar(jar_id):
    jar = Jar.query.get(jar_id)
    if not jar:
        return jsonify({"error": "Jar not found"}), 404
    result = jar.to_dict()
    # Add cycle info
    if jar.current_cycle_id:
        cycle = GrowCycle.query.get(jar.current_cycle_id)
        result["current_cycle"] = cycle.to_dict() if cycle else None
    # Recent checks
    checks = ColonizationCheck.query.filter_by(jar_id=jar.id).order_by(
        ColonizationCheck.checked_at.desc()).limit(10).all()
    result["recent_checks"] = [c.to_dict() for c in checks]
    # Flushes
    flushes = Flush.query.filter_by(jar_id=jar.id).order_by(Flush.flush_number).all()
    result["flushes"] = [f.to_dict() for f in flushes]
    # Movements
    moves = JarMovement.query.filter_by(jar_id=jar.id).order_by(
        JarMovement.moved_at.desc()).limit(20).all()
    result["movements"] = [m.to_dict() for m in moves]
    return jsonify(result), 200


@inventory_bp.route("/api/inventory/jars/by-tag/<tag_id>", methods=["GET"])
@login_required
def get_jar_by_tag(tag_id):
    jar = Jar.query.filter_by(tag_id=tag_id).first()
    # Log scan event
    scan = ScanEvent(
        tag_id=tag_id,
        jar_id=jar.id if jar else None,
        scanner_type=request.args.get("scanner_type", "nfc_phone"),
        scanner_id=request.args.get("scanner_id"),
        action_triggered="jar_lookup",
    )
    db.session.add(scan)
    db.session.commit()
    if not jar:
        return jsonify({"status": "unknown_tag", "tag_id": tag_id}), 200
    if jar.status == "retired":
        return jsonify({"status": "retired", "jar": jar.to_dict()}), 200
    result = jar.to_dict()
    if jar.current_cycle_id:
        cycle = GrowCycle.query.get(jar.current_cycle_id)
        result["current_cycle"] = cycle.to_dict() if cycle else None
    return jsonify(result), 200


@inventory_bp.route("/api/inventory/jars/<jar_id>", methods=["PUT"])
@login_required
def update_jar(jar_id):
    jar = Jar.query.get(jar_id)
    if not jar:
        return jsonify({"error": "Jar not found"}), 404
    data = request.get_json(silent=True) or {}
    for field in ["jar_size_ml", "jar_material", "lid_type", "notes"]:
        if field in data:
            setattr(jar, field, data[field])
    db.session.commit()
    return jsonify(jar.to_dict()), 200


@inventory_bp.route("/api/inventory/jars/<jar_id>/retire", methods=["POST"])
@login_required
def retire_jar(jar_id):
    jar = Jar.query.get(jar_id)
    if not jar:
        return jsonify({"error": "Jar not found"}), 404
    data = request.get_json(silent=True) or {}
    jar.status = "retired"
    jar.retired_at = _utcnow()
    jar.retirement_reason = data.get("reason", "")
    # Close open cycles
    if jar.current_cycle_id:
        cycle = GrowCycle.query.get(jar.current_cycle_id)
        if cycle:
            cycle.status = "completed"
            cycle.completed_at = _utcnow()
    jar.current_cycle_id = None
    db.session.commit()
    return jsonify(jar.to_dict()), 200


# ═══════════════════════════════════════════════════════════════════════════
# BATCHES
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/batches", methods=["POST"])
@login_required
def create_batch():
    data = request.get_json(silent=True) or {}
    if not data.get("recipe_id") or not data.get("strain_id"):
        return jsonify({"error": "recipe_id and strain_id required"}), 400
    today = date.today().strftime("%Y%m%d")
    count = Batch.query.filter(Batch.batch_code.like(f"{today}-%")).count()
    batch_code = f"{today}-{count + 1:03d}"
    batch = Batch(
        batch_code=batch_code,
        recipe_id=data["recipe_id"],
        strain_id=data["strain_id"],
        planned_jar_count=data.get("planned_jar_count", 0),
        total_substrate_dry_g=data.get("total_substrate_dry_g"),
        notes=data.get("notes"),
    )
    db.session.add(batch)
    db.session.commit()
    return jsonify(batch.to_dict()), 201


@inventory_bp.route("/api/inventory/batches", methods=["GET"])
@login_required
def list_batches():
    query = Batch.query
    status = request.args.get("status")
    if status:
        query = query.filter(Batch.status == status)
    try:
        limit = min(int(request.args.get("limit", 50)), 500)
    except ValueError:
        limit = 50
    batches = query.order_by(Batch.created_at.desc()).limit(limit).all()
    result = []
    for b in batches:
        d = b.to_dict()
        d["jar_count"] = BatchJar.query.filter_by(batch_id=b.id).count()
        result.append(d)
    return jsonify(result), 200


@inventory_bp.route("/api/inventory/batches/<batch_id>", methods=["GET"])
@login_required
def get_batch(batch_id):
    batch = Batch.query.get(batch_id)
    if not batch:
        return jsonify({"error": "Batch not found"}), 404
    result = batch.to_dict()
    batch_jars = BatchJar.query.filter_by(batch_id=batch.id).all()
    jar_ids = [bj.jar_id for bj in batch_jars]
    jars = Jar.query.filter(Jar.id.in_(jar_ids)).all() if jar_ids else []
    result["jars"] = [j.to_dict() for j in jars]
    result["jar_count"] = len(jars)
    return jsonify(result), 200


@inventory_bp.route("/api/inventory/batches/<batch_id>/jars", methods=["POST"])
@login_required
def add_jars_to_batch(batch_id):
    batch = Batch.query.get(batch_id)
    if not batch:
        return jsonify({"error": "Batch not found"}), 404
    data = request.get_json(silent=True) or {}
    jar_ids = data.get("jar_ids", [])
    tag_ids = data.get("tag_ids", [])
    added = 0
    for tag_id in tag_ids:
        jar = Jar.query.filter_by(tag_id=tag_id).first()
        if jar and jar.id not in jar_ids:
            jar_ids.append(str(jar.id))
    for jid in jar_ids:
        jar = Jar.query.get(jid)
        if not jar:
            continue
        existing = BatchJar.query.filter_by(batch_id=batch.id, jar_id=jar.id).first()
        if existing:
            continue
        db.session.add(BatchJar(batch_id=batch.id, jar_id=jar.id))
        jar.status = "in_batch"
        added += 1
    batch.actual_jar_count = BatchJar.query.filter_by(batch_id=batch.id).count()
    db.session.commit()
    return jsonify({"added": added, "total": batch.actual_jar_count}), 200


@inventory_bp.route("/api/inventory/batches/<batch_id>/jars/<jar_id>", methods=["DELETE"])
@login_required
def remove_jar_from_batch(batch_id, jar_id):
    bj = BatchJar.query.filter_by(batch_id=batch_id, jar_id=jar_id).first()
    if not bj:
        return jsonify({"error": "Jar not in batch"}), 404
    jar = Jar.query.get(jar_id)
    if jar:
        jar.status = "available"
    db.session.delete(bj)
    db.session.commit()
    return jsonify({"message": "Jar removed from batch"}), 200


# ═══════════════════════════════════════════════════════════════════════════
# STERILIZATION
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/batches/<batch_id>/sterilization", methods=["POST"])
@login_required
def start_sterilization(batch_id):
    batch = Batch.query.get(batch_id)
    if not batch:
        return jsonify({"error": "Batch not found"}), 404
    data = request.get_json(silent=True) or {}
    run = SterilizationRun(
        batch_id=batch.id,
        autoclave_id=data.get("autoclave_id"),
        started_at=_utcnow(),
        temperature_c=data.get("temperature_c", 121.0),
        pressure_psi=data.get("pressure_psi", 15.0),
        notes=data.get("notes"),
    )
    db.session.add(run)
    db.session.flush()
    for jid in data.get("jar_ids", []):
        db.session.add(SterilizationJarAssignment(
            sterilization_run_id=run.id, jar_id=jid))
        jar = Jar.query.get(jid)
        if jar:
            jar.status = "sterilizing"
    batch.status = "sterilizing"
    db.session.commit()
    return jsonify(run.to_dict()), 201


@inventory_bp.route("/api/inventory/sterilization/<run_id>/complete", methods=["PUT"])
@login_required
def complete_sterilization(run_id):
    run = SterilizationRun.query.get(run_id)
    if not run:
        return jsonify({"error": "Sterilization run not found"}), 404
    data = request.get_json(silent=True) or {}
    run.outcome = data.get("outcome", "success")
    run.completed_at = _utcnow()
    run.duration_minutes = data.get("duration_minutes")
    run.notes = data.get("notes", run.notes)
    assignments = SterilizationJarAssignment.query.filter_by(
        sterilization_run_id=run.id).all()
    new_status = "inoculating" if run.outcome == "success" else "available"
    for a in assignments:
        jar = Jar.query.get(a.jar_id)
        if jar:
            jar.status = new_status
    db.session.commit()
    return jsonify(run.to_dict()), 200


# ═══════════════════════════════════════════════════════════════════════════
# INOCULATION
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/batches/<batch_id>/inoculation", methods=["POST"])
@login_required
def start_inoculation(batch_id):
    batch = Batch.query.get(batch_id)
    if not batch:
        return jsonify({"error": "Batch not found"}), 404
    data = request.get_json(silent=True) or {}
    session = InoculationSession(
        batch_id=batch.id,
        method=data.get("method", "liquid_culture"),
        culture_source=data.get("culture_source"),
        syringe_lot=data.get("syringe_lot"),
        syringe_vendor=data.get("syringe_vendor"),
        cc_per_jar=data.get("cc_per_jar"),
        flow_hood_used=data.get("flow_hood_used", False),
        room_temp_c=data.get("room_temp_c"),
        notes=data.get("notes"),
    )
    db.session.add(session)
    db.session.commit()
    return jsonify(session.to_dict()), 201


@inventory_bp.route("/api/inventory/inoculation/<session_id>/jar", methods=["POST"])
@login_required
def inoculate_jar(session_id):
    session = InoculationSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Inoculation session not found"}), 404
    data = request.get_json(silent=True) or {}
    jar_id = data.get("jar_id")
    if not jar_id and data.get("tag_id"):
        jar = Jar.query.filter_by(tag_id=data["tag_id"]).first()
        jar_id = str(jar.id) if jar else None
    if not jar_id:
        return jsonify({"error": "jar_id or tag_id required"}), 400
    jar = Jar.query.get(jar_id)
    if not jar:
        return jsonify({"error": "Jar not found"}), 404
    # Log inoculation
    log = InoculationJarLog(
        session_id=session.id, jar_id=jar.id,
        cc_used=data.get("cc_used"), notes=data.get("notes"),
    )
    db.session.add(log)
    # Create grow cycle
    cycle_num = GrowCycle.query.filter_by(jar_id=jar.id).count() + 1
    batch = Batch.query.get(session.batch_id)
    cycle = GrowCycle(
        jar_id=jar.id, batch_id=session.batch_id,
        cycle_number=cycle_num, strain_id=batch.strain_id,
        recipe_id=batch.recipe_id, status="colonizing",
    )
    db.session.add(cycle)
    db.session.flush()
    jar.status = "colonizing"
    jar.current_cycle_id = cycle.id
    jar.total_cycles = cycle_num
    db.session.commit()
    return jsonify({"jar": jar.to_dict(), "cycle": cycle.to_dict()}), 201


# ═══════════════════════════════════════════════════════════════════════════
# COLONIZATION CHECKS
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/jars/<jar_id>/colonization-check", methods=["POST"])
@login_required
def log_colonization_check(jar_id):
    jar = Jar.query.get(jar_id)
    if not jar:
        return jsonify({"error": "Jar not found"}), 404
    data = request.get_json(silent=True) or {}
    check = ColonizationCheck(
        cycle_id=jar.current_cycle_id,
        jar_id=jar.id,
        colonization_pct=data.get("colonization_pct", 0),
        visual_notes=data.get("visual_notes"),
        photo_url=data.get("photo_url"),
        flagged=data.get("flagged", False),
        flag_reason=data.get("flag_reason"),
    )
    db.session.add(check)
    # If 100% colonized, move to fruiting
    if data.get("colonization_pct", 0) >= 100:
        jar.status = "fruiting"
    db.session.commit()
    return jsonify(check.to_dict()), 201


@inventory_bp.route("/api/inventory/jars/<jar_id>/colonization-history", methods=["GET"])
@login_required
def get_colonization_history(jar_id):
    checks = ColonizationCheck.query.filter_by(jar_id=jar_id).order_by(
        ColonizationCheck.checked_at.desc()).all()
    return jsonify([c.to_dict() for c in checks]), 200


# ═══════════════════════════════════════════════════════════════════════════
# CONTAMINATION
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/jars/<jar_id>/contamination", methods=["POST"])
@login_required
def report_contamination(jar_id):
    jar = Jar.query.get(jar_id)
    if not jar:
        return jsonify({"error": "Jar not found"}), 404
    data = request.get_json(silent=True) or {}
    cycle = GrowCycle.query.get(jar.current_cycle_id) if jar.current_cycle_id else None
    batch_id = cycle.batch_id if cycle else None
    record = ContaminationRecord(
        cycle_id=jar.current_cycle_id,
        jar_id=jar.id,
        batch_id=batch_id,
        contamination_type=data.get("contamination_type", "unknown"),
        description=data.get("description"),
        photo_url=data.get("photo_url"),
        disposal_method=data.get("disposal_method", "pending"),
        notes=data.get("notes"),
    )
    db.session.add(record)
    jar.status = "contaminated"
    if cycle:
        cycle.contaminated = True
        cycle.status = "completed"
        cycle.completed_at = _utcnow()
    db.session.commit()
    return jsonify(record.to_dict()), 201


@inventory_bp.route("/api/inventory/contamination/<record_id>/dispose", methods=["PUT"])
@login_required
def dispose_contamination(record_id):
    record = ContaminationRecord.query.get(record_id)
    if not record:
        return jsonify({"error": "Record not found"}), 404
    data = request.get_json(silent=True) or {}
    record.disposal_method = data.get("disposal_method", "composted")
    record.disposal_location = data.get("disposal_location")
    record.disposed_at = _utcnow()
    record.notes = data.get("notes", record.notes)
    jar = Jar.query.get(record.jar_id)
    if jar:
        jar.status = "available"
        jar.current_cycle_id = None
    db.session.commit()
    return jsonify(record.to_dict()), 200


# ═══════════════════════════════════════════════════════════════════════════
# MOVEMENTS
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/jars/<jar_id>/move", methods=["POST"])
@login_required
def move_jar(jar_id):
    jar = Jar.query.get(jar_id)
    if not jar:
        return jsonify({"error": "Jar not found"}), 404
    data = request.get_json(silent=True) or {}
    to_loc = data.get("to_location_id")
    if not to_loc:
        return jsonify({"error": "to_location_id required"}), 400
    # Clear old position
    if jar.current_position_id:
        old_pos = ShelfPosition.query.get(jar.current_position_id)
        if old_pos:
            old_pos.is_occupied = False
            old_pos.current_jar_id = None
    move = JarMovement(
        jar_id=jar.id,
        cycle_id=jar.current_cycle_id,
        from_location_id=jar.current_location_id,
        from_position_id=jar.current_position_id,
        to_location_id=to_loc,
        to_position_id=data.get("to_position_id"),
        reason=data.get("reason", "manual_reorg"),
    )
    db.session.add(move)
    jar.current_location_id = to_loc
    jar.current_position_id = data.get("to_position_id")
    # Set new position
    if jar.current_position_id:
        new_pos = ShelfPosition.query.get(jar.current_position_id)
        if new_pos:
            new_pos.is_occupied = True
            new_pos.current_jar_id = jar.id
    db.session.commit()
    return jsonify(move.to_dict()), 201


# ═══════════════════════════════════════════════════════════════════════════
# FLUSHES AND HARVESTS
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/jars/<jar_id>/flushes", methods=["POST"])
@login_required
def start_flush(jar_id):
    jar = Jar.query.get(jar_id)
    if not jar:
        return jsonify({"error": "Jar not found"}), 404
    data = request.get_json(silent=True) or {}
    cycle = GrowCycle.query.get(jar.current_cycle_id) if jar.current_cycle_id else None
    flush_num = (Flush.query.filter_by(cycle_id=jar.current_cycle_id).count() + 1
                 if jar.current_cycle_id else 1)
    flush = Flush(
        cycle_id=jar.current_cycle_id,
        jar_id=jar.id,
        flush_number=flush_num,
        pins_observed_at=data.get("pins_observed_at"),
        pins_photo_url=data.get("pins_photo_url"),
    )
    db.session.add(flush)
    jar.status = "fruiting"
    if cycle:
        cycle.flush_count = flush_num
    db.session.commit()
    return jsonify(flush.to_dict()), 201


@inventory_bp.route("/api/inventory/flushes/<flush_id>/harvest", methods=["POST"])
@login_required
def record_harvest(flush_id):
    flush = Flush.query.get(flush_id)
    if not flush:
        return jsonify({"error": "Flush not found"}), 404
    data = request.get_json(silent=True) or {}
    flush.jar_weight_pre_g = data.get("jar_weight_pre_g")
    flush.jar_weight_post_g = data.get("jar_weight_post_g")
    flush.mushroom_yield_g = data.get("mushroom_yield_g")
    flush.quality_grade = data.get("quality_grade")
    flush.harvest_completed_at = _utcnow()
    flush.notes = data.get("notes")
    # Update cycle totals
    cycle = GrowCycle.query.get(flush.cycle_id) if flush.cycle_id else None
    jar = Jar.query.get(flush.jar_id)
    yield_g = flush.mushroom_yield_g or 0
    if cycle:
        cycle.total_yield_g = (cycle.total_yield_g or 0) + yield_g
        cycle.status = "resting"
        if cycle.substrate_dry_weight_g and cycle.substrate_dry_weight_g > 0:
            cycle.biological_efficiency_pct = (
                cycle.total_yield_g / cycle.substrate_dry_weight_g) * 100
    if jar:
        jar.total_yield_g = (jar.total_yield_g or 0) + yield_g
        jar.status = "resting"
    # Check weight discrepancy
    discrepancy = False
    if flush.jar_weight_pre_g and flush.jar_weight_post_g and flush.mushroom_yield_g:
        calc = flush.jar_weight_pre_g - flush.jar_weight_post_g
        if abs(flush.mushroom_yield_g - calc) > 5:
            discrepancy = True
    db.session.commit()
    result = flush.to_dict()
    result["weight_discrepancy"] = discrepancy
    return jsonify(result), 200


# ═══════════════════════════════════════════════════════════════════════════
# SCAN
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/scan", methods=["POST"])
@login_required
def scan_tag():
    data = request.get_json(silent=True) or {}
    tag_id = (data.get("tag_id") or "").strip()
    if not tag_id:
        return jsonify({"error": "tag_id required"}), 400
    jar = Jar.query.filter_by(tag_id=tag_id).first()
    scan = ScanEvent(
        tag_id=tag_id,
        jar_id=jar.id if jar else None,
        scanner_type=data.get("scanner_type", "nfc_phone"),
        scanner_id=data.get("scanner_id"),
        location_id=data.get("location_id"),
        action_triggered=data.get("action_hint", "lookup"),
        ip_address=request.remote_addr,
    )
    db.session.add(scan)
    db.session.commit()
    if not jar:
        return jsonify({"status": "unknown_tag", "tag_id": tag_id}), 200
    return jsonify({"status": "found", "jar": jar.to_dict()}), 200


# ═══════════════════════════════════════════════════════════════════════════
# LOCATIONS
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/locations", methods=["GET"])
@login_required
def list_locations():
    locations = Location.query.order_by(Location.sort_order).all()
    return jsonify([loc.to_dict() for loc in locations]), 200


@inventory_bp.route("/api/inventory/locations", methods=["POST"])
@login_required
def create_location():
    data = request.get_json(silent=True) or {}
    loc = Location(
        name=data.get("name", ""),
        location_type=data.get("location_type", "shelf"),
        parent_id=data.get("parent_id"),
        facility_id=data.get("facility_id"),
        notes=data.get("notes"),
    )
    db.session.add(loc)
    db.session.commit()
    return jsonify(loc.to_dict()), 201


@inventory_bp.route("/api/inventory/locations/<location_id>/jars", methods=["GET"])
@login_required
def get_location_jars(location_id):
    jars = Jar.query.filter_by(current_location_id=location_id).all()
    positions = ShelfPosition.query.filter_by(location_id=location_id).order_by(
        ShelfPosition.position_number).all()
    return jsonify({
        "jars": [j.to_dict() for j in jars],
        "positions": [{"id": str(p.id), "position_number": p.position_number,
                       "is_occupied": p.is_occupied,
                       "current_jar_id": str(p.current_jar_id) if p.current_jar_id else None}
                      for p in positions],
    }), 200


@inventory_bp.route("/api/inventory/locations/<location_id>/positions", methods=["POST"])
@login_required
def create_positions(location_id):
    data = request.get_json(silent=True) or {}
    count = data.get("count", 8)
    for i in range(1, count + 1):
        existing = ShelfPosition.query.filter_by(
            location_id=location_id, position_number=i).first()
        if not existing:
            db.session.add(ShelfPosition(
                location_id=location_id, position_number=i))
    db.session.commit()
    return jsonify({"created": count}), 201


# ═══════════════════════════════════════════════════════════════════════════
# REFERENCE DATA
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/strains", methods=["GET"])
@login_required
def list_strains():
    strains = MushroomStrain.query.filter_by(is_active=True).all()
    return jsonify([s.to_dict() for s in strains]), 200


@inventory_bp.route("/api/inventory/strains", methods=["POST"])
@login_required
def create_strain():
    data = request.get_json(silent=True) or {}
    strain = MushroomStrain(
        name=data.get("name", ""),
        species=data.get("species", "Lentinula edodes"),
        vendor=data.get("vendor"),
        vendor_lot=data.get("vendor_lot"),
        notes=data.get("notes"),
    )
    db.session.add(strain)
    db.session.commit()
    return jsonify(strain.to_dict()), 201


@inventory_bp.route("/api/inventory/recipes", methods=["GET"])
@login_required
def list_recipes():
    recipes = SubstrateRecipe.query.filter_by(is_active=True).all()
    result = []
    for r in recipes:
        d = r.to_dict()
        components = SubstrateRecipeComponent.query.filter_by(
            recipe_id=r.id).order_by(SubstrateRecipeComponent.sort_order).all()
        d["components"] = [c.to_dict() for c in components]
        result.append(d)
    return jsonify(result), 200


@inventory_bp.route("/api/inventory/recipes", methods=["POST"])
@login_required
def create_recipe():
    data = request.get_json(silent=True) or {}
    recipe = SubstrateRecipe(
        name=data.get("name", ""),
        version=data.get("version", 1),
        notes=data.get("notes"),
    )
    db.session.add(recipe)
    db.session.flush()
    for comp in data.get("components", []):
        db.session.add(SubstrateRecipeComponent(
            recipe_id=recipe.id,
            component_type=comp.get("component_type", "grain"),
            component_name=comp.get("component_name", ""),
            amount_grams=comp.get("amount_grams", 0),
            hydration_pct=comp.get("hydration_pct"),
            prep_notes=comp.get("prep_notes"),
        ))
    db.session.commit()
    return jsonify(recipe.to_dict()), 201


@inventory_bp.route("/api/inventory/autoclaves", methods=["GET"])
@login_required
def list_autoclaves():
    units = AutoclaveUnit.query.filter_by(is_active=True).all()
    return jsonify([u.to_dict() for u in units]), 200


@inventory_bp.route("/api/inventory/autoclaves", methods=["POST"])
@login_required
def create_autoclave():
    data = request.get_json(silent=True) or {}
    unit = AutoclaveUnit(
        name=data.get("name", ""),
        model=data.get("model"),
        serial_number=data.get("serial_number"),
        max_temp_c=data.get("max_temp_c", 134.0),
        max_pressure_psi=data.get("max_pressure_psi", 15.0),
        capacity_liters=data.get("capacity_liters"),
        notes=data.get("notes"),
    )
    db.session.add(unit)
    db.session.commit()
    return jsonify(unit.to_dict()), 201


# ═══════════════════════════════════════════════════════════════════════════
# ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/analytics/dashboard-summary", methods=["GET"])
@login_required
def analytics_dashboard():
    total = Jar.query.filter(Jar.status != "retired").count()
    colonizing = Jar.query.filter_by(status="colonizing").count()
    fruiting = Jar.query.filter_by(status="fruiting").count()
    harvesting = Jar.query.filter_by(status="harvesting").count()
    resting = Jar.query.filter_by(status="resting").count()
    contaminated = Jar.query.filter_by(status="contaminated").count()
    available = Jar.query.filter_by(status="available").count()

    thirty_days_ago = _utcnow() - timedelta(days=30)
    yield_30d = db.session.query(func.coalesce(func.sum(Flush.mushroom_yield_g), 0)).filter(
        Flush.harvest_completed_at >= thirty_days_ago).scalar()

    contam_30d = ContaminationRecord.query.filter(
        ContaminationRecord.detected_at >= thirty_days_ago).count()
    total_cycles_30d = GrowCycle.query.filter(
        GrowCycle.started_at >= thirty_days_ago).count()
    contam_rate = (contam_30d / total_cycles_30d * 100) if total_cycles_30d > 0 else 0

    avg_be = db.session.query(func.avg(GrowCycle.biological_efficiency_pct)).filter(
        GrowCycle.biological_efficiency_pct.isnot(None)).scalar()

    return jsonify({
        "total_active_jars": total,
        "jars_colonizing": colonizing,
        "jars_fruiting": fruiting,
        "jars_harvesting": harvesting,
        "jars_resting": resting,
        "jars_contaminated": contaminated,
        "jars_available": available,
        "total_yield_30d_g": round(float(yield_30d), 1),
        "contamination_rate_30d": round(contam_rate, 1),
        "avg_biological_efficiency": round(float(avg_be), 1) if avg_be else None,
    }), 200


@inventory_bp.route("/api/inventory/analytics/yield-by-flush", methods=["GET"])
@login_required
def analytics_yield_by_flush():
    results = db.session.query(
        Flush.flush_number,
        func.avg(Flush.mushroom_yield_g).label("avg_yield"),
        func.count(Flush.id).label("sample_size"),
    ).filter(
        Flush.mushroom_yield_g.isnot(None)
    ).group_by(Flush.flush_number).order_by(Flush.flush_number).all()

    return jsonify([{
        "flush_number": r.flush_number,
        "avg_yield_g": round(float(r.avg_yield), 1) if r.avg_yield else 0,
        "sample_size": r.sample_size,
    } for r in results]), 200


@inventory_bp.route("/api/inventory/analytics/contamination-rate", methods=["GET"])
@login_required
def analytics_contamination():
    by_type = db.session.query(
        ContaminationRecord.contamination_type,
        func.count(ContaminationRecord.id).label("count"),
    ).group_by(ContaminationRecord.contamination_type).all()

    total = sum(r.count for r in by_type)
    return jsonify({
        "total": total,
        "by_type": [{
            "type": r.contamination_type or "unknown",
            "count": r.count,
            "rate_pct": round(r.count / total * 100, 1) if total > 0 else 0,
        } for r in by_type],
    }), 200


# ═══════════════════════════════════════════════════════════════════════════
# PHOTO UPLOAD
# ═══════════════════════════════════════════════════════════════════════════

@inventory_bp.route("/api/inventory/photos/upload", methods=["POST"])
@login_required
def upload_photo():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No filename"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("jpg", "jpeg", "png", "webp"):
        return jsonify({"error": "Invalid file type. Use jpg, png, or webp"}), 400

    jar_id = request.form.get("jar_id")
    photo_type = request.form.get("photo_type", "general")

    now = _utcnow()
    upload_dir = os.path.join(
        "/home/kurtis/colony-main/uploads/jar-photos",
        now.strftime("%Y"), now.strftime("%m"),
        jar_id or "unknown"
    )
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"{uuid.uuid4().hex[:12]}.{ext}"
    filepath = os.path.join(upload_dir, filename)
    file.save(filepath)
    file_size = os.path.getsize(filepath)

    rel_path = filepath.replace("/home/kurtis/colony-main/", "/")
    photo = JarPhoto(
        jar_id=jar_id,
        cycle_id=request.form.get("cycle_id"),
        flush_id=request.form.get("flush_id"),
        check_id=request.form.get("check_id"),
        photo_type=photo_type,
        file_path=rel_path,
        file_size_bytes=file_size,
        source=request.form.get("source", "phone"),
        notes=request.form.get("notes"),
    )
    db.session.add(photo)
    db.session.commit()
    return jsonify({"photo_url": rel_path, "photo": photo.to_dict()}), 201
