import "@fontsource/zcool-kuaile/400.css";
import "./style.css";
import { GameRuntime } from "./core/game-runtime";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const status = document.querySelector<HTMLDivElement>("#status");

if (!canvas || !status) {
  throw new Error("Required application roots are missing.");
}

const runtime = new GameRuntime(canvas, status);
runtime.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => runtime.dispose());
}
