function AI(grid) {
  this.grid          = grid;
  this.realData      = [];
  this.possibleMoves = [];
  this.gridTransform = -1; //  bitmask of h=1,v=2,r=4
}


/************************
 ***
 ***  STRATEGIC METHODS
 ***
 ************************/

/**
 * Get direction 0,1,2,3 to move in
 */
AI.prototype.getDirection = function() {
  this.realData = this.gridToData(this.grid);
  var realSum = this.arraySum(this.realData);

  var bestI = this.gridTransform;
  var realData = this.gridTransformMultiple(this.realData, this.gridTransform);
  var realSum = this.arraySum(realData);
  var flowMap = this.defaultFlowMap();
  var realValues = this.dataToFlowValues(realData, flowMap);
  var realScore = this.arraySum(realValues);

  if (this.gridTransform == -1 || realScore < (-realSum)/1.5) {
    var bestScore = realScore;
    var testScore = realScore + (realSum / 20);

    for (var i = 0; i <= 7; i++) {
      flipData = this.gridTransformMultiple(this.realData, i);
      var flipValues = this.dataToFlowValues(flipData, flowMap);
      var flipScore = this.arraySum(flipValues);
      if (flipScore > bestScore && flipScore > testScore) {
        bestScore = flipScore;
        bestI = i;
      }
    }
  }
  if (bestI != this.gridTransform) {
    this.gridTransform = bestI;
  }
  if (this.gridTransform != 0) {
    this.realData = this.gridTransformMultiple(this.realData, this.gridTransform);
  }

  this.findPossibleMoves();
  if (this.possibleMoves.length == 0) {

    return this.vToDirection(0);
  }
  if (this.possibleMoves.length == 1) {

    return this.vToDirection(this.possibleMoves[0].v);
  }

  var bestI = this.chooseBestMove();

  return bestI == -1 ? Math.floor(Math.random()*4) : this.vToDirection(this.possibleMoves[bestI].v);
}

/**
 * Find possible moves
 */
AI.prototype.findPossibleMoves = function() {
  var vectors = [4,1,-1,-4];
  this.possibleMoves = [];

  for (var i in vectors) {
    var v = vectors[i];
    var data = this.arrayCopy(this.realData);
    var result = this.tryVector(v, data, false);
    if (result != null) {
      var countOpen = this.arrayCount(result, 0);
      if (countOpen == 1) {
        //  if one slot left open, fill it with 2s to make a more realistic-behaving result
        result = this.arrayReplace(result, 0, 2);
        countOpen = 0;
      }
      this.possibleMoves.push({
        v         : v,
        data      : result,
        vTrace    : (v<0?'':'+')+v,
        countOpen : countOpen
      });
    }
  }
  if (data[15]<=8) {
    //  don't get lost checking merges if anchor isn't set
    return this.possibleMoves.length > 0;
  }

  if (this.possibleMoves.length < 2) {

    //  if only 1 move possible, no need to go on
    return this.possibleMoves.length == 1;
  }

  //  If several moves, follow out merges

  var i = 0;
  //  loop over growing list of possible moves (in effect, recursively)
  while (i < this.possibleMoves.length && i<=20) {
    var move = this.possibleMoves[i];
    i++;
    if (move.countOpen >= 13) {
      continue;
    }
    var data = this.arrayCopy(move.data);
    var lowerOnly = move.v == -4 ? true : false;
    var lockTiles = false;

    if (move.vTrace.length < 4 || (move.v != -1 && move.vTrace.length < 7)) {
      if (this.gridHasHorizontalMerges(data,lowerOnly)) {
        var rData = this.tryVector(1, move.data, lockTiles);
        var lData = this.tryVector(-1, move.data, lockTiles);
        if (move.countOpen <= 1) {
          rData = this.arrayReplace(rData, 0, 2);
          lData = this.arrayReplace(lData, 0, 2);
        }
        this.possibleMoves.push({v: move.v, data: rData, vTrace: move.vTrace + ',+1', countOpen: move.countOpen});
        this.possibleMoves.push({v: move.v, data: lData, vTrace: move.vTrace + ',-1', countOpen: move.countOpen});
      }
      if (this.gridHasVerticalMerges(data,lowerOnly)) {
        var dData = this.tryVector(4, move.data, lockTiles);
        if (move.countOpen <= 1) {
          dData = this.arrayReplace(dData, 0, 2);
        }
        this.possibleMoves.push({v: move.v, data: dData, vTrace: move.vTrace + ',+4', countOpen: move.countOpen});
      }
    }
  }  //  end of loop over growing list of possible Moves

  return true;
}

AI.prototype.chooseBestMove = function() {
  var flowMap = this.defaultFlowMap();
  var candMoves = [];

  //  load up initial candidates
  for (var i in this.possibleMoves) {
    var move = this.possibleMoves[i];
    candMoves.push({
      i          : i,
      v          : move.v,
      vTrace     : move.vTrace,
      data       : this.arrayCopy(move.data),
      flowValues : this.dataToFlowValues(move.data, flowMap)
    });
  }

  //  first check: does any move change the number of gold tiles?
  /*
  var winners = [];
  var realSum = this.arraySum(this.realData);
  if (realSum > 2000) {
    var realCountGoldTiles = this.arrayCountGreaterThan(this.realData, 64);
    for (var i in candMoves) {
      var move = candMoves[i];
      var countGoldTiles = this.arrayCountGreaterThan(move.data, 64);
      if (countGoldTiles != realCountGoldTiles) {
        winners.push(move);
      }
    }
    if (winners.length > 0 && winners.length != candMoves.length) {
      console.log('goldTiles');
      candMoves = winners;
    }
  }
  */

  var realFlowValues = this.dataToFlowValues(this.realData, flowMap);
  var cpList = this.defaultCellPriorityList();

  if ((realFlowValues[8] < -8 || realFlowValues[9] < -16 || realFlowValues[12] < -16) && realFlowValues[15] >= 64) {
    flowMap = this.altFlowMap();
    cpList = this.altCellPriorityList();
    realFlowValues = this.dataToFlowValues(this.realData, flowMap);
  }

  var cpIdx = 0;

  while (candMoves.length > 1 && cpIdx < cpList.length) {
    var cell = cpList[cpIdx];
    var bestValue = -10000;
    var winners = [];
    var pushes = [];

    for (var c in candMoves) {
      var cand = candMoves[c];
      if (cand.flowValues[cell] > realFlowValues[cell] && cand.flowValues[cell] >= bestValue) {
        if (cand.flowValues[cell] > bestValue) {
          winners = [];
          bestValue = cand.flowValues[cell];
        }
        winners.push(cand);
      }
      if (cand.flowValues[cell] == realFlowValues[cell] || Math.abs(realFlowValues[cell]) <= 2) {
        pushes.push(cand);
      }
    }

    if (winners.length > 0) {
      if (winners.length == 1) {

        return winners[0].i;
      }
      candMoves = winners;
    } else if (pushes.length > 0) {
      //  if no clear winners, at least prune losers from the list
      candMoves = pushes;
    }
    //  else we're at a level where all remaining candidates are the same, so just go on to next cell

    cpIdx ++;
  }

  //  if no clear winner based on flow map, choose the one with most open cells

  if (candMoves.length > 1) {
    var bestScore = -1;
    var bestMove = null;
    for (var i in candMoves) {
      var move = candMoves[i];
      var score = this.arrayCount(move.data, 0);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    candMoves[0] = bestMove;
  }

  winner = candMoves[0];

  return winner.i;
}

AI.prototype.dataToFlowValues = function(data, flowMap) {
  var out = this.arrayCopy(data);
  for (var i in flowMap) {
    var f = flowMap[i];
    if (data[i] > data[f]) {
      out[i] = - out[i];
    }
  }
  return out;
}

AI.prototype.defaultFlowMap = function() {
  var flowMap = {
    14: 15,
    13: 14,
    12: 13,
    11: 10,
    10:  9,
     9:  8,
     8: 12,
     7:  6,
     6:  5,
     5:  4,
     4:  8,
     3:  2,
     2:  1,
     1:  0,
     0:  4
  };
  return flowMap;
}

AI.prototype.defaultCellPriorityList = function() {
  var out = [15,14,13,12,8,4,9,0,5,10,1];
  return out;
}



AI.prototype.altFlowMap = function() {
  var flowMap = {
    14: 15,
    13: 14,
    12: 13,
    11: 15,
    10: 11,
     9: 10,
     8: 12,
     7: 11,
     6:  7,
     5:  6,
     4:  5,
     3:  7,
     2:  3,
     1:  2,
     0:  1
  };
  return flowMap;
}

AI.prototype.altCellPriorityList = function() {
  var out = [15,14,13,12,9,8,11,10];
  return out;
}



/************************
 ***
 ***  LOGICAL METHODS
 ***
 ************************/

/**
 * Try moving grid by vector, return new data if successful
 */
AI.prototype.tryVector = function(vector, startData, lockTiles) {
  var moved   = false;
  var data = this.arrayCopy(startData);

  //  By default, start checking tiles at top left
  var startLoop = 0;
  var endLoop = 16;
  var stepLoop = 1;

  if (vector > 0) {
    //  If sliding down or right, start checking tiles at bottom right
    startLoop = 15;
    endLoop = -1;
    stepLoop = -1;
  }

  //  check cells one by one
  for (var idx = startLoop; idx != endLoop; idx += stepLoop) {
    if (startData[idx] == 0) {
      continue;
    }
    //  i is the actual tile position in the array, which can change as it slides
    var i = idx;
    var v = vector;

    //  keep applying v as long as we're in range
    while (i >= 0 && i <= 15) {
      //  if trying r/l and now looking at a different row, go on to next
      if ((v == 1 || v == -1) && Math.floor(i/4) != Math.floor((i+v)/4)) {
        i = 1000;
      } else if (
          //  Move if:
          //  We hit a tile we can merge with
          //  (must be the same as us, and not itself the result of a merge: data[i+v] would then equal, but startData[i+v] not)
          (data[i] == startData[i+v])
          ||
          //  Or if we hit a zero
          //  (and tiles not locked, or the zero caused by something else sliding)
          (data[i+v] == 0 && (!lockTiles || startData[i+v] != 0))
        ) {
        moved = true;
        data[i+v] += data[i];
        data[i] = 0;
        //  if it was a merge we stop, else we go on
        i = (data[i+v] == 2*startData[i+v]) ? 1000 : i+v;
      } else {
        //  we hit something different, so stop and go on to next
        i = 1000;
      }
    }  //  i out of range
  }  //  done checking cells

  var out = moved ? data : null;
  return out;
}

AI.prototype.gridHasHorizontalMerges = function(data, lowerOnly) {
  var out = false;
  var start = lowerOnly ? 8 : 0;
  for (var i = start; i <= 15; i++) {
    if (data[i] == 0) {
      continue;
    }
    //  if filled, find next non-zero cell across, if any
    var dx = 1;
    while ((i+dx) % 4 != 0 && data[i+dx] == 0) {
      dx++;
    }
    if ((i+dx) % 4 != 0 && data[i] == data[i+dx]) {
      out = true;
    }
  }
  return out;
}

AI.prototype.gridHasVerticalMerges = function(data, lowerOnly) {
  var out = false;
  var start = lowerOnly ? 8 : 0
  for (var i = start; i <= 11; i++) {
    if (data[i] == 0) {
      continue;
    }
    //  if filled, find next non-zero cell down, if any
    var dy = 4;
    while ((i+dy) < 16 && data[i+dy] == 0) {
      dy++;
    }
    if ((i+dy) < 16 && data[i] == data[i+dy]) {
      out = true;
    }
  }
  return out;
}





/************************
 ***
 ***  UTILITY METHODS
 ***
 ************************/

/**
 * Copies GC's grid object to a flat size-16 array of values
 */
AI.prototype.gridToData = function(grid) {
  var out = [];
  grid.eachCell(function (x, y, tile) {
    out[4*y+x] = tile ? tile.value : 0;
  });
  return out;
}

/**
 * Flip data grid array multiple ways
 * i is a bitmask h=1,v=2,r=4
 */
AI.prototype.gridTransformMultiple = function(data, i) {
  var out = this.arrayCopy(data);
  if (i>=4) {
    out = this.gridTransformRotate(out);
  }
  if (i%4 >1) {
    out = this.gridTransformVertical(out);
  }
  if (i%2 == 1) {
    out = this.gridTransformHorizontal(out);
  }
  return out;
}

/**
 * Flip data grid array horizontally
 */
AI.prototype.gridTransformHorizontal = function(data) {
  var out = [];
  for (var i in data) {
    var r = (i%4) * 2;
    var h = i - r + 3;
    out[h] = data[i];
  }
  return out;
}

/**
 * Flip data grid array vertically
 */
AI.prototype.gridTransformVertical = function(data) {
  var out = [];
  for (var i in data) {
    var r = (i%4) * 2;
    var v = r - i + 12;
    out[v] = data[i];
  }
  return out;
}

/**
 * Flip data grid array counterclockwise
 */
AI.prototype.gridTransformRotate = function(data) {
  var out = [];
  for (var i in data) {
    var r = (i%4) * 4.25;
    var v = (i*.25) - r + 12;
    out[v] = data[i];
  }
  return out;
}

/**
 * Converts internal vector value to GC's direction
 */
AI.prototype.vToDirection = function(v) {
  var out = -1;
  var map = [ -4, 1, 4, -1 ]; // Cirulli's up, right, down, left

  //  if horizontal flip
  if ((this.gridTransform % 2 == 1) && Math.abs(v) == 1) {
    v = -v;
  }
  //  if vertical flip
  if ((this.gridTransform % 4 >1) && Math.abs(v) == 4) {
    v = -v;
  }
  for ( var i in map) {
    if (map[i] == v) {
      out = i;
    }
  }

  //  if rotation
  if (this.gridTransform >= 4) {
    out = parseInt(out) + 1;
    out = out > 3 ? 0 : out;
  }

  return out;
}

/**
 * Copies a flat array
 */
AI.prototype.arrayCopy = function(data) {
  return data.slice(0);
}

/**
 * Counts occurrences of value in array
 */
AI.prototype.arrayCount = function(data, val) {
  var count = 0;
  for (var i in data) {
    if (val == data[i]) {
      count++;
    }
  }
  return count;
}

/**
 * Counts elements greater than value in array
 */
AI.prototype.arrayCountGreaterThan = function(data, val) {
  var count = 0;
  for (var i in data) {
    if (val < data[i]) {
      count++;
    }
  }
  return count;
}

/**
 * Replaces occurrences of value in array
 */
AI.prototype.arrayReplace = function(data, val, replaceVal) {
  for (var i in data) {
    if (val == data[i]) {
      data[i] = replaceVal;
    }
  }
  return data;
}

/**
 * Sums values in array
 */
AI.prototype.arraySum = function(data) {
  var total = 0;
  for (var i in data) {
    total += data[i];
  }
  return total;
}