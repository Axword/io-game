import { Player } from './Player.js';

export class Bot extends Player {
    constructor(x, y, scene) {
        const classes = ['warrior', 'archer', 'mage', 'berserker'];
        const randomClass = classes[Math.floor(Math.random() * classes.length)];
        super(randomClass, { speed: 0, hp: 0, luck: 0 }, scene, true, x, y);
    }
}