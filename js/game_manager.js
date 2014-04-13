function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;

  this.startTiles     = 2;
  this.aiHintDirection = -1;
  this.aiGameStates    = [];
  this.aiRunning       = false;

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.inputManager.on("aiAuto", this.aiAuto.bind(this));
  this.inputManager.on("aiBack", this.aiBack.bind(this));
  this.inputManager.on("aiStep", this.aiStep.bind(this));
  this.inputManager.on("aiHint", this.aiHint.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  if (this.over || (this.won && !this.keepPlaying)) {
    return true;
  } else {
    return false;
  }
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState && window.location.search == '') {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();

  }

  this.ai           = new AI(this.grid);

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  if (window.location.search != '') {
    this.setGridFromString(window.location.search.substring(1));
  } else {
    for (var i = 0; i < this.startTiles; i++) {
      this.addRandomTile();
    }
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.clearAiHint();
  this.storeAiGameState();
  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile();

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }

    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};

//Get the arrow character entity representing the chosen direction
GameManager.prototype.getArrow = function (direction) {

//classic arrows
var map = {
  0: '&#x2191;',  // Up
  1: '&#x2192;',  // Right
  2: '&#x2193;',  // Down
  3: '&#x2190;'   // Left
};

//triangles
var map = {
  0: '&#x25b2;',  // Up
  1: '&#x25b6;',  // Right
  2: '&#x25bc;',  // Down
  3: '&#x25c0;'   // Left
};

//  pointing fingers
var map = {
  0: '&#x261d;',  // Up
  1: '&#x261e;',  // Right
  2: '&#x261f;',  // Down
  3: '&#x261c;'   // Left
};

return map[direction];
};

//Get the cell value for a given hex value
GameManager.prototype.codeToValue = function (code) {
  var pow = parseInt(code,16);
  return Math.pow(2, pow);
}

//Get the hex value for a given cell value
GameManager.prototype.valueToCode = function (val) {
  var out = '0';
  if (val > 0) {
    var log = Math.log(val) / Math.LN2;
    out = log.toString(16);
  }
  return out;
}

GameManager.prototype.setGridFromString = function(gridStr) {
  for (var i = 0; i < gridStr.length; i++) {
    var value = this.codeToValue(gridStr.substr(i,1));
    var tile = new Tile({x: (i-i%4)/4, y: i%4 }, value);
    if (value > 1) {
      this.grid.insertTile(tile);
    } else {
      this.grid.removeTile(tile);
    }
  }
}

GameManager.prototype.getStringFromGrid = function(grid) {
  var out = '';
  grid.eachCell(function (x, y, tile) {
    if (tile) {
      var log = Math.log(tile.value) / Math.LN2;
      out += log.toString(16);
    } else {
      out += '0';
    }
  });
  return out;
}

GameManager.prototype.storeAiGameState = function() {
  var state = this.getStringFromGrid(this.grid);
  this.aiGameStates.push(state);
}

GameManager.prototype.clearAiHint = function() {
  this.aiHintDirection = -1;
  this.actuator.clearAiHint();
}

GameManager.prototype.getAiDirection = function() {
  var direction = this.aiHintDirection;
  if (direction == -1) {
    direction = this.ai.getDirection();
  }
  return direction;
}
GameManager.prototype.doAiAuto = function() {
  if (this.over) {
    this.aiAutoRunning = false;
  }
  if (this.aiAutoRunning) {
    var direction = this.getAiDirection();
    this.move(direction);
    var self = this;
    setTimeout(function(){ self.doAiAuto(); }, 10);
  }
}

GameManager.prototype.aiAuto = function () {
  if (! this.aiAutoRunning) {
    this.aiAutoRunning = true;
    this.doAiAuto();
  } else {
    this.aiAutoRunning = false;
  }
};

GameManager.prototype.aiBack = function () {
  if (this.aiGameStates.length < 2) {
    return null;
  }
  var currState = this.aiGameStates.pop();
  var prevState = this.aiGameStates.pop();
  this.setGridFromString(prevState);
  this.over = false;
  this.actuator.continueGame();
  this.actuate();
};

GameManager.prototype.aiStep = function () {
  this.aiAutoRunning = false;
  var direction = this.getAiDirection();
  this.move(direction);
  this.aiHint();
};

GameManager.prototype.aiHint= function () {
  this.aiAutoRunning = false;
  var direction = this.ai.getDirection();
  this.aiHintDirection = direction;
  this.actuator.displayAiHint(this.getArrow(direction));
};
