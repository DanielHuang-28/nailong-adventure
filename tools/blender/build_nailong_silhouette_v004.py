"""Build a smooth, reference-profile Nailong sculpt base from the approved turnaround."""

from __future__ import annotations

import json
import importlib.util
import math
from pathlib import Path
import sys

import bpy

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BASE_SCRIPT = Path(__file__).with_name("build_nailong_silhouette_v003.py")
SPEC = importlib.util.spec_from_file_location("nailong_v003_helpers", BASE_SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load helper script: {BASE_SCRIPT}")
ref = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ref
SPEC.loader.exec_module(ref)


OUTPUT_DIR = PROJECT_ROOT / "docs" / "characters" / "nailong-silhouette-v004"
BLEND_PATH = PROJECT_ROOT / "assets-source" / "blender" / "characters" / "nailong" / "nailong-silhouette-v004.blend"
RING_SEGMENTS = 48


def intervals(row: list[bool]) -> list[tuple[int, int]]:
    result: list[tuple[int, int]] = []
    start: int | None = None
    for index, value in enumerate(row + [False]):
        if value and start is None:
            start = index
        elif not value and start is not None:
            result.append((start, index - 1))
            start = None
    return result


def central_interval(row: list[bool]) -> tuple[int, int] | None:
    center = ref.PANEL_SIZE // 2
    row_intervals = intervals(row)
    for left, right in row_intervals:
        if left <= center <= right:
            return left, right
    return None


def full_interval(row: list[bool]) -> tuple[int, int] | None:
    active = [index for index, value in enumerate(row) if value]
    return (min(active), max(active)) if active else None


def pixel_x_to_world(pixel: float) -> float:
    return -ref.WORLD_WIDTH / 2 + pixel / (ref.PANEL_SIZE - 1) * ref.WORLD_WIDTH


def pixel_y_to_world(pixel: float) -> float:
    return ref.WORLD_BOTTOM + pixel / (ref.PANEL_SIZE - 1) * (ref.WORLD_TOP - ref.WORLD_BOTTOM)


def loft_mesh(
    name: str,
    rings: list[tuple[float, float, float, float, float]],
) -> bpy.types.Object:
    """rings are (center_x, center_y, radius_x, radius_y, z)."""
    if rings[0][4] > rings[-1][4]:
        rings = list(reversed(rings))
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for center_x, center_y, radius_x, radius_y, z in rings:
        for segment in range(RING_SEGMENTS):
            angle = math.tau * segment / RING_SEGMENTS
            vertices.append(
                (
                    center_x + radius_x * math.cos(angle),
                    center_y + radius_y * math.sin(angle),
                    z,
                )
            )
    for ring_index in range(len(rings) - 1):
        start = ring_index * RING_SEGMENTS
        next_start = (ring_index + 1) * RING_SEGMENTS
        for segment in range(RING_SEGMENTS):
            next_segment = (segment + 1) % RING_SEGMENTS
            faces.append((start + segment, start + next_segment, next_start + next_segment, next_start + segment))
    bottom_center = len(vertices)
    vertices.append((rings[0][0], rings[0][1], rings[0][4]))
    top_center = len(vertices)
    vertices.append((rings[-1][0], rings[-1][1], rings[-1][4]))
    for segment in range(RING_SEGMENTS):
        next_segment = (segment + 1) % RING_SEGMENTS
        faces.append((bottom_center, next_segment, segment))
        top_start = (len(rings) - 1) * RING_SEGMENTS
        faces.append((top_center, top_start + segment, top_start + next_segment))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def build_reference_body(front: list[list[bool]], side: list[list[bool]]) -> bpy.types.Object:
    active_rows = [y for y, row in enumerate(front) if central_interval(row) is not None]
    bottom = min(active_rows)
    top = max(active_rows)
    rings: list[tuple[float, float, float, float, float]] = []
    samples = 104
    for sample in range(samples):
        source_y = round(bottom + (top - bottom) * sample / (samples - 1))
        front_span = central_interval(front[source_y])
        side_span = full_interval(side[source_y])
        if front_span is None or side_span is None:
            continue
        x_min = pixel_x_to_world(front_span[0])
        x_max = pixel_x_to_world(front_span[1])
        y_min = pixel_x_to_world(side_span[0])
        y_max = pixel_x_to_world(side_span[1])
        z = pixel_y_to_world(source_y)
        radius_x = max(0.06, (x_max - x_min) / 2)
        radius_y = max(0.06, (y_max - y_min) / 2)
        # The connected shoulder silhouette contains the arms. Keep only the torso/head mass here;
        # arms and legs are rebuilt as overlapping sculpt blocks before voxel fusion.
        if z < 2.0:
            radius_x = min(radius_x, 1.16)
            radius_y = min(radius_y, 1.18)
        elif z < 3.64:
            radius_x = min(radius_x, 1.28)
            radius_y = min(radius_y, 1.30)
        rings.append(
            (
                (x_min + x_max) / 2,
                (y_min + y_max) / 2,
                radius_x,
                radius_y,
                z,
            )
        )
    return loft_mesh("Nailong_Reference_Body_Loft", rings)


def limb_rings(
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius_start: tuple[float, float],
    radius_end: tuple[float, float],
    count: int = 18,
) -> list[tuple[float, float, float, float, float]]:
    rings: list[tuple[float, float, float, float, float]] = []
    for index in range(count):
        t = index / (count - 1)
        eased = t * t * (3.0 - 2.0 * t)
        center_x = start[0] + (end[0] - start[0]) * eased
        center_y = start[1] + (end[1] - start[1]) * eased
        z = start[2] + (end[2] - start[2]) * t
        radius_x = radius_start[0] + (radius_end[0] - radius_start[0]) * t
        radius_y = radius_start[1] + (radius_end[1] - radius_start[1]) * t
        rings.append((center_x, center_y, radius_x, radius_y, z))
    return rings


def build_limbs() -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []

    def ellipsoid(
        name: str,
        location: tuple[float, float, float],
        scale: tuple[float, float, float],
        rotation_y: float = 0.0,
    ) -> bpy.types.Object:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=56, ring_count=36, location=location)
        obj = bpy.context.object
        obj.name = name
        obj.scale = scale
        obj.rotation_euler.y = rotation_y
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        return obj

    for side in (-1.0, 1.0):
        objects.append(
            ellipsoid(
                f"Nailong_Arm_{'L' if side < 0 else 'R'}",
                (side * 1.45, -0.03, 2.82),
                (0.49, 0.54, 0.92),
                -side * 0.22,
            )
        )
        objects.append(
            ellipsoid(
                f"Nailong_Leg_{'L' if side < 0 else 'R'}",
                (side * 0.67, 0.02, 0.78),
                (0.64, 0.68, 0.76),
                -side * 0.04,
            )
        )
        objects.append(
            ellipsoid(
                f"Nailong_Foot_{'L' if side < 0 else 'R'}",
                (side * 0.67, -0.36, 0.34),
                (0.67, 0.84, 0.38),
            )
        )
    return objects


def add_tail() -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, location=(0.0, 1.50, 2.30))
    tail = bpy.context.object
    tail.name = "Nailong_Tail_Blockout"
    tail.scale = (0.31, 0.48, 0.33)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in tail.data.polygons:
        polygon.use_smooth = True
    return tail


def fuse_sculpt_parts(parts: list[bpy.types.Object]) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = "Nailong_Silhouette_Sculpt_v004"
    body.data.remesh_voxel_size = 0.045
    bpy.ops.object.voxel_remesh()
    smooth = body.modifiers.new("Sculpt_Soften", "SMOOTH")
    smooth.factor = 0.38
    smooth.iterations = 5
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    subdivision = body.modifiers.new("Sculpt_Subdivision", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 1
    subdivision.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    return body


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    ref.OUTPUT_DIR = OUTPUT_DIR
    ref.BLEND_PATH = BLEND_PATH
    ref.clear_scene()
    ref.configure_scene()

    image = bpy.data.images.load(str(ref.REFERENCE_PATH), check_existing=True)
    front = ref.fill_internal_holes(ref.largest_component(ref.raw_panel_mask(image, 0)))
    side = ref.remove_side_tail(ref.fill_internal_holes(ref.largest_component(ref.raw_panel_mask(image, 1))))

    body = build_reference_body(front, side)
    parts = [body, *build_limbs(), add_tail()]
    body = fuse_sculpt_parts(parts)
    body.data.materials.append(ref.clay_material("MAT_Nailong_Silhouette_Clay_v004", (0.96, 0.60, 0.10, 1.0)))
    ref.add_stage_and_lights()
    cameras = {
        "front": ref.create_camera("CAM_FRONT", (0.0, -12.0, 2.68)),
        "side": ref.create_camera("CAM_SIDE", (12.0, 0.0, 2.68)),
        "back": ref.create_camera("CAM_BACK", (0.0, 12.0, 2.68)),
        "three-quarter": ref.create_camera("CAM_THREE_QUARTER", (9.0, -10.0, 5.0)),
    }
    ref.render_views(cameras)
    report = {
        "asset": "nailong-silhouette-v004",
        "method": "approved-turnaround elliptic profile loft plus fused limb lofts",
        "body_vertices": len(body.data.vertices),
        "body_polygons": len(body.data.polygons),
        "status": {
            "reference_profile_base": True,
            "internal_visual_review": "pending",
            "manual_sculpt_cleanup": False,
            "facial_features": False,
            "retopology": False,
        },
    }
    (OUTPUT_DIR / "nailong-silhouette-v004-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    bpy.context.scene.camera = cameras["front"]
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"Saved smooth silhouette base: {BLEND_PATH}")


if __name__ == "__main__":
    main()
