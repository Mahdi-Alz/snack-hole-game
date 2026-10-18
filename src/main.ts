import './ui/styles.css';
import { Game } from './game';

const game = new Game();
game.start();
// Handle for smoke tests and the debug panel; not exposed in release builds.
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
