"""Build Nailong's first continuous-surface Blender blockout and review renders."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BLEND_DIR = PROJECT_ROOT / "assets-source" / "blender" / "characters" / "nailong"
REVIEW_DIR = PROJECT_ROOT / "docs" / "characters" / "nailong-blockout-v001"
BLEND_PATH = BLEND_DIR / "nailong-blockout-v001.blend"


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(name: str, color: tuple[float, float, float, float], roughness: float = 0.7, metallic: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Roughness"].default_value = roughness
        principled.inputs["Metallic"].default_value = metallic
    return mat


def add_uv_sphere(name: str, location: tuple[float, float, float], scale: tuple[float, float, float], mat: bpy.types.Material | None = None, segments: int = 48, rings: int = 32) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        obj.data.materials.append(mat)
    return obj


def add_capsule(name: str, location: tuple[float, float, float], scale: tuple[float, float, float], rotation: tuple[float, float, float], mat: bpy.types.Material | None = None) -> bpy.types.Object:
    obj = add_uv_sphere(name, location, scale, mat, segments=48, rings=32)
    obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return obj


def join_and_voxel_remesh(parts: list[bpy.types.Object], name: str, voxel_size: float) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = name
    body.data.remesh_voxel_size = voxel_size
    bpy.ops.object.voxel_remesh()

    smooth = body.modifiers.new("Sculpt_Soften", "SMOOTH")
    smooth.factor = 0.72
    smooth.iterations = 5
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=smooth.name)

    subdivision = body.modifiers.new("Sculpt_Subdivision", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 1
    subdivision.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    return body


def add_smile(mat: bpy.types.Material) -> bpy.types.Object:
    curve_data = bpy.data.curves.new("Mouth_Smile_Curve", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = 0.035
    curve_data.bevel_resolution = 5
    spline = curve_data.splines.new("POLY")
    points = []
    for index in range(13):
        x = -0.24 + index * 0.04
        z = 4.20 - 0.11 * math.cos((x / 0.24) * math.pi / 2)
        points.append((x, -1.538, z, 1.0))
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = coordinate
    mouth = bpy.data.objects.new("Mouth_Smile", curve_data)
    curve_data.materials.append(mat)
    bpy.context.collection.objects.link(mouth)
    return mouth


def look_at(camera: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def create_camera() -> bpy.types.Object:
    camera_data = bpy.data.cameras.new("Review_Camera")
    camera_data.lens = 66
    camera_data.sensor_width = 36
    camera = bpy.data.objects.new("Review_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    return camera


def configure_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (0.055, 0.072, 0.09)


def add_lighting() -> None:
    lights = [
        ("Key", "AREA", (-5.2, -6.8, 9.5), (1.0, 0.78, 0.52), 1350.0, 5.0),
        ("Fill", "AREA", (5.5, -2.5, 6.0), (0.52, 0.72, 1.0), 900.0, 4.5),
        ("Rim", "AREA", (0.0, 5.5, 8.5), (1.0, 0.55, 0.24), 1100.0, 3.5),
    ]
    for name, light_type, location, color, energy, size in lights:
        data = bpy.data.lights.new(name, light_type)
        data.color = color
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        obj.location = location
        bpy.context.collection.objects.link(obj)
        obj.rotation_euler = (0.0, 0.0, 0.0)
        direction = Vector((0.0, 0.0, 3.2)) - obj.location
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_character() -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    body_mat = material("MAT_Nailong_Blockout", (0.95, 0.57, 0.08, 1.0), 0.58)
    belly_mat = material("MAT_Belly_Blockout", (1.0, 0.78, 0.39, 1.0), 0.68)
    brown_mat = material("MAT_Paw_Blockout", (0.29, 0.13, 0.055, 1.0), 0.74)
    white_mat = material("MAT_Eye_White", (0.96, 0.97, 0.94, 1.0), 0.24)
    green_mat = material("MAT_Iris_Green", (0.16, 0.52, 0.08, 1.0), 0.2)
    black_mat = material("MAT_Pupil", (0.006, 0.009, 0.006, 1.0), 0.16)
    mouth_mat = material("MAT_Mouth", (0.16, 0.045, 0.025, 1.0), 0.78)

    fused_parts = [
        add_uv_sphere("Sculpt_Torso", (0.0, 0.02, 2.66), (1.56, 1.36, 1.92), body_mat),
        add_uv_sphere("Sculpt_Head", (0.0, -0.05, 4.62), (1.76, 1.53, 1.55), body_mat),
        add_uv_sphere("Sculpt_NeckBridge", (0.0, -0.02, 3.78), (1.50, 1.35, 1.15), body_mat),
        add_capsule("Sculpt_Arm_L", (-1.50, -0.04, 3.13), (0.50, 0.54, 1.00), (0.0, -0.28, -0.27), body_mat),
        add_capsule("Sculpt_Arm_R", (1.50, -0.04, 3.13), (0.50, 0.54, 1.00), (0.0, 0.28, 0.27), body_mat),
        add_capsule("Sculpt_Leg_L", (-0.78, 0.02, 1.16), (0.73, 0.78, 1.05), (0.0, -0.08, -0.04), body_mat),
        add_capsule("Sculpt_Leg_R", (0.78, 0.02, 1.16), (0.73, 0.78, 1.05), (0.0, 0.08, 0.04), body_mat),
        add_uv_sphere("Sculpt_Foot_L", (-0.82, -0.42, 0.53), (0.81, 1.02, 0.56), body_mat),
        add_uv_sphere("Sculpt_Foot_R", (0.82, -0.42, 0.53), (0.81, 1.02, 0.56), body_mat),
        add_uv_sphere("Sculpt_Tail", (0.0, 1.28, 2.35), (0.46, 0.50, 0.48), body_mat),
    ]
    body = join_and_voxel_remesh(fused_parts, "Nailong_Body_Sculpt_v001", 0.055)
    body.data.materials.clear()
    body.data.materials.append(body_mat)

    detail_objects: list[bpy.types.Object] = []
    belly = add_uv_sphere("Nailong_Belly_Patch", (0.0, -1.255, 2.73), (1.04, 0.16, 1.28), belly_mat, 64, 40)
    detail_objects.append(belly)

    for side in (-1, 1):
        x = side * 0.59
        eye = add_uv_sphere(f"Eye_{'L' if side < 0 else 'R'}", (x, -1.365, 4.87), (0.56, 0.27, 0.70), white_mat, 64, 40)
        iris = add_uv_sphere(f"Iris_{'L' if side < 0 else 'R'}", (x, -1.602, 4.87), (0.32, 0.10, 0.40), green_mat, 48, 32)
        pupil = add_uv_sphere(f"Pupil_{'L' if side < 0 else 'R'}", (x, -1.681, 4.87), (0.16, 0.06, 0.24), black_mat, 40, 28)
        sparkle = add_uv_sphere(f"Eye_Highlight_{'L' if side < 0 else 'R'}", (x - 0.07, -1.728, 5.02), (0.052, 0.025, 0.074), white_mat, 24, 16)
        detail_objects.extend([eye, iris, pupil, sparkle])

    mouth = add_smile(mouth_mat)
    detail_objects.append(mouth)

    toe_offsets = (-0.28, 0.0, 0.28)
    for side in (-1, 1):
        for index, offset in enumerate(toe_offsets):
            toe = add_uv_sphere(
                f"Toe_{'L' if side < 0 else 'R'}_{index + 1}",
                (side * 0.82 + offset * 0.7, -1.22, 0.38),
                (0.16, 0.10, 0.13),
                brown_mat,
                28,
                18,
            )
            detail_objects.append(toe)

    for side in (-1, 1):
        for index, z_offset in enumerate((-0.14, 0.10)):
            pad = add_uv_sphere(
                f"Hand_Pad_{'L' if side < 0 else 'R'}_{index + 1}",
                (side * 1.73, -0.50, 2.56 + z_offset),
                (0.12, 0.08, 0.13),
                brown_mat,
                28,
                18,
            )
            detail_objects.append(pad)

    return body, detail_objects


def add_stage() -> None:
    floor_mat = material("MAT_Review_Floor", (0.10, 0.12, 0.14, 1.0), 0.9)
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0.0, 0.0, 0.0))
    floor = bpy.context.object
    floor.name = "Review_Floor"
    floor.data.materials.append(floor_mat)

    backdrop_mat = material("MAT_Review_Backdrop", (0.055, 0.075, 0.09, 1.0), 0.86)
    bpy.ops.mesh.primitive_plane_add(size=34, location=(0.0, 4.5, 8.0), rotation=(math.pi / 2, 0.0, 0.0))
    backdrop = bpy.context.object
    backdrop.name = "Review_Backdrop"
    backdrop.data.materials.append(backdrop_mat)


def render_views(camera: bpy.types.Object, body: bpy.types.Object) -> None:
    views = {
        "front": ((0.0, -12.8, 3.25), (0.0, 0.0, 3.15)),
        "side": ((12.8, 0.0, 3.25), (0.0, 0.0, 3.15)),
        "back": ((0.0, 12.8, 3.25), (0.0, 0.0, 3.15)),
        "three-quarter": ((9.2, -10.2, 5.2), (0.0, 0.0, 3.15)),
    }
    scene = bpy.context.scene
    for name, (location, target) in views.items():
        camera.location = location
        look_at(camera, target)
        scene.render.filepath = str(REVIEW_DIR / f"nailong-blockout-v001-{name}.png")
        bpy.ops.render.render(write_still=True)

    wire_mat = material("MAT_Wire", (0.012, 0.018, 0.024, 1.0), 0.5)
    wire = body.copy()
    wire.data = body.data.copy()
    wire.name = "Nailong_Body_Wire_Overlay"
    bpy.context.collection.objects.link(wire)
    wire.data.materials.clear()
    wire.data.materials.append(wire_mat)
    modifier = wire.modifiers.new("Topology_Wire", "WIREFRAME")
    modifier.thickness = 0.008
    modifier.use_replace = True
    modifier.use_even_offset = True
    camera.location = (9.2, -10.2, 5.2)
    look_at(camera, (0.0, 0.0, 3.15))
    scene.render.filepath = str(REVIEW_DIR / "nailong-blockout-v001-wireframe.png")
    bpy.ops.render.render(write_still=True)
    wire.hide_render = True


def write_report(body: bpy.types.Object) -> None:
    triangles = sum(len(poly.vertices) - 2 for poly in body.data.polygons)
    report = {
        "asset": "nailong-blockout-v001",
        "stage": "continuous-surface sculpt blockout",
        "source_reference": "docs/characters/nailong-turnaround-v1-approved.png",
        "body_vertices": len(body.data.vertices),
        "body_polygons": len(body.data.polygons),
        "body_triangles_estimate": triangles,
        "dimensions_m": [round(value, 3) for value in body.dimensions],
        "checks": {
            "single_continuous_body_surface": True,
            "no_ears_or_horns": True,
            "separate_eye_components": True,
            "topology_final": False,
            "uv_complete": False,
            "rigged": False,
            "animation_complete": False,
        },
    }
    (REVIEW_DIR / "nailong-blockout-v001-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> None:
    BLEND_DIR.mkdir(parents=True, exist_ok=True)
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    clear_scene()
    configure_render()
    body, _details = build_character()
    add_stage()
    add_lighting()
    camera = create_camera()
    render_views(camera, body)
    write_report(body)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"Saved {BLEND_PATH}")
    print(f"Rendered review images to {REVIEW_DIR}")


if __name__ == "__main__":
    main()
