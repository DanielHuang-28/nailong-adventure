import type { RunnerAction } from "./runner-action";

export interface PointerPoint {
  x: number;
  y: number;
  timeMs: number;
}

export interface SwipeOptions {
  minimumDistance: number;
  maximumDurationMs: number;
  axisDominance: number;
}

export const DEFAULT_SWIPE_OPTIONS: SwipeOptions = {
  minimumDistance: 34,
  maximumDurationMs: 620,
  axisDominance: 1.12,
};

export function recognizeSwipe(
  start: PointerPoint,
  end: PointerPoint,
  options: SwipeOptions = DEFAULT_SWIPE_OPTIONS,
): RunnerAction | null {
  if (end.timeMs - start.timeMs > options.maximumDurationMs) return null;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontal = Math.abs(dx);
  const vertical = Math.abs(dy);

  if (Math.max(horizontal, vertical) < options.minimumDistance) return null;
  if (horizontal > vertical * options.axisDominance) return dx < 0 ? "left" : "right";
  if (vertical > horizontal * options.axisDominance) return dy < 0 ? "jump" : "slide";
  return null;
}

export class SwipeInput {
  private activePointerId: number | null = null;
  private startPoint: PointerPoint | null = null;

  constructor(
    private readonly target: Window,
    private readonly onAction: (action: RunnerAction) => void,
  ) {}

  connect(): void {
    this.target.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    this.target.addEventListener("pointerup", this.onPointerUp, { passive: true });
    this.target.addEventListener("pointercancel", this.onPointerCancel, { passive: true });
  }

  disconnect(): void {
    this.target.removeEventListener("pointerdown", this.onPointerDown);
    this.target.removeEventListener("pointerup", this.onPointerUp);
    this.target.removeEventListener("pointercancel", this.onPointerCancel);
    this.reset();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.activePointerId !== null) return;
    if ((event.target as HTMLElement | null)?.closest("button")) return;
    this.activePointerId = event.pointerId;
    this.startPoint = { x: event.clientX, y: event.clientY, timeMs: event.timeStamp };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId || !this.startPoint) return;
    const action = recognizeSwipe(this.startPoint, {
      x: event.clientX,
      y: event.clientY,
      timeMs: event.timeStamp,
    });
    this.reset();
    if (action) this.onAction(action);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.activePointerId) this.reset();
  };

  private reset(): void {
    this.activePointerId = null;
    this.startPoint = null;
  }
}

