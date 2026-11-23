"""Build a reference-derived Nailong visual hull for silhouette approval."""

from __future__ import annotations

from collections import deque
import json
import statistics
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_PATH = PROJECT_ROOT / "docs" / "characters" / "nailong-turnaround-v1-approved.png"
OUTPUT_DIR = PROJECT_ROOT / "docs" / "characters" / "nailong-silhouette-v003"
BLEND_PATH = PROJECT_ROOT / "assets-source" / "blender" / "characters" / "nailong" / "nailong-silhouette-v003.blend"

PANEL_SIZE = 724
SHEET_WIDTH = 2172
WORLD_WIDTH = 6.0
WORLD_DEPTH = 6.0
WORLD_BOTTOM = -0.32
WORLD_TOP = 5.68
NX = 64
NY = 64
NZ = 80


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)


def saturation(r: float, g: float, b: float) -> float:
    maximum = max(r, g, b)
    minimum = min(r, g, b)
    return 0.0 if maximum <= 1e-6 else (maximum - minimum) / maximum


def raw_panel_mask(image: bpy.types.Image, panel_index: int) -> list[list[bool]]:
    pixels = list(image.pixels)
    width = image.size[0]
    mask = [[False for _ in range(PANEL_SIZE)] for _ in range(PANEL_SIZE)]
    x_offset = panel_index * PANEL_SIZE
    for y in range(PANEL_SIZE):
        row_offset = y * width
        for x in range(PANEL_SIZE):
            index = (row_offset + x_offset + x) * 4
            r, g, b, alpha = pixels[index : index + 4]
            chroma = saturation(r, g, b)
            # The approved character is yellow/brown/green on a nearly neutral gray background.
            mask[y][x] = alpha > 0.5 and chroma > 0.075 and max(r, g, b) > 0.08
    return mask


def largest_component(mask: list[list[bool]]) -> list[list[bool]]:
    height = len(mask)
    width = len(mask[0])
    visited = [[False for _ in range(width)] for _ in range(height)]
    largest: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            if not mask[y][x] or visited[y][x]:
                continue
            queue = deque([(x, y)])
            visited[y][x] = True
            component: list[tuple[int, int]] = []
            while queue:
                cx, cy = queue.popleft()
                component.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < width and 0 <= ny < height and mask[ny][nx] and not visited[ny][nx]:
                        visited[ny][nx] = True
                        queue.append((nx, ny))
            if len(component) > len(largest):
                largest = component
    output = [[False for _ in range(width)] for _ in range(height)]
    for x, y in largest:
        output[y][x] = True
    return output


def fill_internal_holes(mask: list[list[bool]]) -> list[list[bool]]:
    height = len(mask)
    width = len(mask[0])
    exterior = [[False for _ in range(width)] for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        for y in (0, height - 1):
            if not mask[y][x] and not exterior[y][x]:
                exterior[y][x] = True
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if not mask[y][x] and not exterior[y][x]:
                exterior[y][x] = True
                queue.append((x, y))
    while queue:
        cx, cy = queue.popleft()
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < width and 0 <= ny < height and not mask[ny][nx] and not exterior[ny][nx]:
                exterior[ny][nx] = True
                queue.append((nx, ny))
    return [[not exterior[y][x] for x in range(width)] for y in range(height)]


def remove_side_tail(mask: list[list[bool]]) -> list[list[bool]]:
    """Clamp the side-view tail bump; the tail is rebuilt separately with back-view width."""
    output = [row[:] for row in mask]
    row_maxima: list[int | None] = []
    for row in mask:
        active = [x for x, value in enumerate(row) if value]
        row_maxima.append(max(active) if active else None)
    valid = [value for value in row_maxima[100:330] if value is not None]
    if not valid:
        return output
    baseline = int(statistics.median(valid))
    for y in range(105, 315):
        current = row_maxima[y]
        if current is None:
            continue
        cap = baseline + 18
        if current > cap:
            for x in range(cap + 1, PANEL_SIZE):
                output[y][x] = False
    return output


def panel_bbox(mask: list[list[bool]]) -> tuple[int, int, int, int]:
    xs: list[int] = []
    ys: list[int] = []
    for y, row in enumerate(mask):
        for x, value in enumerate(row):
            if value:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def sample_mask(mask: list[list[bool]], u: float, v: float) -> bool:
    x = max(0, min(PANEL_SIZE - 1, int(u * (PANEL_SIZE - 1))))
    y = max(0, min(PANEL_SIZE - 1, int(v * (PANEL_SIZE - 1))))
    return mask[y][x]


def build_visual_hull(front: list[list[bool]], side: list[list[bool]]) -> bpy.types.Object:
    occupied: set[tuple[int, int, int]] = set()
    for k in range(NZ):
        v = (k + 0.5) / NZ
        for i in range(NX):
            u_front = (i + 0.5) / NX
            if not sample_mask(front, u_front, v):
                continue
            for j in range(NY):
                u_side = (j + 0.5) / NY
                if sample_mask(side, u_side, v):
                    occupied.add((i, j, k))

    dx = WORLD_WIDTH / NX
    dy = WORLD_DEPTH / NY
    dz = (WORLD_TOP - WORLD_BOTTOM) / NZ
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    vertex_lookup: dict[tuple[int, int, int], int] = {}

    def vertex_index(corner: tuple[int, int, int]) -> int:
        if corner not in vertex_lookup:
            i, j, k = corner
            vertex_lookup[corner] = len(vertices)
            vertices.append((-WORLD_WIDTH / 2 + i * dx, -WORLD_DEPTH / 2 + j * dy, WORLD_BOTTOM + k * dz))
        return vertex_lookup[corner]

    side_faces = {
        (-1, 0, 0): ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)),
        (1, 0, 0): ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)),
        (0, -1, 0): ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)),
        (0, 1, 0): ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)),
        (0, 0, -1): ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)),
        (0, 0, 1): ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)),
    }
    for i, j, k in occupied:
        for direction, corners in side_faces.items():
            neighbor = (i + direction[0], j + direction[1], k + direction[2])
            if neighbor in occupied:
                continue
            faces.append(tuple(vertex_index((i + cx, j + cy, k + cz)) for cx, cy, cz in corners))

    mesh = bpy.data.meshes.new("Nailong_Silhouette_Hull_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    hull = bpy.data.objects.new("Nailong_Silhouette_Hull_v003", mesh)
    bpy.context.collection.objects.link(hull)

    bpy.ops.object.select_all(action="DESELECT")
    hull.select_set(True)
    bpy.context.view_layer.objects.active = hull
    hull.data.remesh_voxel_size = 0.055
    bpy.ops.object.voxel_remesh()

    smooth = hull.modifiers.new("Silhouette_Soften", "SMOOTH")
    smooth.factor = 0.82
    smooth.iterations = 10
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    subdivision = hull.modifiers.new("Silhouette_Subdivision", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 1
    subdivision.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    for polygon in hull.data.polygons:
        polygon.use_smooth = True
    return hull


def clay_material(name: str, color: tuple[float, float, float, float]) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Roughness"].default_value = 0.72
    return material


def add_tail(material: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, location=(0.0, 1.54, 2.05))
    tail = bpy.context.object
    tail.name = "Nailong_Tail_Blockout_v003"
    tail.scale = (0.31, 0.48, 0.33)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    tail.data.materials.append(material)
    for polygon in tail.data.polygons:
        polygon.use_smooth = True
    return tail


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def create_camera(name: str, location: tuple[float, float, float]) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = 6.65
    camera = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = location
    look_at(camera, (0.0, 0.0, 2.68))
    return camera


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (0.035, 0.042, 0.05)


def add_stage_and_lights() -> None:
    floor_material = clay_material("MAT_Floor", (0.075, 0.085, 0.10, 1.0))
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0.0, 0.0, -0.02))
    floor = bpy.context.object
    floor.name = "Review_Floor"
    floor.data.materials.append(floor_material)
    for name, location, color, energy, size in (
        ("Key", (-5.0, -7.0, 9.0), (1.0, 0.76, 0.54), 1250.0, 5.0),
        ("Fill", (5.0, -3.0, 6.5), (0.48, 0.68, 1.0), 820.0, 4.0),
        ("Rim", (1.0, 6.0, 8.0), (1.0, 0.48, 0.26), 900.0, 3.0),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        light.location = location
        bpy.context.scene.collection.objects.link(light)
        look_at(light, (0.0, 0.0, 2.7))


def render_views(cameras: dict[str, bpy.types.Object]) -> None:
    scene = bpy.context.scene
    for name, camera in cameras.items():
        scene.camera = camera
        scene.render.filepath = str(OUTPUT_DIR / f"nailong-silhouette-v003-{name}.png")
        bpy.ops.render.render(write_still=True)


def write_report(front: list[list[bool]], side: list[list[bool]], hull: bpy.types.Object) -> None:
    report = {
        "asset": "nailong-silhouette-v003",
        "method": "reference-derived visual hull for sculpt base",
        "reference": "docs/characters/nailong-turnaround-v1-approved.png",
        "reference_dimensions_px": [SHEET_WIDTH, PANEL_SIZE],
        "front_mask_bbox_px": panel_bbox(front),
        "side_mask_bbox_px": panel_bbox(side),
        "grid": [NX, NY, NZ],
        "base_vertices_before_subdivision": len(hull.data.vertices),
        "base_polygons_before_subdivision": len(hull.data.polygons),
        "status": {
            "silhouette_base": True,
            "manual_sculpt_cleanup": False,
            "facial_features": False,
            "retopology": False,
            "uv": False,
            "rig": False,
        },
    }
    (OUTPUT_DIR / "nailong-silhouette-v003-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    clear_scene()
    configure_scene()
    image = bpy.data.images.load(str(REFERENCE_PATH), check_existing=True)
    if tuple(image.size) != (SHEET_WIDTH, PANEL_SIZE):
        raise RuntimeError(f"Unexpected approved reference size: {tuple(image.size)}")

    front = fill_internal_holes(largest_component(raw_panel_mask(image, 0)))
    side_raw = fill_internal_holes(largest_component(raw_panel_mask(image, 1)))
    side = remove_side_tail(side_raw)
    hull = build_visual_hull(front, side)
    body_material = clay_material("MAT_Nailong_Silhouette_Clay", (0.94, 0.56, 0.08, 1.0))
    hull.data.materials.append(body_material)
    add_tail(body_material)
    add_stage_and_lights()

    cameras = {
        "front": create_camera("CAM_FRONT", (0.0, -12.0, 2.68)),
        "side": create_camera("CAM_SIDE", (12.0, 0.0, 2.68)),
        "back": create_camera("CAM_BACK", (0.0, 12.0, 2.68)),
        "three-quarter": create_camera("CAM_THREE_QUARTER", (9.0, -10.0, 5.0)),
    }
    render_views(cameras)
    write_report(front, side, hull)
    bpy.context.scene.camera = cameras["front"]
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"Saved silhouette base: {BLEND_PATH}")
    print(f"Front bbox: {panel_bbox(front)}")
    print(f"Side bbox: {panel_bbox(side)}")


if __name__ == "__main__":
    main()
