/* Tile Fusion: sliding-merge number puzzle with undo, saved game and swipe. DOM grid. */
(function () {
  'use strict';
  var K = window.GLKit, F = window.FusionLogic, $ = K.$;
  K.init('Tile Fusion');
  if (!F) { K.fail('Tile Fusion could not start.'); return; }

  var SAVE = 'gl_fusion_save', best = K.best('gl_fusion_best');
  var g = null, mode = 'title', cells = [];
  var screens = K.screens(['title', 'won', 'over']);

  // Original palette: value -> hue walk from blue through violet and pink to gold.
  function colour(v) {
    if (!v) return '';
    var step = Math.log2(v); // 1..
    var hue = (220 + step * 24) % 360, light = Math.max(34, 58 - step * 1.6);
    return 'hsl(' + hue + ' 70% ' + light + '%)';
  }

  (function build() {
    for (var i = 0; i < 16; i++) { var d = document.createElement('div'); d.className = 'cell'; d.setAttribute('role', 'gridcell'); $('board').appendChild(d); cells.push(d); }
  })();

  function render(info) {
    info = info || {};
    g.grid.forEach(function (v, i) {
      var c = cells[i], len = String(v).length;
      c.textContent = v || '';
      c.className = 'cell' + (len >= 3 ? ' n' + Math.min(len, 5) : '') + (info.spawned === i ? ' pop' : '') + (info.merged && info.merged.indexOf(i) >= 0 ? ' merge' : '');
      c.style.background = colour(v);
      c.style.boxShadow = v >= 128 ? '0 0 ' + Math.min(24, Math.log2(v) * 2) + 'px ' + colour(v) : '';
      c.setAttribute('aria-label', v ? String(v) : 'empty');
    });
    $('score').textContent = g.score; $('best').textContent = Math.max(best.get() || 0, g.score);
    $('undoLeft').textContent = g.undosLeft;
    $('undoBtn').disabled = !g.history.length || g.undosLeft <= 0; $('undoBtn2').disabled = $('undoBtn').disabled;
  }
  function persist() { K.save(SAVE, g.over ? null : { grid: g.grid, score: g.score, moves: g.moves, won: g.won, keepPlaying: g.keepPlaying, undosLeft: g.undosLeft }); }

  function newGame() { g = F.createGame(); mode = 'play'; screens.show(null); render({ spawned: -1 }); persist(); try { $('board').focus(); } catch (e) { /* ignore */ } K.announce('New game.'); }
  function resumeSaved() {
    var s = K.load(SAVE, null); if (!s) return newGame();
    g = F.createGame(); g.grid = s.grid; g.score = s.score; g.moves = s.moves; g.won = s.won; g.keepPlaying = s.keepPlaying; g.undosLeft = s.undosLeft; g.over = !F.canMove(g);
    mode = 'play'; screens.show(null); render(); try { $('board').focus(); } catch (e) { /* ignore */ }
  }

  function slide(dir) {
    if (mode !== 'play') return;
    var r = F.move(g, dir);
    if (!r.moved) { K.sound.play('blip'); return; }
    K.sound.play(r.gained ? 'pop' : 'place');
    render(r); best.submit(g.score); persist();
    if (r.gained) K.announce('Fused for ' + r.gained + '. Score ' + g.score + '.');
    if (g.won && !g.keepPlaying) { mode = 'won'; K.sound.play('win'); screens.show('won'); K.announce('2048 reached!'); }
    else if (g.over) {
      mode = 'over'; K.sound.play('lose');
      $('finalScore').textContent = g.score; $('overMax').textContent = 'Biggest tile: ' + F.maxTile(g);
      $('bestOver').textContent = 'Best: ' + best.get(); screens.show('over'); K.announce('No moves left. Score ' + g.score + '.');
    }
  }
  function undo() {
    if (!F.undo(g)) return;
    mode = 'play'; screens.show(null); render(); persist(); K.announce('Move undone. ' + g.undosLeft + ' undos left.');
  }

  var KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
  window.addEventListener('keydown', function (e) {
    if (KEYS[e.code]) { e.preventDefault(); slide(KEYS[e.code]); }
    if (e.code === 'KeyZ' || e.code === 'KeyU') undo();
  });
  K.swipe($('board'), slide, 20);
  $('playBtn').addEventListener('click', newGame); $('newBtn').addEventListener('click', newGame); $('newBtn2').addEventListener('click', newGame); $('againBtn').addEventListener('click', newGame);
  $('resumeSaved').addEventListener('click', resumeSaved);
  $('keepBtn').addEventListener('click', function () { g.keepPlaying = true; mode = 'play'; screens.show(null); persist(); });
  $('undoBtn').addEventListener('click', undo); $('undoBtn2').addEventListener('click', undo);
  K.onRestart(newGame); K.muteButton();

  g = F.createGame(); render();
  $('bestTitle').textContent = best.get() ? 'Your best: ' + best.get() : '';
  $('resumeSaved').hidden = !K.load(SAVE, null);
  screens.show('title');
  window.GLDebug = { state: function () { return { mode: mode, score: g.score, moves: g.moves, max: F.maxTile(g), over: g.over, undosLeft: g.undosLeft, grid: g.grid.slice() }; } };
  K.ready();
})();
