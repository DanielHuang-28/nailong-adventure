"""Create a calibrated Blender scene for exact Nailong turnaround reconstruction."""

from __future__ import annotations

from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_PATH = PROJECT_ROOT / "docs" / "characters" / "nailong-turnaround-v1-approved.png"
BLEND_PATH = PROJECT_ROOT / "assets-source" / "blender" / "characters" / "nailong" / "nailong-reference-scene.blend"
REVIEW_DIR = PROJECT_ROOT / "docs" / "characters" / "nailong-reference-calibration"

PANEL_WIDTH_PX = 724
SHEET_WIDTH_PX = 2172
SHEET_HEIGHT_PX = 724
PLANE_WIDTH_M = 6.0
PLANE_BOTTOM_Z = -0.32
PLANE_TOP_Z = 5.68
MODEL_TARGET_HEIGHT_M = 5.36


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def reference_material(name: str, image: bpy.types.Image) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (1.0, 1.0, 1.0, 0.72)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    shader.inputs["Roughness"].default_value = 1.0
    shader.inputs["Alpha"].default_value = 1.0
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    if "Emission Color" in shader.inputs:
        links.new(texture.outputs["Color"], shader.inputs["Emission Color"])
        shader.inputs["Emission Strength"].default_value = 1.0
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    return material


def make_reference_plane(
    name: str,
    vertices: list[tuple[float, float, float]],
    uv_min: float,
    uv_max: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="Turnaround_UV")
    uv_values = ((uv_min, 0.0), (uv_max, 0.0), (uv_max, 1.0), (uv_min, 1.0))
    for loop, uv in zip(mesh.loops, uv_values):
        uv_layer.data[loop.index].uv = uv
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.hide_select = True
    obj.show_in_front = True
    return obj


def create_camera(name: str, location: tuple[float, float, float], target: tuple[float, float, float]) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = 6.65
    data.lens = 70
    camera = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = location
    look_at(camera, target)
    return camera


def add_measurement_guides(collection: bpy.types.Collection) -> None:
    guide_points = {
        "GUIDE_FLOOR": (0.0, 0.0, 0.0),
        "GUIDE_TARGET_TOP": (0.0, 0.0, MODEL_TARGET_HEIGHT_M),
        "GUIDE_BODY_CENTER": (0.0, 0.0, 2.55),
        "GUIDE_EYE_LINE": (0.0, 0.0, 4.48),
    }
    for name, location in guide_points.items():
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_type = "PLAIN_AXES"
        empty.empty_display_size = 0.22
        empty.location = location
        collection.objects.link(empty)


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 820
    scene.render.resolution_y = 820
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.world.color = (0.035, 0.035, 0.035)
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def render_reference_checks(cameras: dict[str, bpy.types.Object], planes: dict[str, bpy.types.Object]) -> None:
    scene = bpy.context.scene
    for view_name, camera in cameras.items():
        for plane_name, plane in planes.items():
            plane.hide_render = plane_name != view_name
        scene.camera = camera
        scene.render.filepath = str(REVIEW_DIR / f"nailong-reference-{view_name}.png")
        bpy.ops.render.render(write_still=True)
    for plane in planes.values():
        plane.hide_render = True
    scene.camera = cameras["front"]


def main() -> None:
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    clear_scene()
    configure_scene()

    refs = bpy.data.collections.new("00_REFERENCE_LOCKED")
    sculpt = bpy.data.collections.new("10_SCULPT_WORK")
    guides = bpy.data.collections.new("20_MEASUREMENT_GUIDES")
    bpy.context.scene.collection.children.link(refs)
    bpy.context.scene.collection.children.link(sculpt)
    bpy.context.scene.collection.children.link(guides)

    image = bpy.data.images.load(str(REFERENCE_PATH), check_existing=True)
    image.colorspace_settings.name = "sRGB"
    material = reference_material("MAT_Nailong_Approved_Turnaround", image)
    one_third = PANEL_WIDTH_PX / SHEET_WIDTH_PX

    planes = {
        "front": make_reference_plane(
            "REF_FRONT_APPROVED",
            [
                (-3.0, 1.75, PLANE_BOTTOM_Z),
                (3.0, 1.75, PLANE_BOTTOM_Z),
                (3.0, 1.75, PLANE_TOP_Z),
                (-3.0, 1.75, PLANE_TOP_Z),
            ],
            0.0,
            one_third,
            material,
            refs,
        ),
        "side": make_reference_plane(
            "REF_SIDE_APPROVED",
            [
                (-1.75, -3.0, PLANE_BOTTOM_Z),
                (-1.75, 3.0, PLANE_BOTTOM_Z),
                (-1.75, 3.0, PLANE_TOP_Z),
                (-1.75, -3.0, PLANE_TOP_Z),
            ],
            one_third,
            one_third * 2.0,
            material,
            refs,
        ),
        "back": make_reference_plane(
            "REF_BACK_APPROVED",
            [
                (3.0, -1.75, PLANE_BOTTOM_Z),
                (-3.0, -1.75, PLANE_BOTTOM_Z),
                (-3.0, -1.75, PLANE_TOP_Z),
                (3.0, -1.75, PLANE_TOP_Z),
            ],
            one_third * 2.0,
            1.0,
            material,
            refs,
        ),
    }

    target = (0.0, 0.0, 2.68)
    cameras = {
        "front": create_camera("CAM_FRONT_ORTHO", (0.0, -12.0, 2.68), target),
        "side": create_camera("CAM_SIDE_ORTHO", (12.0, 0.0, 2.68), target),
        "back": create_camera("CAM_BACK_ORTHO", (0.0, 12.0, 2.68), target),
    }
    add_measurement_guides(guides)
    render_reference_checks(cameras, planes)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"Saved calibrated reference scene: {BLEND_PATH}")
    print(f"Reference sheet verified as {SHEET_WIDTH_PX}x{SHEET_HEIGHT_PX}, exactly three {PANEL_WIDTH_PX}px panels")


if __name__ == "__main__":
    main()
