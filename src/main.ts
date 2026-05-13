import Phaser from "phaser";
import { PushScene } from "./scenes/PushScene";

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
  },
  scene: [PushScene],
};

new Phaser.Game(config);
