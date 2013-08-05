module.exports = addIndividualPairings;
module.exports.forTeams = addTeamPairings;

const firstRoundDateField = 89; // field-ID of the date entity for the first round
const maxRound = 40; // maximum of rounds where date and time could be set


function addIndividualPairings(swt, tnmt, relations) {
  var pairings = getIndividualPairings(swt, relations);
  var roundsElement = null;
  var roundElement = null;
  var boardsElement = null;
  var boardElement, resultElement;

  for (var roundNo in pairings) {
    for (var boardNo in pairings[roundNo]) {
      if (!roundsElement)
        roundsElement = tnmt.element('pairings');

      if (!roundElement) {
        roundElement = createRoundElement(roundsElement, roundNo, swt);
      }

      if (!boardsElement)
        boardsElement = roundElement.element('boards');

      boardElement = boardsElement.element('board')
        .attribute('number', boardNo.toString());

      boardElement.element('white')
        .attribute('player', pairings[roundNo][boardNo].white);
      boardElement.element('black')
        .attribute('player', pairings[roundNo][boardNo].black);

      if (pairings[roundNo][boardNo].results
        && typeof pairings[roundNo][boardNo].results.white !== 'undefined'
        && typeof pairings[roundNo][boardNo].results.black !== 'undefined') {
        resultElement = boardElement.element('result');
        resultElement.element('white', pairings[roundNo][boardNo].results.white.toString());
        resultElement.element('black', pairings[roundNo][boardNo].results.black.toString());
      }
    }

    roundElement = null;
    boardsElement = null;
  }
}


/**
 * Add the pairings of all Teams in a Team Tournament.
 * @param {Object} swt       Result from swtparser
 * @param {Object} tnmt      XMLbuilder Tournament object
 * @param {Object} relations Result of addPlayers() and addTeams()
 */
function addTeamPairings(swt, tnmt, relations) {
  var pairings = getTeamPairings(swt, relations);
  var roundsElement = null;
  var roundElement = null;
  var tablesElement = null;
  var tableElement = null;
  var boardsElement = null;
  var boardElement, resultElement;

  for (var roundNo in pairings) {
    for (var tableNo in pairings[roundNo]) {
      // check for spielfrei --> undefined A or B
      if (!pairings[roundNo][tableNo].teamA || !pairings[roundNo][tableNo].teamB) {
        // bye!
        continue;
      }

      if (!roundsElement)
        roundsElement = tnmt.element('pairings');

      if (!roundElement) {
        roundElement = createRoundElement(roundsElement, roundNo, swt);
      }

      if (!tablesElement)
        tablesElement = roundElement.element('tables');

      tableElement = tablesElement.element('table');
      tableElement.attribute('number', tableNo.toString());

      tableElement.element('team')
        .attribute('id', pairings[roundNo][tableNo].teamA)
        .attribute('position', '1');
      tableElement.element('team')
        .attribute('id', pairings[roundNo][tableNo].teamB)
        .attribute('position', '2');

      if (pairings[roundNo][tableNo].boards && Object.keys(pairings[roundNo][tableNo].boards).length > 0) {
        if (!boardsElement)
          boardsElement = tableElement.element('boards');

        for (var boardNo in pairings[roundNo][tableNo].boards) {
          boardElement = boardsElement.element('board');
          boardElement.attribute('number', boardNo.toString());
          boardElement.element('white')
            .attribute('player', pairings[roundNo][tableNo].boards[boardNo].white)
            .attribute('team', relations.teams.byPlayer[pairings[roundNo][tableNo].boards[boardNo].white]);
          boardElement.element('black')
            .attribute('player', pairings[roundNo][tableNo].boards[boardNo].black)
            .attribute('team', relations.teams.byPlayer[pairings[roundNo][tableNo].boards[boardNo].black]);

          if (pairings[roundNo][tableNo].boards[boardNo].results 
              && typeof pairings[roundNo][tableNo].boards[boardNo].results.white !== 'undefined'
              && typeof pairings[roundNo][tableNo].boards[boardNo].results.black !== 'undefined') {
            // add 'results' element
            resultElement = boardElement.element('result');
            resultElement.element('white', pairings[roundNo][tableNo].boards[boardNo].results.white.toString());
            resultElement.element('black', pairings[roundNo][tableNo].boards[boardNo].results.black.toString());
          }
        }
      }

      boardsElement = null;
    }

    roundElement = null;
    tablesElement = null;
  }
}


/**
 * Get the pairings of all Teams in a Team Tournament.
 * @param {Object} swt       Result from swtparser
 * @param {Object} relations Result of addPlayers() and addTeams()
 */
function getTeamPairings(swt, relations) {
  if (!swt.pairings_teams || swt.pairings_teams.length === 0)
    return {};

  var tables = {};
  swt.pairings_teams.forEach(function(parsedResult, i) {
    var roundNo = parsedResult.round;
    var tableNo = parsedResult[3005];

    if (!tables[roundNo])
      tables[roundNo] = {};

    if (!tables[roundNo][tableNo]) {
      var teamA = (parsedResult[3001] === '3001-1' ? parsedResult.team : parsedResult[3002]);
      var teamB = (parsedResult[3001] === '3001-1' ? parsedResult[3002] : parsedResult.team);
      teamA = relations.teams.newIdByHex[teamA];
      teamB = relations.teams.newIdByHex[teamB];

      tables[roundNo][tableNo] = {
        teamA: teamA,
        teamB: teamB,
        boards: {}
      };
    }
  });

  return getIndividualPairings(swt, relations, tables);
}


function getIndividualPairings(swt, relations, tables) {  
  if (tables) {
    // Team Tournament
    
    if (!swt.pairings_players || swt.pairings_players.length === 0)
      return tables;

    swt.pairings_players.forEach(function(parsedResult, i) {
      var roundNo = parsedResult.round;
      var tableNo = parsedResult[4004];
      var boardNo = parsedResult[4006];
      var color = ((parsedResult[4000] === '4000-1' || parsedResult[4000] === '4000-3') ? 'white' : 'black');

      var white = relations.players.newIdByHex[(color === 'white' ? parsedResult.player : parsedResult[4001])];
      var black = relations.players.newIdByHex[(color === 'black' ? parsedResult.player : parsedResult[4001])];

      if (tableNo === 0) {
        // fix issue that SwissChess does not save the
        // table number (known only for the first round)
        // --> find corresponding table number
        var team = relations.teams.byPlayer[white];
        for (var tableNo in tables[roundNo]) {
          if (tables[roundNo][tableNo].teamA === team || tables[roundNo][tableNo].teamB === team)
            break;
        }
      }

      if (tables[roundNo] && tables[roundNo][tableNo]) {
        if (!tables[roundNo][tableNo].boards[boardNo]) {
          tables[roundNo][tableNo].boards[boardNo] = getBoard(white, black);
        }

        if (parsedResult[4002] != '4002-0') {
          // set result for this player
          tables[roundNo][tableNo].boards[boardNo].results[color] = getPlayerResult(parsedResult);
        }
      }
    });

    return tables;
  } else {
    // Individual Tournament
    
    if (!swt.pairings_players || swt.pairings_players.length === 0)
      return {};

    var boards = {};

    swt.pairings_players.forEach(function(parsedResult, i) {
      var roundNo = parsedResult.round;
      var boardNo = parsedResult[4004];
      var color = ((parsedResult[4000] === '4000-1' || parsedResult[4000] === '4000-3') ? 'white' : 'black');

      var white = relations.players.newIdByHex[(color === 'white' ? parsedResult.player : parsedResult[4001])];
      var black = relations.players.newIdByHex[(color === 'black' ? parsedResult.player : parsedResult[4001])];

      if (!boards[roundNo])
        boards[roundNo] = {};

      if (!boards[roundNo][boardNo]) {
        boards[roundNo][boardNo] = getBoard(white, black);
      }

      if (parsedResult[4002] != '4002-0') {
        // set result for this player
        boards[roundNo][boardNo].results[color] = getPlayerResult(parsedResult);
      }
    });

    return boards;
  }
}


function getPlayerResult(parsedPairing) {
  var result = parsedPairing[4002];
  var win = ['4002-3', '4002-7', '4002-11', '4002-15'];
  var draw = ['4002-2', '4002-6', '4002-10', '4002-14'];
  var loss = ['4002-1', '4002-5', '4002-9', '4002-13'];

  if (win.indexOf(result) >= 0)
    return 1;
  if (draw.indexOf(result) >= 0)
    return 0.5;
  if (loss.indexOf(result) >= 0)
    return 0;

  return 0;
}

function getBoard(white, black) {
  return {
    white: white,
    black: black,
    results: {}
  };
}


/**
 * Create a new 'round'-node in /tournament/rounds.
 *   Adds 'information'-node if round date set.
 * @param  {Object} roundsElement XMLbuilder element for /tournament/rounds-node
 * @param  {Integer} roundNo       round number
 * @param  {Object} swt           returned object by swtparser
 * @return {Object}               XMLbuilder element for this round
 */
function createRoundElement(roundsElement, roundNo, swt) {
  var roundElement = roundsElement.element('round');
  roundElement.attribute('number', roundNo.toString());

  if (roundNo <= maxRound) {
    var dateField = firstRoundDateField+(roundNo-1)*2;
    if (swt.general.hasOwnProperty(dateField)) {
      // date known
      var informationElement = roundElement.element('information');
      informationElement.element('date', (new Date(swt.general[dateField])).toISOString().slice(0,10));

      if (swt.general.hasOwnProperty(dateField+1)) {
        // time known
        informationElement.element('time', swt.general[dateField+1].toString()+':00');
      }
    }
  }

  return roundElement;
}