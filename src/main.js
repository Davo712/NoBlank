import './style.css';
import { Game } from './game/Game.js';

const game = new Game(document.getElementById('app'));
game.boot();

if (import.meta.env.DEV) window.game = game;
