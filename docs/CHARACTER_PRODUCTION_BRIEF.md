# 双主角正式制作简报

## 已锁定参考

- 奶龙：[`characters/nailong-turnaround-v1-approved.png`](./characters/nailong-turnaround-v1-approved.png)
- 洞洞幺：[`characters/dongdongyao-turnaround-approved.png`](./characters/dongdongyao-turnaround-approved.png)
- 狗熊岭跑酷画面：[`art-direction/gouxiongling-runner-keyframe-v1.png`](./art-direction/gouxiongling-runner-keyframe-v1.png)
- 海底跑酷画面：[`art-direction/undersea-runner-keyframe-v2-dongdongyao.png`](./art-direction/undersea-runner-keyframe-v2-dongdongyao.png)

未经用户明确要求，不再改变两位角色的头身比例、基础轮廓和识别要点。

## 生产流程

1. 高模雕刻：连续曲面，不使用基础几何体拼装作为最终角色。
2. 游戏拓扑：为面部、肩、髋、膝、肘和腹部挤压拉伸预留合理环线。
3. UV 与材质：统一色彩空间，控制材质数量，保留眼睛独立高光表现。
4. 骨骼：根骨、骨盆、脊柱、头、眼睛、四肢、手脚、尾巴；洞洞幺增加背包和喷口控制骨。
5. 蒙皮与表情：跑跳时轮廓稳定；支持眨眼、微笑、惊讶、用力和回头互动。
6. 导出：GLB 为游戏主格式，保留源工程与无损贴图。

## 第一批动作

```text
idle
run
jump_start
jump_loop
land
slide
hit
celebrate
look_back
portal_escape
```

奶龙跑步需要明显但克制的挤压拉伸；洞洞幺跑步必须保留背包惯性、回头和喷口发光变化。

## 验收门槛

- 正、侧、背轮廓与已确认三视图一致。
- 奶龙无耳朵、无角；洞洞幺背带和双喷口背包结构完整。
- 中性姿势无明显蒙皮塌陷，极限动作不破坏角色识别。
- 游戏相机距离下眼睛、肚皮、爪尖、背带和喷口仍可辨认。
- 模型经过浏览器端性能实测后再确定最终 LOD 三角形预算。
