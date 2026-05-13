import { startGame } from "./game";

const host = document.getElementById("app");
if (!host) throw new Error("#app host element not found");
startGame(host);
