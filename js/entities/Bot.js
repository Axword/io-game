import { Player } from './Player.js';
import { CLASSES } from '../config/classes.js';

const ALL_CLASSES = Object.keys(CLASSES);

export class Bot extends Player {
    constructor(x, y, scene) {
        const randomClass = ALL_CLASSES[Math.floor(Math.random() * ALL_CLASSES.length)];
        super(randomClass, { speed: 0, hp: 0, luck: 0 }, scene, true, x, y);
    }
}