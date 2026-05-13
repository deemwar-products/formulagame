import Phaser from "phaser";
import { KickScene } from "./scenes/KickScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#0b1020",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 600,
  },
  render: {
    antialias: true,
    pixelArt: false,
    preserveDrawingBuffer: true,
  },
  scene: [KickScene],
};

new Phaser.Game(config);
