import { Engine } from "./engine";
import { KickScene } from "./games/kick-scene";

const host = document.getElementById("app");
if (!host) throw new Error("#app host element not found");

const engine = new Engine(host, { width: 960, height: 600, background: "#0b1020" });
const scene = new KickScene(engine);
engine.setScene(scene).then(() => engine.start());
