function AI(grid) {
  this.grid = grid;
}


/************************
 ***
 ***  BASE METHODS
 ***
 ************************/


AI.prototype.getDirection = function() {
  return Math.floor(Math.random()*4);
}