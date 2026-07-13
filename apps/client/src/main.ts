import Phaser from "phaser";
import { MiningScene } from "./scenes/MiningScene";

new Phaser.Game({
	type: Phaser.AUTO,
	parent: "game",
	width: 960,
	height: 540,
	backgroundColor: "#0b0b12",
	scale: {
		mode: Phaser.Scale.FIT,
		autoCenter: Phaser.Scale.CENTER_BOTH,
	},
	scene: [MiningScene],
});
