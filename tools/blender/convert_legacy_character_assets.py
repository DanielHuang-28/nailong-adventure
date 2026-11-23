"""Convert the approved legacy OBJ placeholders into self-contained GLB files.

This script reads the migration package without modifying it. The generated GLBs
belong to the new Vite project and can later be replaced by rigged assets without
changing runtime code.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def convert(source: Path, destination: Path, asset_name: str) -> None:
    clear_scene()
    bpy.ops.wm.obj_import(filepath=str(source), validate_meshes=True)

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh imported from {source}")

    root = bpy.data.objects.new(asset_name, None)
    bpy.context.scene.collection.objects.link(root)

    for mesh in meshes:
        mesh.parent = root
        mesh.select_set(True)
        for material in mesh.data.materials:
            if material is None or not material.use_nodes:
                continue
            material.diffuse_color = (*material.diffuse_color[:3], 1.0)
            material.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.58

    # The source assets already use metres, stand on Y=0 and face -Z.
    # Preserve those transforms so the runtime contract remains deterministic.
    root["asset_role"] = "development-character-placeholder"
    root["forward_axis"] = "-Z"
    root["up_axis"] = "+Y"

    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = root

    bpy.ops.export_scene.gltf(
        filepath=str(destination),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(script_args)


def main() -> None:
    args = parse_args()
    jobs = (
        ("奶龙-连续曲面角色模型.obj", "nailong-development.glb", "NailongDevelopment"),
        ("洞洞幺-连续曲面角色模型.obj", "dongdongyao-development.glb", "DongdongyaoDevelopment"),
    )
    for source_name, output_name, asset_name in jobs:
        convert(args.source_dir / source_name, args.output_dir / output_name, asset_name)
        print(f"Exported {output_name}")


if __name__ == "__main__":
    main()
