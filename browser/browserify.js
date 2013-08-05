;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var swt2ctx = require('../lib/index');

function replace(str) {
  var tagsToReplace = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
  };
  return str.replace(/[&<>]/g, function replaceTag(tag) {
    return tagsToReplace[tag] || tag;
  });
}

function handleFileSelect(evt) {
  var pre = document.querySelector('pre');
  if (pre)
    pre.remove();

  var file = evt.target.files[0];
  var reader = new FileReader();

  reader.onload = function(e) {
    view = new DataView(this.result);
    swt2ctx(view, { pretty: true }, function(err, xml) {
      var element = document.createElement('pre');
      var classAttribute = document.createAttribute('class');
      classAttribute.value = 'prettyprint';
      element.setAttributeNode(classAttribute);
      document.body.appendChild(element).innerHTML = replace(xml);
      t = xml; // access it via Firebug...

      if (document.querySelector('#pretty').checked === true) {
        prettyPrint();
      }
    });
  }

  reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('file').addEventListener('change', handleFileSelect, false);

  document.querySelector('#pretty').addEventListener('change', function() {
    if (document.querySelector('#pretty').checked === true && !document.querySelector('pre.prettyprinted')) {
      prettyPrint();
    }
  });
});
},{"../lib/index":2}],2:[function(require,module,exports){
module.exports = swt2ChessML;

var parseSWT = require('swtparser');
var builder = require('xmlbuilder');

var utils = require('./utils');
var setGeneralInformation = require('./information');
var setSettings = require('./settings');
var addPlayers = require('./players');
var addTeams = require('./teams');
var addPairings = require('./pairings');


/**
 * Main method to convert an SWT into ChessML.
 * @param  {Anything} from     SWT file, accepted formats definined by the module
 *                               swtparser, e.g. currently Filename, Buffer, DataView
 * @param {Object} options Options to use in XMLbuilder
 * @param  {Function} callback
 */
function swt2ChessML(from, options, callback) {
  parseSWT(from, function(err, parsed) {
    if (err)
      return callback(err);

    convert(parsed, options, callback);
  });
}


/**
 * Convert a swtparser Object into ChessML.
 * @param  {Object}   swt      result by swtparser
 * @param  {Object}   options  XMLbuilder .end() options
 * @param  {Function} callback
 */
function convert(swt, options, callback) {
  var tnmt = builder.create('ctx:tournament');
  tnmt.attribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
  tnmt.attribute('xsi:schemaLocation', 'http://ctx.chess.io CTX.xsd');
  tnmt.attribute('xmlns:ctx', 'http://ctx.chess.io');

  var relations = {};

  var type = setGeneralInformation(swt, tnmt);
  setSettings(swt, tnmt);
  relations.players = addPlayers(swt, tnmt);

  if (type === 'team') {
    relations.teams = addTeams(swt, tnmt, relations);
    addPairings.forTeams(swt, tnmt, relations);
  }
  else {
    addPairings(swt, tnmt, relations);
  }

  // finished
  var xml = tnmt.end(options);
  callback(null, xml);
}
},{"./information":3,"./pairings":4,"./players":5,"./settings":6,"./teams":7,"./utils":8,"swtparser":18,"xmlbuilder":22}],3:[function(require,module,exports){
module.exports = setGeneralInformation;

var utils = require('./utils');


/**
 * Set the Tournament's general information, e.g. especially its type
 *   (individual or team) and everything that belongs in the
 *   /tournament/information path.
 *   
 * @param {Object} swt  result from swtparser
 * @param {Object} tnmt XMLbuilder root element
 * @return {String} tournament type, either "team" or "individual"
 */
function setGeneralInformation(swt, tnmt) {
  // Tournament type
  var type = (swt.general['35'] === true ? 'team' : 'individual');
  tnmt.attribute('type', type);

  var information = tnmt.element('information');
  
  // Tournament name
  information.element('name', swt.general[65]);

  // Tournament's date
  var date = information.element('date');
  date.element('start', utils.parseDate(swt.general[70]));
  date.element('end', utils.parseDate(swt.general[71]));

  // Tournament's location
  information.element('location').element('name', swt.general[66]);

  // Time controls
  var parsedTimeControls = utils.parseTimeControls(swt.general);
  if (parsedTimeControls !== null) {
    if (typeof parsedTimeControls === 'string') {
      // free text which couldn't get parsed
      information.element('time-controls', parsedTimeControls, { type: 'string'});
    }
    else if (Array.isArray(parsedTimeControls) && parsedTimeControls.length > 0) {
      // free text could get parsed into multiple periods
      var timeControls = information.element('time-controls');
      var period;
      parsedTimeControls.forEach(function(parsedPeriod, i) {
        if (typeof parsedPeriod === 'string') {
          period = timeControls.element('period', parsedPeriod, { number: i+1, type: 'string' });
        }
        else if (typeof parsedPeriod === 'object') {
          period = timeControls.element('period');
          period.attribute('number', (i+1).toString());

          if (parsedPeriod.moves) {
            period.element('moves', parsedPeriod.moves.toString());
          }

          if (parsedPeriod.time) {
            period.element('time', parsedPeriod.time.value.toString(), { unit: parsedPeriod.time.unit.toString() });
          }

          if (parsedPeriod.increment) {
            period.element('increment', parsedPeriod.increment.value.toString(), { unit: parsedPeriod.increment.unit.toString() });
          }
        }
      });
    }
  }

  // Organizers
  var organizers = concatFields(swt.general, [88]);
  if (organizers !== '') {
    information.element('organizers', { type: 'string'}, organizers.toString());
  }

  // Arbiters
  var arbiters = concatFields(swt.general, [67,85,86,87]);
  if (arbiters !== '') {
    information.element('arbiters', { type: 'string'}, arbiters.toString());
  }

  return type;
}


/**
 * Concatenate multiple fields by giving their field IDs and
 *   a concatenator.
 * @param  {Object} general Object of form { fieldID1: value1, fieldID2: value2, ... }
 * @param  {Array<Integer>} fields
 * @param  {String} by      Concatenator, by default ', '
 * @return {String}
 */
function concatFields(general, fields, by) {
  by = by || ', ';
  var ret = '';
  if (general[fields[0]].trim().length > 0) {
    ret += general[fields[0]].trim();
  }
  fields.slice(1).forEach(function(ix) {
    if (general[ix].trim().length > 0) {
      if (ret !== '')
        ret += ', ';
      ret += general[ix].trim();
    }    
  })
  return ret;
}
},{"./utils":8}],4:[function(require,module,exports){
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
},{}],5:[function(require,module,exports){
module.exports = addPlayers;

var utils = require('./utils');
var vereine = require('../vereine/vereine.json');


/**
 * Function to add all players to the Tournament XML.
 * @param {Object} swt  result from swtparser
 * @param {Object} tnmt XMLbuilder object for the Tournament
 * @return {Object} Object of relations between old and new IDs and teams an players
 */
function addPlayers(swt, tnmt) {
  if (!swt.players || swt.players.length === 0)
    return null;

  var players = tnmt.element('players');

  // sort players by their name first
  swt.players.forEach(setSortingName);
  swt.players.sort(function(a,b) {
    return a.sortingName.localeCompare(b.sortingName);
  });

  var ret = {
    byes: [],
    newId: {},
    newIdByHex: {},
    byTeam: {}  // { oldTeamNo1: [newPlayerId1, newPlayerId2, ...], oldTeamNo2: [...], ... }
  }

  var i = 1;
  swt.players.forEach(function(parsedPlayer) {
    if (parsedPlayer[2021] === 0) {
      // bye
      ret.byes.push(parsedPlayer[2020]);
      return;
    }

    ret.newId[parsedPlayer[2021]] = i;
    ret.newIdByHex[parsedPlayer[2020]] = i;

    var playerElement = players.element('player');
    playerElement.attribute('id', i);

    generatePlayer(parsedPlayer, playerElement);

    if (parsedPlayer[2016] && parsedPlayer[2017]) {
      var teamNo = parsedPlayer[2016];
      var position = parsedPlayer[2017];

      if (!ret.byTeam[teamNo]) ret.byTeam[teamNo] = [];
      ret.byTeam[teamNo][position-1] = i;
    }

    i++;
  });

  return ret;
}


/**
 * Set the .sortingName property which is used to sort all players.
 * @param {Object} parsedPlayer player of swtparser
 */
function setSortingName(parsedPlayer) {
  var sortingName = '';
  var name = utils.parseName(parsedPlayer[2000]);
  if (typeof name === 'string') {
    sortingName = name;
  }
  else if (typeof name === 'object') {
    if (name.surname && name.prename)
      sortingName = name.surname+','+name.prename;
    else if (name.surname && !name.prename)
      sortingName = name.surname;
    else if (name.prename && !name.surname)
      sortingName = name.prename;
  }

  parsedPlayer.sortingName = sortingName.toLowerCase();
}


/**
 * Generates a single player from a given SWT player object.
 * @param  {Object} parsed SWT player
 * @param {Object} playerElement XMLbuilder element for a single player
 */
function generatePlayer(parsed, playerElement) {
  // Player's name
  var name = utils.parseName(parsed[2000]);

  if (typeof name === 'string') {
    playerElement.element('name', name, { type: 'string' });
  }
  else if (typeof name === 'object' && name !== null) {
    var nameElement = playerElement.element('name');
    if (name.prename) {
      nameElement.element('prename', name.prename);
    }

    if (name.surname) {
      nameElement.element('surname', name.surname);
    }

    if (name.academicTitle) {
      nameElement.element('academic-title', name.academicTitle);
    }
  }
  else {
    // just use the free text name
    playerElement.element('name', parsed[2000], { type: 'string' });
  }

  // gender
  var gender = utils.parseGender(parsed[2013]);
  if (typeof gender === 'string') {
    playerElement.element('gender', gender);
  }

  // birth / birth year
  var birth = utils.parseBirthDate(parsed[2008]);
  if (typeof birth === 'string') {
    if (birth.length === 4) {
      // only birth year
      playerElement.element('birth-year', birth);
    }
    else {
      playerElement.element('birth', birth);
    }
  }

  // identifiers
  setIdentifiers(parsed, playerElement);

  // FIDE title
  var title = utils.parseTitle(parsed[2002]);
  if (typeof title === 'string') {
    playerElement.element('title', title);
  }

  // ratings
  setRatings(parsed, playerElement);
}


/**
 * Set the <identifiers> section of a player by the data exposed by
 *   the getIdentifiers() function.
 * @param {Object} parsed        swtparser player object
 * @param {Object} playerElement XMLbuilder player element
 */
function setIdentifiers(parsed, playerElement) {
  var identifiersElement = null;
  var identifiers = parseIdentifiers(parsed);

  if (identifiers.FIDE && identifiers.FIDE.id) {
    if (!identifiersElement)
      identifiersElement = playerElement.element('identifiers');

    identifiersElement.element('fide').element('id', identifiers.FIDE.id);
  }

  if (identifiers.federation && identifiers.federation.code && identifiers.federation.code.length === 3) {
    if (!identifiersElement)
      identifiersElement = playerElement.element('identifiers');

    var federation = identifiersElement.element('federation');
    federation.attribute('code', identifiers.federation.code);
    if (identifiers.federation.id) {
      federation.element('id', identifiers.federation.id);
    }
  }

  if (identifiers.club && identifiers.club.name) {
    if (!identifiersElement)
      identifiersElement = playerElement.element('identifiers');

    var club = identifiersElement.element('club');
    club.element('name', identifiers.club.name);
    if (identifiers.club.id && identifiers.club.federation) {
      club.attribute('federation', identifiers.club.federation);
      club.element('id', identifiers.club.id);

      if (identifiers.club.memberId) {
        club.element('member-id', identifiers.club.memberId);
      }
    }
  }
}


/**
 * Get identifiers for a single Player.
 * @param  {Object} parsed
 * @return {Object}
 */
function parseIdentifiers(parsed) {
  /* Format:
  {
    FIDE: {
      id: '12915564'
    },
    federation: {
      code: 'GER',
      id: '87132801'
    },
    club: {
      federation: 'GER', // if it looks like German club identifier
      name: 'SC 1975 Oberursel',
      id: '19909',
      memberId: '012'
    }
  } */
  var identifiers = {};

  if (parsed[2033] && parsed[2033].trim().length > 0) {
    identifiers.FIDE = {
      id: parsed[2033].trim()
    };
  }

  if (parsed[2034] && parsed[2034].trim().length > 0) {
    // if PKZ set -> always federation 'GER'
    identifiers.federation = {
      code: 'GER',
      id: parsed[2034].trim()
    };
  } else if (parsed[2006] && parsed[2006].trim().length == 3) {
    // three letter country code
    identifiers.federation = {
      code: parsed[2006].trim()
    };
  }

  if (parsed[2010] && parsed[2010].trim().length > 0) {
    parsed[2010] = parsed[2010].trim();
    identifiers.club = {
      id: parsed[2010]
    };

    if (/^[0-9A-IK][0-9A-F]{2}[0-9]{2}$/.test(parsed[2010])) {
      // looks like German club identifier
      identifiers.club.federation = 'GER';

      if (vereine[identifiers.club.id])
        identifiers.club.name = vereine[identifiers.club.id].name;
    }
    else {
      // take team's name as club name
      identifiers.club.name = parsed[2001];
    }

    if (parsed[2011] && parsed[2011].trim().length > 0 && parsed[2011] !== '***') {
      identifiers.club.memberId = parsed[2011].trim();
    }
  }

  return identifiers;
}


/**
 * Set the rankings of a player.
 * @param {Object} parsed        swtparser player object
 * @param {Object} playerElement XMLbuilder player element
 */
function setRatings(parsed, playerElement) {
  if (typeof parsed !== 'object')
    return null;

  var ratingsElement = null;

  // Elo
  if (parsed[2003] && parsed[2003] >= 400 && parsed[2003] <= 3500) {
    if (!ratingsElement)
      ratingsElement = playerElement.element('ratings');

    ratingsElement.element('rating', parsed[2003].toString(), { type: 'Elo' });
  }

  // DWZ
  if (parsed[2004] && parsed[2004] >= 400 && parsed[2004] <= 3500) {
    if (!ratingsElement)
      ratingsElement = playerElement.element('ratings');

    ratingsElement.element('rating', parsed[2004].toString(), { type: 'DWZ' });
  }
}
},{"../vereine/vereine.json":23,"./utils":8}],6:[function(require,module,exports){
module.exports = setSettings;


/**
 * Set the Tournament's settings, e.g. everything that belongs in the
 *   /tournament/settings path.
 *   
 * @param {Object} swt  result from swtparser
 * @param {Object} tnmt XMLbuilder root element
 */
function setSettings(swt, tnmt) {
  swt.type = (swt.general['35'] === true ? 'team' : 'individual');

  var settings = tnmt.element('settings');

  [setGeneral, setRankings].forEach(function(func) {
    func(settings, swt);
  });
}


/**
 * Set the general settings of a Tournament, like number of rounds etc.
 * @param {Object} settings XMLbuilder node
 * @param {Object} swt      object returned by swtparser
 */
function setGeneral(settings, swt) {
  var type = swt.type;
  var general = settings.element('general');

  // number of rounds
  general.element('rounds', swt.general[1].toString());

  // games per round
  var gamesPerRound = parseInt(swt.general[32]);
  if (gamesPerRound < 1) gamesPerRound = 1;
  general.element('games-per-round', gamesPerRound.toString());

  // only in Team Tournament
  if (type === 'team') {
    // number of boards
    general.element('boards', swt.general[34].toString());

    // maximum number of team members
    if (parseInt(swt.general[77]) >= parseInt(swt.general[34]))
      general.element('team-members', parseInt(swt.general[77]).toString());
  }
}


function setPointsSystem(parentElement, swt, type) {
  type = type || swt.type;
  if (type === 'team')
    setTeamsPointsSystem(parentElement, swt);
  else if (type === 'individual')
    setIndividualsPointsSystem(parentElement, swt);
}

/**
 * Set the points system of a Individual Tournament.
 * @param {Object} parentElement XMLbuilder node
 * @param {Object} swt      object returned by swtparser
 * @param {Object} pointsSystem Object with the points for each result, see getTeamPointsSystem()
 * @param {String} name name of the new element
 */
function setIndividualsPointsSystem(parentElement, swt, pointsSystem, name) {
  var individualPoints = pointsSystem || getIndividualPointsSystem(swt.general);
  name = name || 'points-system';

  var individualsElement = parentElement.element(name);

  ['win','draw','loss'].forEach(function(result) {
    if (typeof individualPoints[result] === 'number') {
      individualsElement.element(result, individualPoints[result].toString());
    }
    else if (typeof individualPoints[result] === 'object') {
      // depending on color:
      if (individualPoints[result].hasOwnProperty('white')) {
        // both colors must be present
        if (parseFloat(individualPoints[result].white) === parseFloat(individualPoints[result].black)) {
          individualsElement.element(result, parseFloat(individualPoints[result].white).toString());
        } else {
          individualsElement.element(result, { color: 'white' }, parseFloat(individualPoints[result].white).toString());
          individualsElement.element(result, { color: 'black' }, parseFloat(individualPoints[result].black).toString());
        }
      }

      // depending on attribute:
      else if (individualPoints[result].hasOwnProperty('byDefault')) {
        if (parseFloat(individualPoints[result].byDefault) === parseFloat(individualPoints[result][''])) {
          individualsElement.element(result, parseFloat(individualPoints[result].byDefault).toString());
        } else {
          individualsElement.element(result, { attribute: 'by-default' }, parseFloat(individualPoints[result].byDefault).toString());
          individualsElement.element(result, parseFloat(individualPoints[result]['']).toString());
        }
      }
    }
  });
}


/**
 * Set the points system of a Team Tournament.
 * @param {Object} parentElement XMLbuilder node
 * @param {Object} swt      object returned by swtparser
 * @param {Object} pointsSystem Object with the points for each result, see getTeamPointsSystem()
 * @param {String} name name of the new element
 */
function setTeamsPointsSystem(parentElement, swt, pointsSystem, name) {
  var teamPoints = pointsSystem || getTeamPointsSystem(swt.general);
  name = name || 'points-system';

  var teamsElement = parentElement.element(name);
  teamsElement.attribute('win-mode', (swt.general[44] ? 'more than 50%' : 'more than opponent'));

  ['win','draw','loss'].forEach(function(result) {
    if (typeof teamPoints[result] === 'number') {
      teamsElement.element(result, teamPoints[result].toString());
    }
    else if (typeof teamPoints[result] === 'object') {
      // depending on attribute:
      if (teamPoints[result].hasOwnProperty('byDefault')) {
        if (parseFloat(teamPoints[result].byDefault) === parseFloat(teamPoints[result][''])) {
          teamsElement.element(result, parseFloat(teamPoints[result].byDefault).toString());
        } else {
          teamsElement.element(result, { attribute: 'by-default' }, parseFloat(teamPoints[result].byDefault).toString());
          teamsElement.element(result, parseFloat(teamPoints[result]['']).toString());
        }
      }
    }
  });
}


function setRankings(settings, swt) {
  var type = swt.type;
  var rankings = settings.element('rankings');

  if (type === 'team') {
    var teamsElement = rankings.element('teams');
    var teamsCriteriaElement = teamsElement.element('criteria');

    var i = 1;
    var criteria = getAdditionalCriteriaByMode(swt.general[31], 'team');
    criteria.map(function addCriterionElement(field) {
      return setSortCriterion(teamsCriteriaElement, swt, field, 'team');
    }).forEach(function setNumber(element) {
      if (element) {
        element.attribute('number', i.toString());
        i++;
      }
    });

    var individualsElement = rankings.element('individuals');
  }
  else {
    var individualsElement = rankings;
  }

  var individualsCriteriaElement = individualsElement.element('criteria');
  // set first criterion: individual points
  var pointsElement = individualsCriteriaElement.element('criterion')
                        .attribute('type', 'Points')
                        .attribute('number', '1');
  setIndividualsPointsSystem(pointsElement, swt);

  // set additional criteria
  var moreCriteria = getAdditionalCriteriaByMode(swt.general[31], 'individual');
  var i = 2;
  moreCriteria.map(function addCriterionElement(field) {
    return setSortCriterion(individualsCriteriaElement, swt, field, 'individual');
  }).forEach(function setNumber(element) {
    if (element) {
      element.attribute('number', i.toString());
      i++;
    }
  });
}

/**
 * Get an object with the points for win/draw/loss of an individual
 *   game, maybe depending on color and attribute.
 * @param  {Object} general SWT.general by swtparser
 * @return {Object}         Object of form { win: ..., draw: ..., loss: ... }
 */
function getIndividualPointsSystem(general) {
  if (general[81] === '81-0') {
    return {
      win: 1,
      draw: 0.5,
      loss: 0
    };
  }

  if (general[81] === '81-1') {
    return {
      win: 3,
      draw: 1,
      loss: 0
    };
  }

  if (general[81] === '81-2') {
    return {
      win: 3,
      draw: {
        white: 1,
        black: 1.5
      },
      loss: 0
    };
  }

  if (general[81] === '81-3') {
    return {
      win: {
        white: parseInt(general[169]),
        black: parseInt(general[170])
      },
      draw: {
        white: parseInt(general[171]),
        black: parseInt(general[172])
      },
      loss: {
        '': parseInt(general[173]),
        byDefault: parseInt(general[174])
      }
    };
  }
}


/**
 * Get an object with the points for win/draw/loss of a team
 *   match, maybe depending on color and attribute.
 * @param  {Object} general SWT.general by swtparser
 * @return {Object}         Object of form { win: ..., draw: ..., loss: ... }
 */
function getTeamPointsSystem(general) {
  if (general[82] === '82-0') {
    return {
      win: 2,
      draw: 1,
      loss: 0
    };
  }

  if (general[82] === '82-1') {
    return {
      win: 3,
      draw: 1,
      loss: 0
    };
  }

  if (general[82] === '82-2') {
    return {
      win: parseInt(general[175]),
      draw: parseInt(general[176]),
      loss: {
        '': parseInt(general[177]),
        byDefault: parseInt(general[178])
      }
    };
  }
}


function setSortCriterion(criteria, swt, field, type) {
  var general = swt.general;
  var swtCriterion = general[field];
  if (swtCriterion === '84-0')
    return false;

  cuts = Math.max(parseInt(general[5]), 0);
  var criterion = criteria.element('criterion');

  if (swtCriterion === '84-1') {
    criterion.attribute('type', 'Match-Points');
    // both points systems needed!
    var pointsSystemElement = criterion.element('points-system');
    setTeamsPointsSystem(pointsSystemElement, swt, getTeamPointsSystem(swt.general), 'teams');
    setIndividualsPointsSystem(pointsSystemElement, swt, getIndividualPointsSystem(swt.general), 'individuals');
  }
  else if (swtCriterion === '84-2') {
    criterion.attribute('type', 'Game-Points');
    setIndividualsPointsSystem(criterion, swt);
  }
  else if (swtCriterion === '84-3') {
    criterion.attribute('type', 'Buchholz');
    setPointsSystem(criterion, swt, type);
    if (cuts > 0)
      criterion.element('lowest-cuts', cuts.toString());
  }
  else if (swtCriterion === '84-4') {
    criterion.attribute('type', 'Progressive-Score');
    setPointsSystem(criterion, swt, type);
  }
  else if (swtCriterion === '84-5') {
    criterion.attribute('type', 'Sonneborn-Berger');
    setPointsSystem(criterion, swt, type);
  }
  else if (swtCriterion === '84-6') {
    criterion.attribute('type', 'Buchholz');
    setPointsSystem(criterion, swt, type);
    criterion.element('lowest-cuts', (1+cuts).toString());
    criterion.element('highest-cuts', '1');
  }
  else if (swtCriterion === '84-7') {
    criterion.attribute('type', 'Buchholz-Sum');
    setPointsSystem(criterion, swt, type);
    if (cuts > 0)
      criterion.element('lowest-cuts', cuts.toString());
  }
  else if (swtCriterion === '84-8') {
    criterion.attribute('type', 'Average-Rating');
    if (general[24] === '24-0') {
      setAverageRatingCriterion(criterion, general, ['Elo', 'DWZ'], parseFloat(general[45]), 'order');
    }
    else if (general[24] === '24-1') {
      setAverageRatingCriterion(criterion, general, ['DWZ', 'Elo'], parseFloat(general[45]), 'order');
    }
    else if (general[24] === '24-2') {
      setAverageRatingCriterion(criterion, general, ['Elo', 'DWZ'], parseFloat(general[45]), 'max');
    }
  }
  else if (swtCriterion === '84-9') {
    criterion.attribute('type', 'Rating-Performance');
  }
  else if (swtCriterion === '84-10') {
    criterion.attribute('type', 'Rating-Difference');
  }
  else if (swtCriterion === '84-11') {
    criterion.attribute('type', 'Points');
    setIndividualsPointsSystem(criterion, swt, { win: 3, draw: 1, loss: 0 });
  }
  else if (swtCriterion === '84-12') {
    criterion.attribute('type', 'Points');
    setIndividualsPointsSystem(criterion, swt, { win: 3, draw: { white: 1, black: 1.5 }, loss: 0 });
  }
  else if (swtCriterion === '84-15') {
    criterion.attribute('type', 'Wins');
    // TODO: What means "Win"? -- see "Match-Points"
  }


  return criterion;
}

function setAverageRatingCriterion(criterion, general, ratingTypes, onEmptyRating, get) {
  var ratingTypesElement = criterion.element('rating-types').attribute('get', get);
  var element, attributes;
  for (var i = 0; i < ratingTypes.length; i++) {
    if (get === 'order')
      attributes = { number: (i+1).toString() };
    element = ratingTypesElement.element('rating-type', attributes, ratingTypes[i]);
  }
  if (onEmptyRating > 0) {
    // use pseudo rating on empty
    ratingTypesElement.attribute('on-empty', onEmptyRating.toString());
  }
}


function getAdditionalCriteriaByMode(mode, type) {
  if (type === 'individual') {
    // excluding first criterion

    if (mode === '31-0') {
      // Swiss System
      return [43, 21];
    }
    if (mode === '31-1') {
      // Round-Robin
      return [180, 181];
    }
    if (mode === '31-2') {
      // KO.-Tournament
      return [];
    }
  }
  else if (type === 'team') {
    // including first criterion

    if (mode === '31-0') {
      // Swiss System
      return [36, 37, 38];
    }
    if (mode === '31-1') {
      // Round-Robin
      return [36, 182, 183];
    }
    if (mode === '31-2') {
      // KO.-Tournament
      return [];
    }
    if (mode === '31-3') {
      // Schevening System
      return [];
    }
  }

  return [];
}
},{}],7:[function(require,module,exports){
module.exports = addTeams;

var utils = require('./utils');


/**
 * Function to add all teams to the Tournament XML.
 * @param {Object} swt  result from swtparser
 * @param {Object} tnmt XMLbuilder object for the Tournament
 * @param {Object} relations result of addPlayers()
 */
function addTeams(swt, tnmt, relations) {
  if (!swt.teams || swt.teams.length === 0)
    return null;

  var teams = tnmt.element('teams');

  // sort teams by their name first
  swt.teams.forEach(setSortingName);
  swt.teams.sort(function(a,b) {
    return a.sortingName.localeCompare(b.sortingName);
  });

  var ret = {
    newId: {},
    newIdByHex: {},
    byPlayer: {},
    byes: []
  }

  var initialRanking = {};
  var i = 1;
  swt.teams.forEach(function(parsedTeam) {
    if (parsedTeam[1000] === 'spielfrei') {
      ret.byes.push(parsedTeam[1019]);
      return;
    }

    // set relations
    ret.newId[parsedTeam[1019]] = i;
    ret.newIdByHex[parsedTeam[1018]] = i;
    relations.players.byTeam[parsedTeam[1019]].forEach(function(newPlayerId) {
      ret.byPlayer[newPlayerId] = i;
    });

    // create new XMLbuilder team element
    var teamElement = teams.element('team');
    teamElement.attribute('id', i);
    generateTeam(parsedTeam, teamElement, relations);

    // set initial ranking position
    initialRanking[parsedTeam[1012]] = i;

    i++;
  });

  // // add initial rankings
  // var initialRankingElement = tnmt.element('rankings').element('initial');
  // for (var position in initialRanking) {
  //   initialRankingElement.element('team')
  //     .attribute('position', position.toString())
  //     .attribute('id', initialRanking[position].toString());
  // }

  return ret;
}


/**
 * Set the .sortingName property of a team which is used to sort the teams
 *   before being added.
 * @param {Object} parsedTeam swtparser team object
 */
function setSortingName(parsedTeam) {
  var sortingName = parsedTeam[1000].trim().toLowerCase();

  parsedTeam.sortingName = sortingName;
}


/**
 * Generates a single team from a given SWT team object.
 * @param  {Object} parsed SWT team
 * @param {Object} playerElement XMLbuilder element for a single team
 * @param {Object} relations Result of players.addPlayers()
 */
function generateTeam(parsed, teamElement, relations) {
  if (parsed[1000] === 'spielfrei')
    return;

  // Team's name
  teamElement.element('name', parsed[1000].trim());

  // players
  var players = teamElement.element('players');
  var oldId = parsed[1019];
  relations.players.byTeam[oldId].forEach(function(newPlayerId, position) {
    var player = players.element('player');
    player.attribute('position', position+1);
    player.attribute('id', newPlayerId);
  });
}
},{"./utils":8}],8:[function(require,module,exports){
var constants = {
  FIDEtitles: ['GM', 'IM', 'WGM', 'WIM', 'FM', 'WFM', 'CM'],
  genders: {
    male: ['m', 'male', 'männlich', 'maennlich'],
    female: ['f', 'w', 'female', 'weiblich']
  }
}


/**
 * Parse a free text date.
 * @param  {String} string Date to parse
 * @return {String}        Date of form 'YYYY-MM-DD'
 */
module.exports.parseDate = function(string) {
  if (/^[0-9]{1,2}\.[0-9]{1,2}\.([0-9]{2}|[0-9]{4})$/.test(string.trim())) {
    // german date
    var parts = string.trim().split(".");
    var year = parts[2];
    if (year.length == 2) {
      if (parseInt(year) > 50)
        year = "19"+year;
      else
        year = "20"+year;
    }
    var months = (parts[1].length == 2 ? parts[1] : "0"+parts[1]);
    var days = (parts[0].length == 2 ? parts[0] : "0"+parts[0]);
    return year+"-"+months+"-"+days;
  }

  return string;
}


/**
 * Extract the TimeControl information of a parsed SWT.
 * @param  {Object} general SWTparsed.general object
 * @return {String|Array|null}         String for single period, Array for multiples. null if nothing found.
 */
module.exports.parseTimeControls = function(general) {
  if (general[72].trim().length > 0) {
    if (general[73].trim().length > 0) {
      var periods = [];

      periods[0] = parsePeriod(general[72]);
      periods[1] = parsePeriod(general[73]);
      if (general[74].trim().length > 0)
        periods[2] = parsePeriod(general[74]);

      return periods;
    } else {
      return general[72].trim();
    }
  }
  return null;
}


/**
 * Extract the information of a single period given by string.
 * @param  {String} string
 * @return {Object|String|null}        Object if extracted. String if nothing found. Null in case of errors.
 */
var parsePeriod = module.exports.parsePeriod = function(string) {
  if (typeof string != 'string')
    return null;

  if (/^([1-9][0-9]*)'\/([1-9][0-9]*)\+([1-9][0-9]*)"$/.test(string)) {
    // form: 90'/40+30"
    var period = {
      time: {
        value: parseFloat(string.replace(/^([1-9][0-9]*)'\/([1-9][0-9]*)\+([1-9][0-9]*)"$/, '$1')),
        unit: 'minutes'
      },
      moves: parseInt(string.replace(/^([1-9][0-9]*)'\/([1-9][0-9]*)\+([1-9][0-9]*)"$/, '$2')),
      increment: {
        value: parseFloat(string.replace(/^([1-9][0-9]*)'\/([1-9][0-9]*)\+([1-9][0-9]*)"$/, '$3')),
        unit: 'seconds'
      }
    };

    return period;
  } else if (/^[1-9][0-9]*'\+[1-9][0-9]*"$/.test(string)) {
    // form: 30'+30"
    var period = {
      time: {
        value: parseFloat(string.replace(/^([1-9][0-9]*)'\+[1-9][0-9]*"$/, '$1')),
        unit: 'minutes'
      },
      increment: {
        value: parseFloat(string.replace(/^[1-9][0-9]*'\+([1-9][0-9]*)"$/, '$1')),
        unit: 'seconds'
      }
    };

    return period;
  }
  else if (/^[1-9][0-9]*\/[1-9][0-9]*m(in)?\s*\+\s*[1-9][0-9]*s(ec)?\/(m(ove)?|Zug)$/.test(string)) {
    // forms: 40/90min + 30s/move
    //        40/90m+30s/move
    //        40/90m+30s/Zug
    //        40/90m +30s/m
    //        40/90m+ 30sec/m
    //        (and variations)
    var period = {
      time: {
        value: parseFloat(string.replace(/^[1-9][0-9]*\/([1-9][0-9]*)m(in)?\s*\+\s*[1-9][0-9]*s(ec)?\/(m(ove)?|Zug)$/, '$1')),
        unit: 'minutes'
      },
      moves: parseInt(string.replace(/^([1-9][0-9]*)\/[1-9][0-9]*m(in)?\s*\+\s*[1-9][0-9]*s(ec)?\/(m(ove)?|Zug)$/, '$1')),
      increment: {
        value: parseFloat(string.replace(/^[1-9][0-9]*\/[1-9][0-9]*m(in)?\s*\+\s*([1-9][0-9]*)s(ec)?\/(m(ove)?|Zug)$/, '$2')),
        unit: 'seconds'
      }
    };

    return period;
  }
  else if (/^[Rr]est\/[1-9][0-9]*m(in)?\s*\+\s*[1-9][0-9]*s(ec)?\/(m(ove)?|Zug)$/.test(string)) {
    // forms: Rest/30min + 30s/move
    //        rest/30m+30sec/move
    //        rest/30m+30sec/Zug
    //        rest/30min +30sec/m
    var period = {
      time: {
        value: parseFloat(string.replace(/^[Rr]est\/([1-9][0-9]*)m(in)?\s*\+\s*[1-9][0-9]*s(ec)?\/(m(ove)?|Zug)$/, '$1')),
        unit: 'minutes'
      },
      increment: {
        value: parseFloat(string.replace(/^[Rr]est\/[1-9][0-9]*m(in)?\s*\+\s*([1-9][0-9]*)s(ec)?\/(m(ove)?|Zug)$/, '$2')),
        unit: 'seconds'
      }
    };

    return period;
  }

  return string;
}


/**
 * Convert a name provided as string into an object.
 * @param  {String} name
 * @return {Object}
 */
module.exports.parseName = function(name) {
  if (typeof name != 'string') {
    throw "Name must be a string.";
  }

  if (!/^[A-Za-z]/.test(name)) {
    // should begin with capital letter
    return name;
  }

  if (/^[^\s,]+$/.test(name)) {
    // string has neither space nor comma: "Prename"
    return {
      prename: name
    };
  }

  if (/[^,]+,[^,]+,[^,]+/.test(name)) {
    // exactly two commas: "Surname, Prename, Academic Title"
    var parts = name.split(',');
    return {
      prename: parts[1].trim(),
      surname: parts[0].trim(),
      academicTitle: parts[2].trim()
    }
  }

  if (/[^,]+,[^,]+/.test(name)) {
    // exactly one comma: "Surname, Prename"
    var parts = name.split(',');
    return {
      prename: parts[1].trim(),
      surname: parts[0].trim()
    }
  }

  // space separated: "Prename Prename Surname"
  // TODO: Do some magic foo for special abbreviations like "Prof. Dr. Peter Parker"
  var parts = name.trim().split(" ");
  return {
    prename: parts.slice(0, parts.length-1).join(" "),
    surname: parts.slice(-1)[0]
  };
}


/**
 * Check if valid FIDE title.
 * @param  {String} title
 * @return {String}
 */
module.exports.parseTitle = function(string) {
  if (typeof string !== 'string')
    return null;

  string = string.trim().toUpperCase();
  if (string.length === 0)
    return null;

  var found = constants.FIDEtitles.indexOf(string);
  if (found >= 0) {
    return constants.FIDEtitles[found];
  }

  return null;
}


/**
 * Parse gender of free text field.
 * @param  {String} string
 * @return {String}        One of "male" and "female"
 */
module.exports.parseGender = function(string) {
  if (typeof string !== 'string')
    return null;

  string = string.trim().toLowerCase();
  if (constants.genders.male.indexOf(string) >= 0)
    return 'male';
  if (constants.genders.female.indexOf(string) >= 0)
    return 'female';

  return null;
}


module.exports.parseBirthDate = function(string) {
  if (typeof string !== 'string')
    return null;

  string = string.trim().toLowerCase();

  if (!/^[0-9]+$/.test(string)) {
    return null;
  }

  if (string.length == 4) {
    // only year
    return string.trim();
  }
  if (string.length == 8) {
    return string.slice(0,4)+"-"+string.slice(4,6)+"-"+string.slice(6,8);
  }

  return null;
}
},{}],9:[function(require,module,exports){
// UTILITY
var util = require('util');
var Buffer = require("buffer").Buffer;
var pSlice = Array.prototype.slice;

function objectKeys(object) {
  if (Object.keys) return Object.keys(object);
  var result = [];
  for (var name in object) {
    if (Object.prototype.hasOwnProperty.call(object, name)) {
      result.push(name);
    }
  }
  return result;
}

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.message = options.message;
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
};
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (value === undefined) {
    return '' + value;
  }
  if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (typeof value === 'function' || value instanceof RegExp) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (typeof s == 'string') {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

assert.AssertionError.prototype.toString = function() {
  if (this.message) {
    return [this.name + ':', this.message].join(' ');
  } else {
    return [
      this.name + ':',
      truncate(JSON.stringify(this.actual, replacer), 128),
      this.operator,
      truncate(JSON.stringify(this.expected, replacer), 128)
    ].join(' ');
  }
};

// assert.AssertionError instanceof Error

assert.AssertionError.__proto__ = Error.prototype;

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!!!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual == expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (expected instanceof RegExp) {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (typeof expected === 'string') {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail('Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail('Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

},{"buffer":14,"util":12}],10:[function(require,module,exports){
var process=require("__browserify_process");if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  if (arguments.length === 0) {
    this._events = {};
    return this;
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

},{"__browserify_process":16}],11:[function(require,module,exports){
// nothing to see here... no file methods for the browser

},{}],12:[function(require,module,exports){
var events = require('events');

exports.isArray = isArray;
exports.isDate = function(obj){return Object.prototype.toString.call(obj) === '[object Date]'};
exports.isRegExp = function(obj){return Object.prototype.toString.call(obj) === '[object RegExp]'};


exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

exports.inspect = function(obj, showHidden, depth, colors) {
  var seen = [];

  var stylize = function(str, styleType) {
    // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
    var styles =
        { 'bold' : [1, 22],
          'italic' : [3, 23],
          'underline' : [4, 24],
          'inverse' : [7, 27],
          'white' : [37, 39],
          'grey' : [90, 39],
          'black' : [30, 39],
          'blue' : [34, 39],
          'cyan' : [36, 39],
          'green' : [32, 39],
          'magenta' : [35, 39],
          'red' : [31, 39],
          'yellow' : [33, 39] };

    var style =
        { 'special': 'cyan',
          'number': 'blue',
          'boolean': 'yellow',
          'undefined': 'grey',
          'null': 'bold',
          'string': 'green',
          'date': 'magenta',
          // "name": intentionally not styling
          'regexp': 'red' }[styleType];

    if (style) {
      return '\033[' + styles[style][0] + 'm' + str +
             '\033[' + styles[style][1] + 'm';
    } else {
      return str;
    }
  };
  if (! colors) {
    stylize = function(str, styleType) { return str; };
  }

  function format(value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (value && typeof value.inspect === 'function' &&
        // Filter out the util module, it's inspect function is special
        value !== exports &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      return value.inspect(recurseTimes);
    }

    // Primitive types cannot have properties
    switch (typeof value) {
      case 'undefined':
        return stylize('undefined', 'undefined');

      case 'string':
        var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                                 .replace(/'/g, "\\'")
                                                 .replace(/\\"/g, '"') + '\'';
        return stylize(simple, 'string');

      case 'number':
        return stylize('' + value, 'number');

      case 'boolean':
        return stylize('' + value, 'boolean');
    }
    // For some reason typeof null is "object", so special case here.
    if (value === null) {
      return stylize('null', 'null');
    }

    // Look up the keys of the object.
    var visible_keys = Object_keys(value);
    var keys = showHidden ? Object_getOwnPropertyNames(value) : visible_keys;

    // Functions without properties can be shortcutted.
    if (typeof value === 'function' && keys.length === 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        var name = value.name ? ': ' + value.name : '';
        return stylize('[Function' + name + ']', 'special');
      }
    }

    // Dates without properties can be shortcutted
    if (isDate(value) && keys.length === 0) {
      return stylize(value.toUTCString(), 'date');
    }

    var base, type, braces;
    // Determine the object type
    if (isArray(value)) {
      type = 'Array';
      braces = ['[', ']'];
    } else {
      type = 'Object';
      braces = ['{', '}'];
    }

    // Make functions say that they are functions
    if (typeof value === 'function') {
      var n = value.name ? ': ' + value.name : '';
      base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
    } else {
      base = '';
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + value.toUTCString();
    }

    if (keys.length === 0) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        return stylize('[Object]', 'special');
      }
    }

    seen.push(value);

    var output = keys.map(function(key) {
      var name, str;
      if (value.__lookupGetter__) {
        if (value.__lookupGetter__(key)) {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Getter/Setter]', 'special');
          } else {
            str = stylize('[Getter]', 'special');
          }
        } else {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Setter]', 'special');
          }
        }
      }
      if (visible_keys.indexOf(key) < 0) {
        name = '[' + key + ']';
      }
      if (!str) {
        if (seen.indexOf(value[key]) < 0) {
          if (recurseTimes === null) {
            str = format(value[key]);
          } else {
            str = format(value[key], recurseTimes - 1);
          }
          if (str.indexOf('\n') > -1) {
            if (isArray(value)) {
              str = str.split('\n').map(function(line) {
                return '  ' + line;
              }).join('\n').substr(2);
            } else {
              str = '\n' + str.split('\n').map(function(line) {
                return '   ' + line;
              }).join('\n');
            }
          }
        } else {
          str = stylize('[Circular]', 'special');
        }
      }
      if (typeof name === 'undefined') {
        if (type === 'Array' && key.match(/^\d+$/)) {
          return str;
        }
        name = JSON.stringify('' + key);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
          name = name.substr(1, name.length - 2);
          name = stylize(name, 'name');
        } else {
          name = name.replace(/'/g, "\\'")
                     .replace(/\\"/g, '"')
                     .replace(/(^"|"$)/g, "'");
          name = stylize(name, 'string');
        }
      }

      return name + ': ' + str;
    });

    seen.pop();

    var numLinesEst = 0;
    var length = output.reduce(function(prev, cur) {
      numLinesEst++;
      if (cur.indexOf('\n') >= 0) numLinesEst++;
      return prev + cur.length + 1;
    }, 0);

    if (length > 50) {
      output = braces[0] +
               (base === '' ? '' : base + '\n ') +
               ' ' +
               output.join(',\n  ') +
               ' ' +
               braces[1];

    } else {
      output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
    }

    return output;
  }
  return format(obj, (typeof depth === 'undefined' ? 2 : depth));
};


function isArray(ar) {
  return ar instanceof Array ||
         Array.isArray(ar) ||
         (ar && ar !== Object.prototype && isArray(ar.__proto__));
}


function isRegExp(re) {
  return re instanceof RegExp ||
    (typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]');
}


function isDate(d) {
  if (d instanceof Date) return true;
  if (typeof d !== 'object') return false;
  var properties = Date.prototype && Object_getOwnPropertyNames(Date.prototype);
  var proto = d.__proto__ && Object_getOwnPropertyNames(d.__proto__);
  return JSON.stringify(proto) === JSON.stringify(properties);
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    // from es5-shim
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(exports.inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for(var x = args[i]; i < len; x = args[++i]){
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + exports.inspect(x);
    }
  }
  return str;
};

},{"events":10}],13:[function(require,module,exports){
exports.readIEEE754 = function(buffer, offset, isBE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isBE ? 0 : (nBytes - 1),
      d = isBE ? 1 : -1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.writeIEEE754 = function(buffer, value, offset, isBE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isBE ? (nBytes - 1) : 0,
      d = isBE ? -1 : 1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],14:[function(require,module,exports){
var assert = require('assert');
exports.Buffer = Buffer;
exports.SlowBuffer = Buffer;
Buffer.poolSize = 8192;
exports.INSPECT_MAX_BYTES = 50;

function Buffer(subject, encoding, offset) {
  if (!(this instanceof Buffer)) {
    return new Buffer(subject, encoding, offset);
  }
  this.parent = this;
  this.offset = 0;

  var type;

  // Are we slicing?
  if (typeof offset === 'number') {
    this.length = coerce(encoding);
    this.offset = offset;
  } else {
    // Find the length
    switch (type = typeof subject) {
      case 'number':
        this.length = coerce(subject);
        break;

      case 'string':
        this.length = Buffer.byteLength(subject, encoding);
        break;

      case 'object': // Assume object is an array
        this.length = coerce(subject.length);
        break;

      default:
        throw new Error('First argument needs to be a number, ' +
                        'array or string.');
    }

    // Treat array-ish objects as a byte array.
    if (isArrayIsh(subject)) {
      for (var i = 0; i < this.length; i++) {
        if (subject instanceof Buffer) {
          this[i] = subject.readUInt8(i);
        }
        else {
          this[i] = subject[i];
        }
      }
    } else if (type == 'string') {
      // We are a string
      this.length = this.write(subject, 0, encoding);
    } else if (type === 'number') {
      for (var i = 0; i < this.length; i++) {
        this[i] = 0;
      }
    }
  }
}

Buffer.prototype.get = function get(i) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this[i];
};

Buffer.prototype.set = function set(i, v) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this[i] = v;
};

Buffer.byteLength = function (str, encoding) {
  switch (encoding || "utf8") {
    case 'hex':
      return str.length / 2;

    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(str).length;

    case 'ascii':
    case 'binary':
      return str.length;

    case 'base64':
      return base64ToBytes(str).length;

    default:
      throw new Error('Unknown encoding');
  }
};

Buffer.prototype.utf8Write = function (string, offset, length) {
  var bytes, pos;
  return Buffer._charsWritten =  blitBuffer(utf8ToBytes(string), this, offset, length);
};

Buffer.prototype.asciiWrite = function (string, offset, length) {
  var bytes, pos;
  return Buffer._charsWritten =  blitBuffer(asciiToBytes(string), this, offset, length);
};

Buffer.prototype.binaryWrite = Buffer.prototype.asciiWrite;

Buffer.prototype.base64Write = function (string, offset, length) {
  var bytes, pos;
  return Buffer._charsWritten = blitBuffer(base64ToBytes(string), this, offset, length);
};

Buffer.prototype.base64Slice = function (start, end) {
  var bytes = Array.prototype.slice.apply(this, arguments)
  return require("base64-js").fromByteArray(bytes);
};

Buffer.prototype.utf8Slice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var res = "";
  var tmp = "";
  var i = 0;
  while (i < bytes.length) {
    if (bytes[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(bytes[i]);
      tmp = "";
    } else
      tmp += "%" + bytes[i].toString(16);

    i++;
  }

  return res + decodeUtf8Char(tmp);
}

Buffer.prototype.asciiSlice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var ret = "";
  for (var i = 0; i < bytes.length; i++)
    ret += String.fromCharCode(bytes[i]);
  return ret;
}

Buffer.prototype.binarySlice = Buffer.prototype.asciiSlice;

Buffer.prototype.inspect = function() {
  var out = [],
      len = this.length;
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i]);
    if (i == exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...';
      break;
    }
  }
  return '<Buffer ' + out.join(' ') + '>';
};


Buffer.prototype.hexSlice = function(start, end) {
  var len = this.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; i++) {
    out += toHex(this[i]);
  }
  return out;
};


Buffer.prototype.toString = function(encoding, start, end) {
  encoding = String(encoding || 'utf8').toLowerCase();
  start = +start || 0;
  if (typeof end == 'undefined') end = this.length;

  // Fastpath empty strings
  if (+end == start) {
    return '';
  }

  switch (encoding) {
    case 'hex':
      return this.hexSlice(start, end);

    case 'utf8':
    case 'utf-8':
      return this.utf8Slice(start, end);

    case 'ascii':
      return this.asciiSlice(start, end);

    case 'binary':
      return this.binarySlice(start, end);

    case 'base64':
      return this.base64Slice(start, end);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Slice(start, end);

    default:
      throw new Error('Unknown encoding');
  }
};


Buffer.prototype.hexWrite = function(string, offset, length) {
  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }

  // must be an even number of digits
  var strLen = string.length;
  if (strLen % 2) {
    throw new Error('Invalid hex string');
  }
  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(byte)) throw new Error('Invalid hex string');
    this[offset + i] = byte;
  }
  Buffer._charsWritten = i * 2;
  return i;
};


Buffer.prototype.write = function(string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length;
      length = undefined;
    }
  } else {  // legacy
    var swap = encoding;
    encoding = offset;
    offset = length;
    length = swap;
  }

  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase();

  switch (encoding) {
    case 'hex':
      return this.hexWrite(string, offset, length);

    case 'utf8':
    case 'utf-8':
      return this.utf8Write(string, offset, length);

    case 'ascii':
      return this.asciiWrite(string, offset, length);

    case 'binary':
      return this.binaryWrite(string, offset, length);

    case 'base64':
      return this.base64Write(string, offset, length);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Write(string, offset, length);

    default:
      throw new Error('Unknown encoding');
  }
};


// slice(start, end)
Buffer.prototype.slice = function(start, end) {
  if (end === undefined) end = this.length;

  if (end > this.length) {
    throw new Error('oob');
  }
  if (start > end) {
    throw new Error('oob');
  }

  return new Buffer(this, end - start, +start);
};

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function(target, target_start, start, end) {
  var source = this;
  start || (start = 0);
  if (end === undefined || isNaN(end)) {
    end = this.length;
  }
  target_start || (target_start = 0);

  if (end < start) throw new Error('sourceEnd < sourceStart');

  // Copy 0 bytes; we're done
  if (end === start) return 0;
  if (target.length == 0 || source.length == 0) return 0;

  if (target_start < 0 || target_start >= target.length) {
    throw new Error('targetStart out of bounds');
  }

  if (start < 0 || start >= source.length) {
    throw new Error('sourceStart out of bounds');
  }

  if (end < 0 || end > source.length) {
    throw new Error('sourceEnd out of bounds');
  }

  // Are we oob?
  if (end > this.length) {
    end = this.length;
  }

  if (target.length - target_start < end - start) {
    end = target.length - target_start + start;
  }

  var temp = [];
  for (var i=start; i<end; i++) {
    assert.ok(typeof this[i] !== 'undefined', "copying undefined buffer bytes!");
    temp.push(this[i]);
  }

  for (var i=target_start; i<target_start+temp.length; i++) {
    target[i] = temp[i-target_start];
  }
};

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill(value, start, end) {
  value || (value = 0);
  start || (start = 0);
  end || (end = this.length);

  if (typeof value === 'string') {
    value = value.charCodeAt(0);
  }
  if (!(typeof value === 'number') || isNaN(value)) {
    throw new Error('value is not a number');
  }

  if (end < start) throw new Error('end < start');

  // Fill 0 bytes; we're done
  if (end === start) return 0;
  if (this.length == 0) return 0;

  if (start < 0 || start >= this.length) {
    throw new Error('start out of bounds');
  }

  if (end < 0 || end > this.length) {
    throw new Error('end out of bounds');
  }

  for (var i = start; i < end; i++) {
    this[i] = value;
  }
}

// Static methods
Buffer.isBuffer = function isBuffer(b) {
  return b instanceof Buffer || b instanceof Buffer;
};

Buffer.concat = function (list, totalLength) {
  if (!isArray(list)) {
    throw new Error("Usage: Buffer.concat(list, [totalLength])\n \
      list should be an Array.");
  }

  if (list.length === 0) {
    return new Buffer(0);
  } else if (list.length === 1) {
    return list[0];
  }

  if (typeof totalLength !== 'number') {
    totalLength = 0;
    for (var i = 0; i < list.length; i++) {
      var buf = list[i];
      totalLength += buf.length;
    }
  }

  var buffer = new Buffer(totalLength);
  var pos = 0;
  for (var i = 0; i < list.length; i++) {
    var buf = list[i];
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer;
};

// helpers

function coerce(length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length);
  return length < 0 ? 0 : length;
}

function isArray(subject) {
  return (Array.isArray ||
    function(subject){
      return {}.toString.apply(subject) == '[object Array]'
    })
    (subject)
}

function isArrayIsh(subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
         subject && typeof subject === 'object' &&
         typeof subject.length === 'number';
}

function toHex(n) {
  if (n < 16) return '0' + n.toString(16);
  return n.toString(16);
}

function utf8ToBytes(str) {
  var byteArray = [];
  for (var i = 0; i < str.length; i++)
    if (str.charCodeAt(i) <= 0x7F)
      byteArray.push(str.charCodeAt(i));
    else {
      var h = encodeURIComponent(str.charAt(i)).substr(1).split('%');
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16));
    }

  return byteArray;
}

function asciiToBytes(str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++ )
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push( str.charCodeAt(i) & 0xFF );

  return byteArray;
}

function base64ToBytes(str) {
  return require("base64-js").toByteArray(str);
}

function blitBuffer(src, dst, offset, length) {
  var pos, i = 0;
  while (i < length) {
    if ((i+offset >= dst.length) || (i >= src.length))
      break;

    dst[i + offset] = src[i];
    i++;
  }
  return i;
}

function decodeUtf8Char(str) {
  try {
    return decodeURIComponent(str);
  } catch (err) {
    return String.fromCharCode(0xFFFD); // UTF 8 invalid char
  }
}

// read/write bit-twiddling

Buffer.prototype.readUInt8 = function(offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return;

  return buffer[offset];
};

function readUInt16(buffer, offset, isBigEndian, noAssert) {
  var val = 0;


  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return 0;

  if (isBigEndian) {
    val = buffer[offset] << 8;
    if (offset + 1 < buffer.length) {
      val |= buffer[offset + 1];
    }
  } else {
    val = buffer[offset];
    if (offset + 1 < buffer.length) {
      val |= buffer[offset + 1] << 8;
    }
  }

  return val;
}

Buffer.prototype.readUInt16LE = function(offset, noAssert) {
  return readUInt16(this, offset, false, noAssert);
};

Buffer.prototype.readUInt16BE = function(offset, noAssert) {
  return readUInt16(this, offset, true, noAssert);
};

function readUInt32(buffer, offset, isBigEndian, noAssert) {
  var val = 0;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return 0;

  if (isBigEndian) {
    if (offset + 1 < buffer.length)
      val = buffer[offset + 1] << 16;
    if (offset + 2 < buffer.length)
      val |= buffer[offset + 2] << 8;
    if (offset + 3 < buffer.length)
      val |= buffer[offset + 3];
    val = val + (buffer[offset] << 24 >>> 0);
  } else {
    if (offset + 2 < buffer.length)
      val = buffer[offset + 2] << 16;
    if (offset + 1 < buffer.length)
      val |= buffer[offset + 1] << 8;
    val |= buffer[offset];
    if (offset + 3 < buffer.length)
      val = val + (buffer[offset + 3] << 24 >>> 0);
  }

  return val;
}

Buffer.prototype.readUInt32LE = function(offset, noAssert) {
  return readUInt32(this, offset, false, noAssert);
};

Buffer.prototype.readUInt32BE = function(offset, noAssert) {
  return readUInt32(this, offset, true, noAssert);
};


/*
 * Signed integer types, yay team! A reminder on how two's complement actually
 * works. The first bit is the signed bit, i.e. tells us whether or not the
 * number should be positive or negative. If the two's complement value is
 * positive, then we're done, as it's equivalent to the unsigned representation.
 *
 * Now if the number is positive, you're pretty much done, you can just leverage
 * the unsigned translations and return those. Unfortunately, negative numbers
 * aren't quite that straightforward.
 *
 * At first glance, one might be inclined to use the traditional formula to
 * translate binary numbers between the positive and negative values in two's
 * complement. (Though it doesn't quite work for the most negative value)
 * Mainly:
 *  - invert all the bits
 *  - add one to the result
 *
 * Of course, this doesn't quite work in Javascript. Take for example the value
 * of -128. This could be represented in 16 bits (big-endian) as 0xff80. But of
 * course, Javascript will do the following:
 *
 * > ~0xff80
 * -65409
 *
 * Whoh there, Javascript, that's not quite right. But wait, according to
 * Javascript that's perfectly correct. When Javascript ends up seeing the
 * constant 0xff80, it has no notion that it is actually a signed number. It
 * assumes that we've input the unsigned value 0xff80. Thus, when it does the
 * binary negation, it casts it into a signed value, (positive 0xff80). Then
 * when you perform binary negation on that, it turns it into a negative number.
 *
 * Instead, we're going to have to use the following general formula, that works
 * in a rather Javascript friendly way. I'm glad we don't support this kind of
 * weird numbering scheme in the kernel.
 *
 * (BIT-MAX - (unsigned)val + 1) * -1
 *
 * The astute observer, may think that this doesn't make sense for 8-bit numbers
 * (really it isn't necessary for them). However, when you get 16-bit numbers,
 * you do. Let's go back to our prior example and see how this will look:
 *
 * (0xffff - 0xff80 + 1) * -1
 * (0x007f + 1) * -1
 * (0x0080) * -1
 */
Buffer.prototype.readInt8 = function(offset, noAssert) {
  var buffer = this;
  var neg;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return;

  neg = buffer[offset] & 0x80;
  if (!neg) {
    return (buffer[offset]);
  }

  return ((0xff - buffer[offset] + 1) * -1);
};

function readInt16(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt16(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x8000;
  if (!neg) {
    return val;
  }

  return (0xffff - val + 1) * -1;
}

Buffer.prototype.readInt16LE = function(offset, noAssert) {
  return readInt16(this, offset, false, noAssert);
};

Buffer.prototype.readInt16BE = function(offset, noAssert) {
  return readInt16(this, offset, true, noAssert);
};

function readInt32(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt32(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x80000000;
  if (!neg) {
    return (val);
  }

  return (0xffffffff - val + 1) * -1;
}

Buffer.prototype.readInt32LE = function(offset, noAssert) {
  return readInt32(this, offset, false, noAssert);
};

Buffer.prototype.readInt32BE = function(offset, noAssert) {
  return readInt32(this, offset, true, noAssert);
};

function readFloat(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.readFloatLE = function(offset, noAssert) {
  return readFloat(this, offset, false, noAssert);
};

Buffer.prototype.readFloatBE = function(offset, noAssert) {
  return readFloat(this, offset, true, noAssert);
};

function readDouble(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 7 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.readDoubleLE = function(offset, noAssert) {
  return readDouble(this, offset, false, noAssert);
};

Buffer.prototype.readDoubleBE = function(offset, noAssert) {
  return readDouble(this, offset, true, noAssert);
};


/*
 * We have to make sure that the value is a valid integer. This means that it is
 * non-negative. It has no fractional component and that it does not exceed the
 * maximum allowed value.
 *
 *      value           The number to check for validity
 *
 *      max             The maximum value
 */
function verifuint(value, max) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value >= 0,
      'specified a negative value for writing an unsigned value');

  assert.ok(value <= max, 'value is larger than maximum value for type');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

Buffer.prototype.writeUInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xff);
  }

  if (offset < buffer.length) {
    buffer[offset] = value;
  }
};

function writeUInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffff);
  }

  for (var i = 0; i < Math.min(buffer.length - offset, 2); i++) {
    buffer[offset + i] =
        (value & (0xff << (8 * (isBigEndian ? 1 - i : i)))) >>>
            (isBigEndian ? 1 - i : i) * 8;
  }

}

Buffer.prototype.writeUInt16LE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt16BE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, true, noAssert);
};

function writeUInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffffffff);
  }

  for (var i = 0; i < Math.min(buffer.length - offset, 4); i++) {
    buffer[offset + i] =
        (value >>> (isBigEndian ? 3 - i : i) * 8) & 0xff;
  }
}

Buffer.prototype.writeUInt32LE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt32BE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, true, noAssert);
};


/*
 * We now move onto our friends in the signed number category. Unlike unsigned
 * numbers, we're going to have to worry a bit more about how we put values into
 * arrays. Since we are only worrying about signed 32-bit values, we're in
 * slightly better shape. Unfortunately, we really can't do our favorite binary
 * & in this system. It really seems to do the wrong thing. For example:
 *
 * > -32 & 0xff
 * 224
 *
 * What's happening above is really: 0xe0 & 0xff = 0xe0. However, the results of
 * this aren't treated as a signed number. Ultimately a bad thing.
 *
 * What we're going to want to do is basically create the unsigned equivalent of
 * our representation and pass that off to the wuint* functions. To do that
 * we're going to do the following:
 *
 *  - if the value is positive
 *      we can pass it directly off to the equivalent wuint
 *  - if the value is negative
 *      we do the following computation:
 *         mb + val + 1, where
 *         mb   is the maximum unsigned value in that byte size
 *         val  is the Javascript negative integer
 *
 *
 * As a concrete value, take -128. In signed 16 bits this would be 0xff80. If
 * you do out the computations:
 *
 * 0xffff - 128 + 1
 * 0xffff - 127
 * 0xff80
 *
 * You can then encode this value as the signed version. This is really rather
 * hacky, but it should work and get the job done which is our goal here.
 */

/*
 * A series of checks to make sure we actually have a signed 32-bit number
 */
function verifsint(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

function verifIEEE754(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');
}

Buffer.prototype.writeInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7f, -0x80);
  }

  if (value >= 0) {
    buffer.writeUInt8(value, offset, noAssert);
  } else {
    buffer.writeUInt8(0xff + value + 1, offset, noAssert);
  }
};

function writeInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fff, -0x8000);
  }

  if (value >= 0) {
    writeUInt16(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt16(buffer, 0xffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt16LE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt16BE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, true, noAssert);
};

function writeInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fffffff, -0x80000000);
  }

  if (value >= 0) {
    writeUInt32(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt32(buffer, 0xffffffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt32LE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt32BE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, true, noAssert);
};

function writeFloat(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.writeFloatLE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, false, noAssert);
};

Buffer.prototype.writeFloatBE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, true, noAssert);
};

function writeDouble(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 7 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.writeDoubleLE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, false, noAssert);
};

Buffer.prototype.writeDoubleBE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, true, noAssert);
};

},{"./buffer_ieee754":13,"assert":9,"base64-js":15}],15:[function(require,module,exports){
(function (exports) {
	'use strict';

	var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	function b64ToByteArray(b64) {
		var i, j, l, tmp, placeHolders, arr;
	
		if (b64.length % 4 > 0) {
			throw 'Invalid string. Length must be a multiple of 4';
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		placeHolders = b64.indexOf('=');
		placeHolders = placeHolders > 0 ? b64.length - placeHolders : 0;

		// base64 is 4/3 + up to two characters of the original data
		arr = [];//new Uint8Array(b64.length * 3 / 4 - placeHolders);

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length;

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (lookup.indexOf(b64[i]) << 18) | (lookup.indexOf(b64[i + 1]) << 12) | (lookup.indexOf(b64[i + 2]) << 6) | lookup.indexOf(b64[i + 3]);
			arr.push((tmp & 0xFF0000) >> 16);
			arr.push((tmp & 0xFF00) >> 8);
			arr.push(tmp & 0xFF);
		}

		if (placeHolders === 2) {
			tmp = (lookup.indexOf(b64[i]) << 2) | (lookup.indexOf(b64[i + 1]) >> 4);
			arr.push(tmp & 0xFF);
		} else if (placeHolders === 1) {
			tmp = (lookup.indexOf(b64[i]) << 10) | (lookup.indexOf(b64[i + 1]) << 4) | (lookup.indexOf(b64[i + 2]) >> 2);
			arr.push((tmp >> 8) & 0xFF);
			arr.push(tmp & 0xFF);
		}

		return arr;
	}

	function uint8ToBase64(uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length;

		function tripletToBase64 (num) {
			return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F];
		};

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
			output += tripletToBase64(temp);
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1];
				output += lookup[temp >> 2];
				output += lookup[(temp << 4) & 0x3F];
				output += '==';
				break;
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1]);
				output += lookup[temp >> 10];
				output += lookup[(temp >> 4) & 0x3F];
				output += lookup[(temp << 2) & 0x3F];
				output += '=';
				break;
		}

		return output;
	}

	module.exports.toByteArray = b64ToByteArray;
	module.exports.fromByteArray = uint8ToBase64;
}());

},{}],16:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],17:[function(require,module,exports){
module.exports = parseDataView;

var Structure = require('./structure.json');

function parseDataView(view, callback) {
  var tnmt = {
    players: [],
    pairings_players: []
  };

  // read general information
  tnmt.general = parseCard(view, 0, Structure.structures.general, Structure);
  
  // read players
  var playerOffset = parseInt(Structure.parameters['start:fixtures_players'])
                      + (tnmt.general[4] * tnmt.general[1] * parseInt(Structure.parameters['length:pairing']))
                      + (tnmt.general[80] * tnmt.general[1] * parseInt(Structure.parameters['length:pairing']));
  var player;
  for (var i = 0; i < tnmt.general[4]; i++, playerOffset += parseInt(Structure.parameters['length:player'])) {
    player = parseCard(view, playerOffset, Structure.structures.player, Structure);
    player.positionInSWT = i;
    tnmt.players.push(player);
  }

  // read players' pairings
  var playerPairingOffset = parseInt(Structure.parameters['start:fixtures_players']);
  var playerPairing;
  var orderedPlayers = getOrderedPlayers(tnmt);
  for (var i = 0; i < tnmt.general[1] * tnmt.general[4]; i++, playerPairingOffset += parseInt(Structure.parameters['length:pairing'])) {
    playerPairing = parseCard(view, playerPairingOffset, Structure.structures['individual-pairings'], Structure);
    playerPairing.player = orderedPlayers[Math.floor(i / tnmt.general[1])];
    playerPairing.round = i % tnmt.general[1] + 1;
    tnmt.pairings_players.push(playerPairing);
  }
  // delete dummy pairings
  tnmt.pairings_players = tnmt.pairings_players.filter(playerPairingFilter(tnmt));

  if (tnmt.general[35] === true) {
    // team tournament
    tnmt.teams = [];
    tnmt.pairings_teams = [];
    
    // read teams
    var teamOffset = parseInt(Structure.parameters['start:fixtures_players'])
                        + (tnmt.general[4] * tnmt.general[1] * parseInt(Structure.parameters['length:pairing']))
                        + (tnmt.general[80] * tnmt.general[1] * parseInt(Structure.parameters['length:pairing']))
                        + (tnmt.general[4] * parseInt(Structure.parameters['length:player']));
    var team;
    for (var i = 0; i < tnmt.general[80]; i++, teamOffset += parseInt(Structure.parameters['length:team'])) {
      team = parseCard(view, teamOffset, Structure.structures.team, Structure);
      team.positionInSWT = i;
      tnmt.teams.push(team);
    }

    // read teams' pairings
    var teamPairingOffset = parseInt(Structure.parameters['start:fixtures_players'])
                            + (tnmt.general[1] * tnmt.general[4] * parseInt(Structure.parameters['length:pairing']));
    var teamPairing;
    var orderedTeams = getOrderedTeams(tnmt);
    for (var i = 0; i < tnmt.general[1] * tnmt.general[80]; i++, teamPairingOffset += parseInt(Structure.parameters['length:pairing'])) {
      teamPairing = parseCard(view, teamPairingOffset, Structure.structures['team-pairings'], Structure);
      teamPairing.team = orderedTeams[Math.floor(i / tnmt.general[1])];
      teamPairing.round = i % tnmt.general['1'] + 1;
      tnmt.pairings_teams.push(teamPairing);
    }
    // delete dummy pairings
    tnmt.pairings_teams = tnmt.pairings_teams.filter(teamPairingFilter(tnmt));
  }


  callback(null, tnmt);
}


function parseCard(view, offset, structure, Structure) {
  var object = {};
  for (var field in structure) {
    if (structure[field].type === 'int' || structure[field].type === 'inb') {
      // int: little endian; inb: big endian
      var littleEndian = (structure[field].type === 'int');
      if (structure[field].hasOwnProperty('where')) {
        object[field] = view.getUint8(offset + structure[field].where);
      }
      else if (structure[field].hasOwnProperty('from') && structure[field].hasOwnProperty('to')) {
        var diff = structure[field].to - structure[field].from;
        if (diff === 0)
          object[field] = view.getInt8(offset + structure[field].from);
        else if (diff === 1)
          object[field] = view.getInt16(offset + structure[field].from, littleEndian);
        else if (diff === 2)
          object[field] = view.getInt32(offset + structure[field].from, littleEndian);
      }
    }
    else if (structure[field].type === 'boo') {
      if (structure[field].hasOwnProperty('where')) {
        object[field] = view.getUint8(offset + structure[field].where) === 255;
      }
    }
    else if (structure[field].type === 'asc') {
      if (structure[field].hasOwnProperty('from') && structure[field].hasOwnProperty('to')) {
        object[field] = getString(view, offset+structure[field].from, offset+structure[field].to);
      }
      else if (structure[field].hasOwnProperty('where')) {
        var pos = offset+structure[field].where;
        object[field] = getString(view, pos, pos);
      }
    }
    else if (structure[field].type === 'dat') {
      var days = 0;
      if (structure[field].hasOwnProperty('from') && structure[field].hasOwnProperty('to')) {
        if (structure[field].to === structure[field].from + 1) {
          days = view.getUint16(structure[field].from, true);
        }
      }
      if (days > 0) {
        var date = new Date('12/30/1899');
        date.setTime(date.getTime() + 1000*60*60*24*days);
        object[field] = date.toDateString();
      }
    }
    else if (structure[field].type === 'tim') {
      if (structure[field].hasOwnProperty('from') && structure[field].hasOwnProperty('to')) {
        if (structure[field].to === structure[field].from + 1) {
          var d = new Date();
          d.setHours(view.getUint8(structure[field].from));
          d.setMinutes(view.getUint8(structure[field].to));
          if (d.toTimeString().slice(0,5) !== '00:00')
            object[field] = d.toTimeString().slice(0,5);
        }
      }
    }
    else if (structure[field].type === 'bin') {
      if (structure[field].hasOwnProperty('where')) {
        var bin = view.getUint8(offset + structure[field].where).toString(16);
        if (bin.length == 1)
          bin = '0'+bin;
        object[field] = bin;
      }
      else if (structure[field].hasOwnProperty('from') && structure[field].hasOwnProperty('to')) {
        object[field] = '';
        for (var pos = structure[field].from; pos <= structure[field].to; pos++) {
          var bin = view.getUint8(offset + structure[field].where).toString(16);
          if (bin.length == 1)
            bin = '0'+bin;
          object[field] += bin;
        }
      }
    }
    else if (structure[field].type === 'sel' && structure[field].selection && Structure.selections.hasOwnProperty(structure[field].selection)) {
      if (structure[field].hasOwnProperty('where')) {
        var sel = view.getInt8(offset + structure[field].where).toString(16);
        if (sel.length == 1)
          sel = '0'+sel;
        sel = sel.toUpperCase();

        if (Structure.selections[structure[field].selection].hasOwnProperty(sel)) {
          object[field] = structure[field].selection+'-'+Structure.selections[structure[field].selection][sel];
        }
      }
    }

    if (Structure.types && Structure.types.hasOwnProperty(field)) {
      if (Structure.types[field] === 'int')
        object[field] = parseInt(object[field]);
    }
  }

  return object;
}


function getString(view, from, to) {
  value = '';
  for (var i = 0; i <= to-from; i++) {
    var char = view.getUint8(from + i);
    if (char === 0)
      break;
    value += String.fromCharCode(char);
  }
  return value;
}


/**
* Takes a tournament and returns the players in order of
* their occurences within the SWT.
*
* @param {Object} tournament object after parsing process
* @return {Array} of players
*/
function getOrderedPlayers(tnmt) {
  var res = [];
  for (var i = 0; i < tnmt.players.length; i++) {
    res[tnmt.players[i].positionInSWT] = tnmt.players[i]['2020'];
  }
  return res;
}


/**
* Takes a tournament and returns the teams in order of
* their occurences within the SWT.
*
* @param {Object} tournament object after parsing process
* @return {Array} of teams
*/
function getOrderedTeams(tnmt) {
  var res = [];
  for (var i = 0; i < tnmt.teams.length; i++) {
    res[tnmt.teams[i].positionInSWT] = tnmt.teams[i]['1018'];
  }
  return res;
}


/**
 * Filter function to remove dummy player pairings.
 * @param  {Object} pairing
 * @return {Boolean}         true -> valid pairing
 */
function playerPairingFilter(tnmt) {
  return function(pairing) {
    // board number too high?
    if (tnmt.general[35] && pairing[4006] > tnmt.general[34])
      return false;

    // no color set?
    if (pairing[4000] == '4000-0')
      return false;

    return true;
  }
}


/**
 * Filter function to remove dummy team pairings.
 * @param  {Object} pairing
 * @return {Boolean}         true -> valid pairing
 */
function teamPairingFilter(tnmt) {
  return function(pairing) {
    return pairing[3001] != '3001-0';
  }
}
},{"./structure.json":19}],18:[function(require,module,exports){
module.exports = parseSWT;
module.exports.fromDataView = fromDataView;
module.exports.fromFile = fromFile;
module.exports.fromBuffer = fromBuffer;

var fromDataView = require('./from-data-view');

function parseSWT(swt, callback) {
  if (typeof swt === 'object') {
    if (require('buffer').Buffer.isBuffer(swt)) {
      fromBuffer(swt, callback);
    }
    else if (swt instanceof DataView) {
      fromDataView(swt, callback);
    }
  }
  else if (typeof swt === 'string') {
    fromFile(swt, callback);
  }
}

function fromFile(filename, callback) {
  require('fs').readFile(filename, function(err, buffer) {
    if (err) return callback(err);
    fromBuffer(buffer, callback);
  });
}

function fromBuffer(buffer, callback) {
  var arrayBuffer = bufferToArrayBuffer(buffer);
  var view = new DataView(arrayBuffer);

  fromDataView(view, callback);
}

function bufferToArrayBuffer(buffer) {
  // see http://stackoverflow.com/questions/8609289/convert-a-binary-nodejs-buffer-to-javascript-arraybuffer
  var ab = new ArrayBuffer(buffer.length);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buffer.length; ++i) {
      view[i] = buffer[i];
  }
  return ab;
}
},{"./from-data-view":17,"buffer":14,"fs":11}],19:[function(require,module,exports){
module.exports={"parameters":{"length:pairing":"19","start:fixtures_players":"13384","length:player":"655","length:team":"655"},"structures":{"general":{"1":{"type":"int","where":1},"2":{"type":"int","where":3},"3":{"type":"int","where":5},"4":{"type":"int","where":7},"5":{"type":"int","where":9},"6":{"type":"int","where":11},"7":{"type":"int","where":175},"8":{"type":"boo","where":176},"9":{"type":"int","where":178},"10":{"type":"boo","where":180},"11":{"type":"asc","from":184,"to":202},"12":{"type":"asc","from":245,"to":304},"13":{"type":"int","where":305},"14":{"type":"boo","where":307},"15":{"type":"int","where":309},"16":{"type":"boo","where":311},"17":{"type":"asc","from":315,"to":329},"18":{"type":"asc","from":376,"to":436},"19":{"type":"int","where":568},"20":{"type":"int","where":570},"21":{"type":"sel","selection":84,"where":572},"22":{"type":"boo","where":574},"23":{"type":"boo","where":579},"24":{"type":"sel","selection":24,"where":582},"25":{"type":"int","where":585},"26":{"type":"int","where":586},"27":{"type":"boo","where":588},"28":{"type":"boo","where":589},"29":{"type":"boo","where":590},"30":{"type":"boo","where":593},"31":{"type":"sel","selection":31,"where":596},"32":{"type":"int","where":597},"33":{"type":"int","where":600},"34":{"type":"int","where":604},"35":{"type":"boo","where":606},"36":{"type":"sel","selection":84,"where":611},"37":{"type":"sel","selection":84,"where":613},"38":{"type":"sel","selection":84,"where":615},"39":{"type":"sel","selection":84,"where":617},"40":{"type":"sel","selection":84,"where":618},"41":{"type":"sel","selection":84,"where":619},"42":{"type":"sel","selection":84,"where":620},"43":{"type":"sel","selection":84,"where":621},"44":{"type":"boo","where":623},"45":{"type":"inb","from":626,"to":627},"46":{"type":"boo","where":632},"47":{"type":"int","where":636},"48":{"type":"bin","where":651},"49":{"type":"boo","where":652},"50":{"type":"sel","selection":84,"where":656},"51":{"type":"boo","where":657},"52":{"type":"sel","selection":52,"where":669},"53":{"type":"boo","where":686},"54":{"type":"boo","where":722},"55":{"type":"int","where":723},"56":{"type":"bin","where":777},"57":{"type":"bin","where":778},"58":{"type":"bin","where":779},"59":{"type":"bin","where":780},"60":{"type":"bin","where":784},"61":{"type":"sel","selection":61,"where":785},"62":{"type":"boo","where":786},"63":{"type":"boo","where":787},"64":{"type":"int","where":789},"65":{"type":"asc","from":790,"to":829},"66":{"type":"asc","from":831,"to":870},"67":{"type":"asc","from":872,"to":931},"68":{"type":"asc","from":933,"to":992},"69":{"type":"asc","from":994,"to":1053},"70":{"type":"asc","from":1055,"to":1074},"71":{"type":"asc","from":1076,"to":1095},"72":{"type":"asc","from":1097,"to":1116},"73":{"type":"asc","from":1118,"to":1137},"74":{"type":"asc","from":1139,"to":1159},"75":{"type":"int","where":1324},"76":{"type":"int","where":1326},"77":{"type":"int","where":1327},"78":{"type":"sel","selection":78,"where":1328},"79":{"type":"sel","selection":78,"where":1329},"80":{"type":"int","where":1332},"81":{"type":"sel","selection":81,"where":1336},"82":{"type":"sel","selection":82,"where":1338},"83":{"type":"boo","where":11444},"85":{"type":"asc","from":11847,"to":11906},"86":{"type":"asc","from":11908,"to":11967},"87":{"type":"asc","from":11969,"to":12028},"88":{"type":"asc","from":11786,"to":11845},"89":{"type":"dat","from":11457,"to":11458},"90":{"type":"tim","from":11459,"to":11460},"91":{"type":"dat","from":11461,"to":11462},"92":{"type":"tim","from":11463,"to":11464},"93":{"type":"dat","from":11465,"to":11466},"94":{"type":"tim","from":11467,"to":11468},"95":{"type":"dat","from":11469,"to":11470},"96":{"type":"tim","from":11471,"to":11472},"97":{"type":"dat","from":11473,"to":11474},"98":{"type":"tim","from":11475,"to":11476},"99":{"type":"dat","from":11477,"to":11478},"100":{"type":"tim","from":11479,"to":11480},"101":{"type":"dat","from":11481,"to":11482},"102":{"type":"tim","from":11483,"to":11484},"103":{"type":"dat","from":11485,"to":11486},"104":{"type":"tim","from":11487,"to":11488},"105":{"type":"dat","from":11489,"to":11490},"106":{"type":"tim","from":11491,"to":11492},"107":{"type":"dat","from":11493,"to":11494},"108":{"type":"tim","from":11495,"to":11496},"109":{"type":"dat","from":11497,"to":11498},"110":{"type":"tim","from":11499,"to":11500},"111":{"type":"dat","from":11501,"to":11502},"112":{"type":"tim","from":11503,"to":11504},"113":{"type":"dat","from":11505,"to":11506},"114":{"type":"tim","from":11507,"to":11508},"115":{"type":"dat","from":11509,"to":11510},"116":{"type":"tim","from":11511,"to":11512},"117":{"type":"dat","from":11513,"to":11514},"118":{"type":"tim","from":11515,"to":11516},"119":{"type":"dat","from":11517,"to":11518},"120":{"type":"tim","from":11519,"to":11520},"121":{"type":"dat","from":11521,"to":11522},"122":{"type":"tim","from":11523,"to":11524},"123":{"type":"dat","from":11525,"to":11526},"124":{"type":"tim","from":11527,"to":11528},"125":{"type":"dat","from":11529,"to":11530},"126":{"type":"tim","from":11531,"to":11532},"127":{"type":"dat","from":11533,"to":11534},"128":{"type":"tim","from":11535,"to":11536},"129":{"type":"dat","from":11537,"to":11538},"130":{"type":"tim","from":11539,"to":11540},"131":{"type":"dat","from":11541,"to":11542},"132":{"type":"tim","from":11543,"to":11544},"133":{"type":"dat","from":11545,"to":11546},"134":{"type":"tim","from":11547,"to":11548},"135":{"type":"dat","from":11549,"to":11550},"136":{"type":"tim","from":11551,"to":11552},"137":{"type":"dat","from":11553,"to":11554},"138":{"type":"tim","from":11555,"to":11556},"139":{"type":"dat","from":11557,"to":11558},"140":{"type":"tim","from":11559,"to":11560},"141":{"type":"dat","from":11561,"to":11562},"142":{"type":"tim","from":11563,"to":11564},"143":{"type":"dat","from":11565,"to":11566},"144":{"type":"tim","from":11567,"to":11568},"145":{"type":"dat","from":11569,"to":11570},"146":{"type":"tim","from":11571,"to":11572},"147":{"type":"dat","from":11573,"to":11574},"148":{"type":"tim","from":11575,"to":11576},"149":{"type":"dat","from":11577,"to":11578},"150":{"type":"tim","from":11579,"to":11580},"151":{"type":"dat","from":11581,"to":11582},"152":{"type":"tim","from":11583,"to":11584},"153":{"type":"dat","from":11585,"to":11586},"154":{"type":"tim","from":11587,"to":11588},"155":{"type":"dat","from":11589,"to":11590},"156":{"type":"tim","from":11591,"to":11592},"157":{"type":"dat","from":11593,"to":11594},"158":{"type":"tim","from":11595,"to":11596},"159":{"type":"dat","from":11597,"to":11598},"160":{"type":"tim","from":11599,"to":11600},"161":{"type":"dat","from":11601,"to":11602},"162":{"type":"tim","from":11603,"to":11604},"163":{"type":"dat","from":11605,"to":11606},"164":{"type":"tim","from":11607,"to":11608},"165":{"type":"dat","from":11609,"to":11610},"166":{"type":"tim","from":11611,"to":11612},"167":{"type":"dat","from":11613,"to":11614},"168":{"type":"tim","from":11615,"to":11616},"169":{"type":"int","where":5494},"170":{"type":"int","where":5496},"171":{"type":"int","where":5498},"172":{"type":"int","where":5500},"173":{"type":"int","where":5502},"174":{"type":"int","where":5506},"175":{"type":"int","where":5514},"176":{"type":"int","where":5518},"177":{"type":"int","where":5522},"178":{"type":"int","where":5526},"179":{"type":"boo","where":658},"180":{"type":"sel","selection":84,"where":622},"181":{"type":"sel","selection":84,"where":573},"182":{"type":"sel","selection":84,"where":614},"183":{"type":"sel","selection":84,"where":616},"9999":{"type":"inb","from":609,"to":610}},"individual-pairings":{"4000":{"type":"sel","selection":4000,"where":8},"4001":{"type":"bin","where":9},"4002":{"type":"sel","selection":4002,"where":11},"4003":{"type":"sel","selection":3004,"where":11},"4004":{"type":"int","where":13},"4005":{"type":"sel","selection":3006,"where":15},"4006":{"type":"int","where":18}},"player":{"2000":{"type":"asc","from":0,"to":31},"2001":{"type":"asc","from":33,"to":64},"2002":{"type":"asc","from":66,"to":68},"2003":{"type":"asc","from":70,"to":73},"2004":{"type":"asc","from":75,"to":78},"2005":{"type":"asc","from":90,"to":94},"2006":{"type":"asc","from":105,"to":107},"2007":{"type":"asc","from":109,"to":111},"2008":{"type":"asc","from":128,"to":137},"2009":{"type":"asc","where":151},"2010":{"type":"asc","from":153,"to":157},"2011":{"type":"asc","from":159,"to":162},"2012":{"type":"int","where":173},"2013":{"type":"asc","where":184},"2014":{"type":"asc","where":188},"2015":{"type":"asc","from":192,"to":194},"2016":{"type":"int","where":201},"2017":{"type":"int","where":203},"2018":{"type":"int","where":205},"2019":{"type":"int","where":209},"2020":{"type":"bin","where":217},"2021":{"type":"int","where":219},"2022":{"type":"int","where":221},"2023":{"type":"int","where":223},"2024":{"type":"int","where":225},"2025":{"type":"int","where":227},"2026":{"type":"int","where":229},"2027":{"type":"int","where":231},"2028":{"type":"bin","where":272},"2029":{"type":"int","where":273},"2030":{"type":"int","where":292},"2031":{"type":"int","where":296},"2032":{"type":"int","where":300},"2033":{"type":"asc","from":324,"to":335},"2034":{"type":"asc","from":337,"to":348},"2035":{"type":"asc","from":350,"to":389},"2036":{"type":"asc","from":391,"to":430},"2037":{"type":"asc","from":432,"to":471},"2038":{"type":"asc","from":473,"to":512}},"team-pairings":{"3000":{"type":"bin","from":0,"to":1},"3001":{"type":"sel","selection":3001,"where":8},"3002":{"type":"bin","where":9},"3003":{"type":"bin","where":10},"3004":{"type":"sel","selection":3004,"where":11},"3005":{"type":"int","where":13},"3006":{"type":"sel","selection":3006,"where":15},"3007":{"type":"bin","where":17},"3008":{"type":"int","where":18}},"team":{"1000":{"type":"asc","from":0,"to":31},"1001":{"type":"asc","from":70,"to":73},"1002":{"type":"asc","from":75,"to":78},"1003":{"type":"asc","from":80,"to":83},"1004":{"type":"asc","from":90,"to":94},"1005":{"type":"asc","from":105,"to":107},"1006":{"type":"asc","from":109,"to":111},"1007":{"type":"asc","from":128,"to":137},"1008":{"type":"asc","from":153,"to":157},"1009":{"type":"asc","where":184},"1010":{"type":"asc","where":188},"1011":{"type":"asc","from":192,"to":194},"1012":{"type":"int","where":201},"1013":{"type":"int","where":203},"1014":{"type":"int","where":205},"1015":{"type":"int","where":207},"1016":{"type":"int","where":213},"1017":{"type":"int","where":215},"1018":{"type":"bin","where":217},"1019":{"type":"int","where":219},"1020":{"type":"int","where":221},"1021":{"type":"int","where":223},"1022":{"type":"int","where":225},"1023":{"type":"int","where":227},"1024":{"type":"int","where":229},"1025":{"type":"int","where":231},"1026":{"type":"int","where":233},"1027":{"type":"int","where":235},"1028":{"type":"inb","from":237,"to":238},"1029":{"type":"int","where":241},"1030":{"type":"int","where":243},"1031":{"type":"bin","from":251,"to":252},"1032":{"type":"int","where":254},"1033":{"type":"bin","from":256,"to":257},"1034":{"type":"int","where":258},"1035":{"type":"bin","from":262,"to":263},"1036":{"type":"bin","where":272},"1037":{"type":"boo","where":273},"1038":{"type":"int","where":292},"1039":{"type":"int","where":296},"1040":{"type":"inb","from":300,"to":301},"1041":{"type":"int","where":308},"1042":{"type":"int","where":312},"1043":{"type":"asc","from":350,"to":389},"1044":{"type":"asc","from":391,"to":430},"1045":{"type":"asc","from":432,"to":471},"1046":{"type":"asc","from":473,"to":512}}},"selections":{"24":{"00":"0","01":"1","02":"2"},"31":{"00":"0","01":"1","02":"2","03":"3"},"52":{"00":"0","01":"1","02":"2","03":"3"},"61":{"00":"0","01":"1","02":"2","03":"3","04":"4"},"78":{"11":"1","21":"2","22":"3","01":"0"},"81":{"00":"0","01":"1","02":"2","03":"3"},"82":{"00":"0","01":"1","02":"2"},"84":{"10":"13","13":"14","00":"0","01":"1","02":"2","03":"3","04":"4","05":"5","06":"6","07":"7","08":"8","09":"9","0A":"10","0C":"11","0D":"12","0E":"15"},"3001":{"00":"0","01":"1","02":"3","03":"2","04":"4"},"3004":{"00":"0","01":"1","02":"2","03":"3","04":"4","05":"5","06":"6","07":"7","08":"8","09":"9","0A":"10","0B":"11","0C":"12","0D":"13","0E":"14","0F":"15"},"3006":{"11":"6","22":"4","33":"3","00":"0","01":"5","02":"1","03":"2"},"4000":{"00":"0","01":"1","02":"3","03":"2","04":"4"},"4002":{"00":"0","01":"1","02":"2","03":"3","04":"4","05":"5","06":"6","07":"7","08":"8","09":"9","0A":"10","0B":"11","0C":"12","0D":"13","0E":"14","0F":"15"}},"types":{"2003":"int","2004":"int"}}

},{}],20:[function(require,module,exports){
// Generated by CoffeeScript 1.3.3
(function() {
  var XMLBuilder, XMLFragment;

  XMLFragment = require('./XMLFragment');

  XMLBuilder = (function() {

    function XMLBuilder(name, xmldec, doctype) {
      var att, child, _ref;
      this.children = [];
      this.rootObject = null;
      if (this.is(name, 'Object')) {
        _ref = [name, xmldec], xmldec = _ref[0], doctype = _ref[1];
        name = null;
      }
      if (name != null) {
        name = '' + name || '';
        if (xmldec == null) {
          xmldec = {
            'version': '1.0'
          };
        }
      }
      if ((xmldec != null) && !(xmldec.version != null)) {
        throw new Error("Version number is required");
      }
      if (xmldec != null) {
        xmldec.version = '' + xmldec.version || '';
        if (!xmldec.version.match(/1\.[0-9]+/)) {
          throw new Error("Invalid version number: " + xmldec.version);
        }
        att = {
          version: xmldec.version
        };
        if (xmldec.encoding != null) {
          xmldec.encoding = '' + xmldec.encoding || '';
          if (!xmldec.encoding.match(/[A-Za-z](?:[A-Za-z0-9._-]|-)*/)) {
            throw new Error("Invalid encoding: " + xmldec.encoding);
          }
          att.encoding = xmldec.encoding;
        }
        if (xmldec.standalone != null) {
          att.standalone = xmldec.standalone ? "yes" : "no";
        }
        child = new XMLFragment(this, '?xml', att);
        this.children.push(child);
      }
      if (doctype != null) {
        att = {};
        if (name != null) {
          att.name = name;
        }
        if (doctype.ext != null) {
          doctype.ext = '' + doctype.ext || '';
          att.ext = doctype.ext;
        }
        child = new XMLFragment(this, '!DOCTYPE', att);
        this.children.push(child);
      }
      if (name != null) {
        this.begin(name);
      }
    }

    XMLBuilder.prototype.begin = function(name, xmldec, doctype) {
      var doc, root;
      if (!(name != null)) {
        throw new Error("Root element needs a name");
      }
      if (this.rootObject) {
        this.children = [];
        this.rootObject = null;
      }
      if (xmldec != null) {
        doc = new XMLBuilder(name, xmldec, doctype);
        return doc.root();
      }
      name = '' + name || '';
      root = new XMLFragment(this, name, {});
      root.isRoot = true;
      root.documentObject = this;
      this.children.push(root);
      this.rootObject = root;
      return root;
    };

    XMLBuilder.prototype.root = function() {
      return this.rootObject;
    };

    XMLBuilder.prototype.end = function(options) {
      return toString(options);
    };

    XMLBuilder.prototype.toString = function(options) {
      var child, r, _i, _len, _ref;
      r = '';
      _ref = this.children;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        child = _ref[_i];
        r += child.toString(options);
      }
      return r;
    };

    XMLBuilder.prototype.is = function(obj, type) {
      var clas;
      clas = Object.prototype.toString.call(obj).slice(8, -1);
      return (obj != null) && clas === type;
    };

    return XMLBuilder;

  })();

  module.exports = XMLBuilder;

}).call(this);

},{"./XMLFragment":21}],21:[function(require,module,exports){
// Generated by CoffeeScript 1.3.3
(function() {
  var XMLFragment,
    __hasProp = {}.hasOwnProperty;

  XMLFragment = (function() {

    function XMLFragment(parent, name, attributes, text) {
      this.isRoot = false;
      this.documentObject = null;
      this.parent = parent;
      this.name = name;
      this.attributes = attributes;
      this.value = text;
      this.children = [];
    }

    XMLFragment.prototype.element = function(name, attributes, text) {
      var child, key, val, _ref, _ref1;
      if (!(name != null)) {
        throw new Error("Missing element name");
      }
      name = '' + name || '';
      this.assertLegalChar(name);
      if (attributes == null) {
        attributes = {};
      }
      if (this.is(attributes, 'String') && this.is(text, 'Object')) {
        _ref = [text, attributes], attributes = _ref[0], text = _ref[1];
      } else if (this.is(attributes, 'String')) {
        _ref1 = [{}, attributes], attributes = _ref1[0], text = _ref1[1];
      }
      for (key in attributes) {
        if (!__hasProp.call(attributes, key)) continue;
        val = attributes[key];
        val = '' + val || '';
        attributes[key] = this.escape(val);
      }
      child = new XMLFragment(this, name, attributes);
      if (text != null) {
        text = '' + text || '';
        text = this.escape(text);
        this.assertLegalChar(text);
        child.raw(text);
      }
      this.children.push(child);
      return child;
    };

    XMLFragment.prototype.insertBefore = function(name, attributes, text) {
      var child, i, key, val, _ref, _ref1;
      if (this.isRoot) {
        throw new Error("Cannot insert elements at root level");
      }
      if (!(name != null)) {
        throw new Error("Missing element name");
      }
      name = '' + name || '';
      this.assertLegalChar(name);
      if (attributes == null) {
        attributes = {};
      }
      if (this.is(attributes, 'String') && this.is(text, 'Object')) {
        _ref = [text, attributes], attributes = _ref[0], text = _ref[1];
      } else if (this.is(attributes, 'String')) {
        _ref1 = [{}, attributes], attributes = _ref1[0], text = _ref1[1];
      }
      for (key in attributes) {
        if (!__hasProp.call(attributes, key)) continue;
        val = attributes[key];
        val = '' + val || '';
        attributes[key] = this.escape(val);
      }
      child = new XMLFragment(this.parent, name, attributes);
      if (text != null) {
        text = '' + text || '';
        text = this.escape(text);
        this.assertLegalChar(text);
        child.raw(text);
      }
      i = this.parent.children.indexOf(this);
      this.parent.children.splice(i, 0, child);
      return child;
    };

    XMLFragment.prototype.insertAfter = function(name, attributes, text) {
      var child, i, key, val, _ref, _ref1;
      if (this.isRoot) {
        throw new Error("Cannot insert elements at root level");
      }
      if (!(name != null)) {
        throw new Error("Missing element name");
      }
      name = '' + name || '';
      this.assertLegalChar(name);
      if (attributes == null) {
        attributes = {};
      }
      if (this.is(attributes, 'String') && this.is(text, 'Object')) {
        _ref = [text, attributes], attributes = _ref[0], text = _ref[1];
      } else if (this.is(attributes, 'String')) {
        _ref1 = [{}, attributes], attributes = _ref1[0], text = _ref1[1];
      }
      for (key in attributes) {
        if (!__hasProp.call(attributes, key)) continue;
        val = attributes[key];
        val = '' + val || '';
        attributes[key] = this.escape(val);
      }
      child = new XMLFragment(this.parent, name, attributes);
      if (text != null) {
        text = '' + text || '';
        text = this.escape(text);
        this.assertLegalChar(text);
        child.raw(text);
      }
      i = this.parent.children.indexOf(this);
      this.parent.children.splice(i + 1, 0, child);
      return child;
    };

    XMLFragment.prototype.remove = function() {
      var i, _ref;
      if (this.isRoot) {
        throw new Error("Cannot remove the root element");
      }
      i = this.parent.children.indexOf(this);
      [].splice.apply(this.parent.children, [i, i - i + 1].concat(_ref = [])), _ref;
      return this.parent;
    };

    XMLFragment.prototype.text = function(value) {
      var child;
      if (!(value != null)) {
        throw new Error("Missing element text");
      }
      value = '' + value || '';
      value = this.escape(value);
      this.assertLegalChar(value);
      child = new XMLFragment(this, '', {}, value);
      this.children.push(child);
      return this;
    };

    XMLFragment.prototype.cdata = function(value) {
      var child;
      if (!(value != null)) {
        throw new Error("Missing CDATA text");
      }
      value = '' + value || '';
      this.assertLegalChar(value);
      if (value.match(/]]>/)) {
        throw new Error("Invalid CDATA text: " + value);
      }
      child = new XMLFragment(this, '', {}, '<![CDATA[' + value + ']]>');
      this.children.push(child);
      return this;
    };

    XMLFragment.prototype.comment = function(value) {
      var child;
      if (!(value != null)) {
        throw new Error("Missing comment text");
      }
      value = '' + value || '';
      value = this.escape(value);
      this.assertLegalChar(value);
      if (value.match(/--/)) {
        throw new Error("Comment text cannot contain double-hypen: " + value);
      }
      child = new XMLFragment(this, '', {}, '<!-- ' + value + ' -->');
      this.children.push(child);
      return this;
    };

    XMLFragment.prototype.raw = function(value) {
      var child;
      if (!(value != null)) {
        throw new Error("Missing raw text");
      }
      value = '' + value || '';
      child = new XMLFragment(this, '', {}, value);
      this.children.push(child);
      return this;
    };

    XMLFragment.prototype.up = function() {
      if (this.isRoot) {
        throw new Error("This node has no parent. Use doc() if you need to get the document object.");
      }
      return this.parent;
    };

    XMLFragment.prototype.root = function() {
      var child;
      if (this.isRoot) {
        return this;
      }
      child = this.parent;
      while (!child.isRoot) {
        child = child.parent;
      }
      return child;
    };

    XMLFragment.prototype.document = function() {
      return this.root().documentObject;
    };

    XMLFragment.prototype.end = function(options) {
      return this.document().toString(options);
    };

    XMLFragment.prototype.prev = function() {
      var i;
      if (this.isRoot) {
        throw new Error("Root node has no siblings");
      }
      i = this.parent.children.indexOf(this);
      if (i < 1) {
        throw new Error("Already at the first node");
      }
      return this.parent.children[i - 1];
    };

    XMLFragment.prototype.next = function() {
      var i;
      if (this.isRoot) {
        throw new Error("Root node has no siblings");
      }
      i = this.parent.children.indexOf(this);
      if (i === -1 || i === this.parent.children.length - 1) {
        throw new Error("Already at the last node");
      }
      return this.parent.children[i + 1];
    };

    XMLFragment.prototype.clone = function(deep) {
      var clonedSelf;
      clonedSelf = new XMLFragment(this.parent, this.name, this.attributes, this.value);
      if (deep) {
        this.children.forEach(function(child) {
          var clonedChild;
          clonedChild = child.clone(deep);
          clonedChild.parent = clonedSelf;
          return clonedSelf.children.push(clonedChild);
        });
      }
      return clonedSelf;
    };

    XMLFragment.prototype.importXMLBuilder = function(xmlbuilder) {
      var clonedRoot;
      clonedRoot = xmlbuilder.root().clone(true);
      clonedRoot.parent = this;
      this.children.push(clonedRoot);
      clonedRoot.isRoot = false;
      return this;
    };

    XMLFragment.prototype.attribute = function(name, value) {
      var _ref;
      if (!(name != null)) {
        throw new Error("Missing attribute name");
      }
      if (!(value != null)) {
        throw new Error("Missing attribute value");
      }
      name = '' + name || '';
      value = '' + value || '';
      if ((_ref = this.attributes) == null) {
        this.attributes = {};
      }
      this.attributes[name] = this.escape(value);
      return this;
    };

    XMLFragment.prototype.removeAttribute = function(name) {
      if (!(name != null)) {
        throw new Error("Missing attribute name");
      }
      name = '' + name || '';
      delete this.attributes[name];
      return this;
    };

    XMLFragment.prototype.toString = function(options, level) {
      var attName, attValue, child, indent, newline, pretty, r, space, _i, _len, _ref, _ref1;
      pretty = (options != null) && options.pretty || false;
      indent = (options != null) && options.indent || '  ';
      newline = (options != null) && options.newline || '\n';
      level || (level = 0);
      space = new Array(level + 1).join(indent);
      r = '';
      if (pretty) {
        r += space;
      }
      if (!(this.value != null)) {
        r += '<' + this.name;
      } else {
        r += '' + this.value;
      }
      _ref = this.attributes;
      for (attName in _ref) {
        attValue = _ref[attName];
        if (this.name === '!DOCTYPE') {
          r += ' ' + attValue;
        } else {
          r += ' ' + attName + '="' + attValue + '"';
        }
      }
      if (this.children.length === 0) {
        if (!(this.value != null)) {
          r += this.name === '?xml' ? '?>' : this.name === '!DOCTYPE' ? '>' : '/>';
        }
        if (pretty) {
          r += newline;
        }
      } else if (pretty && this.children.length === 1 && this.children[0].value) {
        r += '>';
        r += this.children[0].value;
        r += '</' + this.name + '>';
        r += newline;
      } else {
        r += '>';
        if (pretty) {
          r += newline;
        }
        _ref1 = this.children;
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
          child = _ref1[_i];
          r += child.toString(options, level + 1);
        }
        if (pretty) {
          r += space;
        }
        r += '</' + this.name + '>';
        if (pretty) {
          r += newline;
        }
      }
      return r;
    };

    XMLFragment.prototype.escape = function(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
    };

    XMLFragment.prototype.assertLegalChar = function(str) {
      var chars, chr;
      chars = /[\u0000-\u0008\u000B-\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE-\uFFFF]/;
      chr = str.match(chars);
      if (chr) {
        throw new Error("Invalid character (" + chr + ") in string: " + str);
      }
    };

    XMLFragment.prototype.is = function(obj, type) {
      var clas;
      clas = Object.prototype.toString.call(obj).slice(8, -1);
      return (obj != null) && clas === type;
    };

    XMLFragment.prototype.ele = function(name, attributes, text) {
      return this.element(name, attributes, text);
    };

    XMLFragment.prototype.txt = function(value) {
      return this.text(value);
    };

    XMLFragment.prototype.dat = function(value) {
      return this.cdata(value);
    };

    XMLFragment.prototype.att = function(name, value) {
      return this.attribute(name, value);
    };

    XMLFragment.prototype.com = function(value) {
      return this.comment(value);
    };

    XMLFragment.prototype.doc = function() {
      return this.document();
    };

    XMLFragment.prototype.e = function(name, attributes, text) {
      return this.element(name, attributes, text);
    };

    XMLFragment.prototype.t = function(value) {
      return this.text(value);
    };

    XMLFragment.prototype.d = function(value) {
      return this.cdata(value);
    };

    XMLFragment.prototype.a = function(name, value) {
      return this.attribute(name, value);
    };

    XMLFragment.prototype.c = function(value) {
      return this.comment(value);
    };

    XMLFragment.prototype.r = function(value) {
      return this.raw(value);
    };

    XMLFragment.prototype.u = function() {
      return this.up();
    };

    return XMLFragment;

  })();

  module.exports = XMLFragment;

}).call(this);

},{}],22:[function(require,module,exports){
// Generated by CoffeeScript 1.3.3
(function() {
  var XMLBuilder;

  XMLBuilder = require('./XMLBuilder');

  module.exports.create = function(name, xmldec, doctype) {
    if (name != null) {
      return new XMLBuilder(name, xmldec, doctype).root();
    } else {
      return new XMLBuilder();
    }
  };

}).call(this);

},{"./XMLBuilder":20}],23:[function(require,module,exports){
module.exports={"10102":{"id":"10102","name":"SC 1934 Viernheim e.V."},"10103":{"id":"10103","name":"SK 1953 Friedrichsfeld"},"10104":{"id":"10104","name":"VLK Lampertheim"},"10106":{"id":"10106","name":"SK 1962 Ladenburg"},"10107":{"id":"10107","name":"SK Hemsbach"},"10109":{"id":"10109","name":"SSC Altlußheim"},"10110":{"id":"10110","name":"VSC Mannheim"},"10111":{"id":"10111","name":"SF 1946 Brühl"},"10112":{"id":"10112","name":"SK Großsachsen"},"10114":{"id":"10114","name":"SK Mannheim 1946 e.V."},"10115":{"id":"10115","name":"DJB Steuben Feudenheim"},"10117":{"id":"10117","name":"SV Hockenheim"},"10118":{"id":"10118","name":"SK Mannheim-Lindenhof 1865"},"10119":{"id":"10119","name":"SK 1960 Neckarhausen"},"10120":{"id":"10120","name":"SG Kurpfalz e.V."},"10121":{"id":"10121","name":"SC 1922 Ketsch"},"10122":{"id":"10122","name":"SC 1924 Lampertheim"},"10124":{"id":"10124","name":"SK 1945 Ilvesheim"},"10126":{"id":"10126","name":"SK Chaos Mannheim"},"10127":{"id":"10127","name":"SC 1914 Sandhofen-Waldhof"},"10128":{"id":"10128","name":"SC 65 Reilingen"},"10129":{"id":"10129","name":"SK Weinheim 1911 e.V."},"10137":{"id":"10137","name":"SK 1995 Laudenbach"},"10201":{"id":"10201","name":"SC 1964 Dielheim"},"10202":{"id":"10202","name":"SF Botvinnik Steinsfurt"},"10203":{"id":"10203","name":"SC 1949 Rohrbach-Boxberg"},"10206":{"id":"10206","name":"SF Rot 71"},"10207":{"id":"10207","name":"SC Eberbach"},"10209":{"id":"10209","name":"SF Heiligkreuzsteinach"},"10210":{"id":"10210","name":"SV 1947 Walldorf"},"10211":{"id":"10211","name":"SC 1926 Leimen"},"10213":{"id":"10213","name":"SK 69 Mühlhausen e.V."},"10214":{"id":"10214","name":"SC Eppingen"},"10215":{"id":"10215","name":"SABT TV Bammental"},"10216":{"id":"10216","name":"SC Gemmingen"},"10219":{"id":"10219","name":"SG Heidelberg-Kirchheim"},"10220":{"id":"10220","name":"SF Heidelberg"},"10222":{"id":"10222","name":"SC 1958 Malsch"},"10223":{"id":"10223","name":"TSV Germania 1900 Malschenberg"},"10225":{"id":"10225","name":"SK 1947 Sandhausen e.V."},"10227":{"id":"10227","name":"SC 1926 Wiesloch"},"10228":{"id":"10228","name":"SC Neckargemünd"},"10229":{"id":"10229","name":"SC Eppelheim e.V."},"10230":{"id":"10230","name":"SC Angelbachtal"},"10232":{"id":"10232","name":"SF 1982 Baiertal-Schatthausen"},"10233":{"id":"10233","name":"SF 1999 Hoffenheim"},"10234":{"id":"10234","name":"SF Siegelsbach"},"10235":{"id":"10235","name":"SK 1879 HD-Handschuhsheim"},"10236":{"id":"10236","name":"SC Makkabi Heidelberg"},"10301":{"id":"10301","name":"Mosbacher SC von 1931"},"10303":{"id":"10303","name":"SC 1975 Paimar"},"10304":{"id":"10304","name":"SK Tauberbischofsheim"},"10305":{"id":"10305","name":"SK 1948 Buchen-Walldürn"},"10306":{"id":"10306","name":"SF Bad Mergentheim"},"10307":{"id":"10307","name":"SF Adelsheim"},"10311":{"id":"10311","name":"BG Buchen"},"10401":{"id":"10401","name":"SK 1947 Sulzfeld"},"10402":{"id":"10402","name":"SF Kraichtal"},"10404":{"id":"10404","name":"SABT Post Südstadt Karlsruhe"},"10405":{"id":"10405","name":"SC Karlsdorf"},"10406":{"id":"10406","name":"SV Pfinztal e. V."},"10407":{"id":"10407","name":"SF Neureut 1953 e.V."},"10408":{"id":"10408","name":"SF Wiesental"},"10409":{"id":"10409","name":"SK Odenheim 1971"},"10410":{"id":"10410","name":"SC Bretten"},"10411":{"id":"10411","name":"SF Graben-Neudorf"},"10412":{"id":"10412","name":"SK Blankenloch 1947 e.V."},"10414":{"id":"10414","name":"SK 1929 Jöhlingen"},"10415":{"id":"10415","name":"SF Forst 1971"},"10417":{"id":"10417","name":"SF Karlsbad"},"10418":{"id":"10418","name":"SK Durlach"},"10419":{"id":"10419","name":"SC Rheinstetten 1947"},"10421":{"id":"10421","name":"SK 1926 Ettlingen"},"10422":{"id":"10422","name":"Karlsruher SF 1853"},"10423":{"id":"10423","name":"SC Untergrombach 46"},"10424":{"id":"10424","name":"SC Waldbronn"},"10427":{"id":"10427","name":"SF Eggenstein-Leopoldshafen"},"10428":{"id":"10428","name":"SF Hambrücken e.V."},"10430":{"id":"10430","name":"Schachfreunde Zeutern"},"10432":{"id":"10432","name":"SF Rochade Dettenheim"},"10433":{"id":"10433","name":"Schachfreunde Malsch"},"10434":{"id":"10434","name":"Slavija Karlsruhe"},"10439":{"id":"10439","name":"SC Oberhausen-Rheinhausen"},"10441":{"id":"10441","name":"SC uBu Karlsruhe"},"10442":{"id":"10442","name":"SSV Bruchsal"},"10501":{"id":"10501","name":"SK Neuhausen"},"10502":{"id":"10502","name":"SF Oberreichenbach 1995"},"10503":{"id":"10503","name":"SF 1954 Conweiler e.V."},"10504":{"id":"10504","name":"SC Pforzheim 1906"},"10507":{"id":"10507","name":"SK Keltern"},"10509":{"id":"10509","name":"SV Calw"},"10510":{"id":"10510","name":"SC 1948 Ersingen e.V."},"10511":{"id":"10511","name":"SABT TV Neuenbürg 1859"},"10512":{"id":"10512","name":"SC Mühlacker 1923 e.V."},"10513":{"id":"10513","name":"SF Birkenfeld"},"10515":{"id":"10515","name":"SK Eutingen"},"10516":{"id":"10516","name":"SK Ispringen"},"10517":{"id":"10517","name":"SV Ottenbronn"},"10520":{"id":"10520","name":"SK Ittersbach"},"10521":{"id":"10521","name":"SC Niefern-Öschelbronn"},"10522":{"id":"10522","name":"SF Illingen"},"10526":{"id":"10526","name":"SF Simmersfeld"},"10527":{"id":"10527","name":"SF Bad Herrenalb e.V."},"10602":{"id":"10602","name":"SF Hörden"},"10603":{"id":"10603","name":"SC Iffezheim"},"10604":{"id":"10604","name":"SC Durmersheim"},"10606":{"id":"10606","name":"SC Bühlertal"},"10608":{"id":"10608","name":"SK Ottenau"},"10609":{"id":"10609","name":"SK Gernsbach 1949"},"10610":{"id":"10610","name":"SC Gaggenau"},"10612":{"id":"10612","name":"SC Weitenung"},"10613":{"id":"10613","name":"SF Baden-Lichtental"},"10614":{"id":"10614","name":"OSG Baden-Baden"},"10616":{"id":"10616","name":"SC \" Röss'l\"  Muggensturm"},"10617":{"id":"10617","name":"SK Ötigheim"},"10619":{"id":"10619","name":"SC Rastatt"},"10620":{"id":"10620","name":"SF Sasbach e.V."},"10621":{"id":"10621","name":"SV Vimbuch"},"10622":{"id":"10622","name":"SG Rochade Kuppenheim 1979 e.V."},"10623":{"id":"10623","name":"SF Oos e.V."},"10624":{"id":"10624","name":"SC Ottenhöfen-Seebach"},"10701":{"id":"10701","name":"SK Lahr"},"10702":{"id":"10702","name":"SK Kehl"},"10703":{"id":"10703","name":"SK Randbauer Griesheim"},"10705":{"id":"10705","name":"SC Neumühl"},"10706":{"id":"10706","name":"SC Schwarz-Weiss Zell"},"10708":{"id":"10708","name":"SC Freibauer Hofstetten"},"10709":{"id":"10709","name":"SC Haslach von 1927"},"10711":{"id":"10711","name":"SF Oppenau e.V."},"10712":{"id":"10712","name":"SVG Offenburg"},"10713":{"id":"10713","name":"SK Oberkirch"},"10714":{"id":"10714","name":"SF Wolfach 1977"},"10715":{"id":"10715","name":"SC Hornberg"},"10716":{"id":"10716","name":"SK Appenweier"},"10717":{"id":"10717","name":"SC Brandeck-Turm Ohlsbach e.V."},"10718":{"id":"10718","name":"SK Seelbach e.V."},"10719":{"id":"10719","name":"SC Bohlsbach"},"10801":{"id":"10801","name":"SK Endingen"},"10805":{"id":"10805","name":"SF Ettenheim"},"10806":{"id":"10806","name":"SK Freiburg Zähringen 1887 e.V."},"10807":{"id":"10807","name":"SC Heitersheim"},"10809":{"id":"10809","name":"SK Bad Krozingen"},"10811":{"id":"10811","name":"SK Ebringen"},"10812":{"id":"10812","name":"SC Oberwinden 1957 e.V."},"10813":{"id":"10813","name":"SK Denzlingen"},"10814":{"id":"10814","name":"SF Schwarz-Weiß Merzhausen"},"10816":{"id":"10816","name":"SC Emmendingen 1937 e.V."},"10817":{"id":"10817","name":"SK Freiburg West 1967"},"10819":{"id":"10819","name":"SC Horben"},"10820":{"id":"10820","name":"SGEM Dreisamtal"},"10822":{"id":"10822","name":"SABT SV Münstertal"},"10823":{"id":"10823","name":"SK Sölden"},"10826":{"id":"10826","name":"SC Umkirch 1969"},"10827":{"id":"10827","name":"SC Waldkirch 1910 e.V."},"10828":{"id":"10828","name":"SC Simonswald"},"10830":{"id":"10830","name":"Schwarze Pumpe Freiburg"},"10832":{"id":"10832","name":"SK Freiburg-Wiehre 2000 e.V."},"10834":{"id":"10834","name":"SC Badenweiler"},"10835":{"id":"10835","name":"Schachfreunde Markgräflerland e.V."},"10904":{"id":"10904","name":"SC Laufenburg"},"10906":{"id":"10906","name":"SK Todtnau-Schönau"},"10908":{"id":"10908","name":"SK Rheinfelden"},"10909":{"id":"10909","name":"SG Schopfheim 1885"},"10911":{"id":"10911","name":"SGEM Waldshut-Tiengen"},"10912":{"id":"10912","name":"SC Dreiländereck"},"10913":{"id":"10913","name":"SC Brombach e.V."},"10914":{"id":"10914","name":"SC Bad Säckingen"},"10915":{"id":"10915","name":"SF Wutachtal"},"21102":{"id":"21102","name":"SK Freystadt"},"21103":{"id":"21103","name":"SK Neumarkt e.V."},"21104":{"id":"21104","name":"Blinden-SGr 1955 Nürnberg"},"21105":{"id":"21105","name":"Spvg Zabo-Eintracht Nürnberg e.V."},"21106":{"id":"21106","name":"SF Altenfurt"},"21109":{"id":"21109","name":"SC Noris-Tarrasch Nürnberg 1873 e.V."},"21110":{"id":"21110","name":"SK Nürnberg 1911 e.V."},"21112":{"id":"21112","name":"SW Nürnberg Süd e.V."},"21115":{"id":"21115","name":"SC Anderssen Nürnberg 1929 e.V."},"21116":{"id":"21116","name":"SC Mühlhof-Reichelsdorf e.V."},"21117":{"id":"21117","name":"SC Postbauer-Heng e.V"},"21118":{"id":"21118","name":"SK Schwabach 1907 e.V."},"21119":{"id":"21119","name":"SK Zirndorf e.V."},"21120":{"id":"21120","name":"SK Mögeldorf 1958"},"21125":{"id":"21125","name":"SGem Nürnberg 1978 e.V."},"21127":{"id":"21127","name":"SC Stein 1998 e.V."},"21131":{"id":"21131","name":"TSV Cadolzburg e.V."},"21201":{"id":"21201","name":"SG Siemens Erlangen e.V."},"21202":{"id":"21202","name":"SC Forchheim e.V."},"21205":{"id":"21205","name":"SGem 1882 Fürth"},"21206":{"id":"21206","name":"SF Fürth 1951 e.V."},"21207":{"id":"21207","name":"SK 1911 Herzogenaurach e.V."},"21208":{"id":"21208","name":"SK 1948 Langenzenn"},"21209":{"id":"21209","name":"SV Neustadt/Aisch 07"},"21211":{"id":"21211","name":"SV Puschendorf 1949 e.V."},"21212":{"id":"21212","name":"SC Uttenreuth e.V."},"21213":{"id":"21213","name":"TSV Kirchehrenbach"},"21214":{"id":"21214","name":"SV Bubenreuth e.V."},"21215":{"id":"21215","name":"SV Bammersdorf"},"21216":{"id":"21216","name":"SGem Eckental"},"21217":{"id":"21217","name":"TSV Neunkirchen"},"21219":{"id":"21219","name":"TSV Ebermannstadt e.V."},"21221":{"id":"21221","name":"ASV Möhrendorf Schachtreff"},"21222":{"id":"21222","name":"BSG Wöhrlhaus Erlangen"},"21223":{"id":"21223","name":"SF Wilhermsdorf e.V."},"21224":{"id":"21224","name":"FSV Großenseebach"},"21229":{"id":"21229","name":"Schachbrett Heroldsbach"},"21231":{"id":"21231","name":"SC Pottenstein e.V."},"21233":{"id":"21233","name":"SC Erlangen 48/88 e.V."},"21234":{"id":"21234","name":"Schachtreff Röttenbach e.V."},"21301":{"id":"21301","name":"SV Altensittenbach"},"21302":{"id":"21302","name":"SC Hersbruck"},"21303":{"id":"21303","name":"SV Lauf a.d.P."},"21304":{"id":"21304","name":"SC Ottensoos"},"21305":{"id":"21305","name":"SC Röthenbach/Pegnitz"},"21306":{"id":"21306","name":"SC Schnaittach"},"21308":{"id":"21308","name":"SC Vorra u.Umgebung e.V."},"21309":{"id":"21309","name":"TSV Velden 1923 e.V."},"21310":{"id":"21310","name":"SC Rupprechtstegen"},"21402":{"id":"21402","name":"TSG 1893 Ellingen e.V."},"21403":{"id":"21403","name":"FC Gunzenhausen 1910 e.V"},"21404":{"id":"21404","name":"SV Haundorf"},"21405":{"id":"21405","name":"Allersberger SC 2000 e.V."},"21406":{"id":"21406","name":"SC Markt Berolzheim-Wettel"},"21407":{"id":"21407","name":"Privatverein Roth e.V."},"21409":{"id":"21409","name":"SC 74 Treuchtlingen"},"21410":{"id":"21410","name":"TSV 1860 Weißenburg e.V."},"21411":{"id":"21411","name":"SAbt Wolframs-Eschenbach"},"21412":{"id":"21412","name":"SC Heideck-Hilpoltstein"},"21414":{"id":"21414","name":"SG Büchenbach/Roth e.V."},"21415":{"id":"21415","name":"SK Schwanstetten 79 e.V."},"21416":{"id":"21416","name":"FC Pleinfeld VfL"},"21501":{"id":"21501","name":"SC Ansbach 1855 e.V."},"21502":{"id":"21502","name":"SC Bad Windsheim 1920 e.V."},"21503":{"id":"21503","name":"SC Bechhofen 1923 e.V."},"21504":{"id":"21504","name":"SK Dinkelsbühl e.V."},"21505":{"id":"21505","name":"SC Feuchtwangen 1911 e.V."},"21506":{"id":"21506","name":"SC Heilsbronn 1951 e.V."},"21508":{"id":"21508","name":"SK Rothenburg e.V."},"21510":{"id":"21510","name":"SC Königsspringer Dombühl 1974 e.V."},"21511":{"id":"21511","name":"SC Wassertrüdingen e.V."},"21514":{"id":"21514","name":"SK Leutershausen"},"22001":{"id":"22001","name":"FC Bayern München e.V."},"22002":{"id":"22002","name":"SC Tarrasch 45 München"},"22005":{"id":"22005","name":"Blinden SC München"},"22006":{"id":"22006","name":"Stiftung BSW - Schachgruppe München"},"22007":{"id":"22007","name":"SF Dachau 1932 e.V."},"22009":{"id":"22009","name":"Schach-Club Vaterstetten"},"22010":{"id":"22010","name":"SF Deisenhofen"},"22015":{"id":"22015","name":"SC Haar 1931"},"22017":{"id":"22017","name":"SV Höhenkirchen"},"22019":{"id":"22019","name":"SC Ismaning"},"22021":{"id":"22021","name":"SC Lohhof 1950 e.V."},"22024":{"id":"22024","name":"SC Neuhausen 1908"},"22026":{"id":"22026","name":"SG Schwabing München Nord e.V."},"22028":{"id":"22028","name":"Schach-Union München e.V."},"22029":{"id":"22029","name":"FC Fasanerie-Nord e.V."},"22030":{"id":"22030","name":"1.Schachklub Neuperlach e.V."},"22031":{"id":"22031","name":"SC Sendling e.V."},"22032":{"id":"22032","name":"SK Siemens München"},"22036":{"id":"22036","name":"SC Trudering"},"22040":{"id":"22040","name":"SC Roter Turm Altstadt"},"22042":{"id":"22042","name":"SAbt SV Weiss-BL.Allianz"},"22043":{"id":"22043","name":"Münchener SC 1836 e.V."},"22045":{"id":"22045","name":"SC Pasing von 1948 e.V."},"22046":{"id":"22046","name":"Schachklub München Südost e.V."},"22047":{"id":"22047","name":"SC Karlsfeld"},"22051":{"id":"22051","name":"SC F.X.Meiller"},"22053":{"id":"22053","name":"Sportclub Eching"},"22054":{"id":"22054","name":"TSV Poing"},"22055":{"id":"22055","name":"TSV Forstenried e.V."},"22059":{"id":"22059","name":"SC Garching 1980 e.V."},"22060":{"id":"22060","name":"SC Stadtwerke Verkehrsb."},"22061":{"id":"22061","name":"SGem Aschheim/Feldkirchen/Kirchheim"},"22062":{"id":"22062","name":"Schachclub Unterhaching e.V."},"22064":{"id":"22064","name":"SK Markt Schwaben"},"22065":{"id":"22065","name":"MSA Zugzwang 82 e.V."},"22066":{"id":"22066","name":"TSV Solln Schachabteilung"},"22067":{"id":"22067","name":"SC Kirchseeon e.V."},"22073":{"id":"22073","name":"SV Schwarz-Weiß ARAG"},"23000":{"id":"23000","name":"Niederbayern"},"23001":{"id":"23001","name":"SC Bayerwald Regen/Zwiesel e.V."},"23002":{"id":"23002","name":"SC Castra Batava Passau"},"23003":{"id":"23003","name":"SV Deggendorf"},"23006":{"id":"23006","name":"TV Freyung"},"23008":{"id":"23008","name":"SK Landau-Dingolfing"},"23009":{"id":"23009","name":"SK Landshut"},"23011":{"id":"23011","name":"SC Adlkofen"},"23012":{"id":"23012","name":"SK Passau 1869"},"23015":{"id":"23015","name":"SC Straubing"},"23017":{"id":"23017","name":"SC Vilshofen"},"23018":{"id":"23018","name":"SC Sonnen 1986"},"23020":{"id":"23020","name":"DJK-SV Schaibing"},"23021":{"id":"23021","name":"SV Aham"},"23022":{"id":"23022","name":"ESK Plattling"},"23030":{"id":"23030","name":"TSV Ergoldsbach e.V."},"23031":{"id":"23031","name":"TV 1862 Geiselhöring"},"23033":{"id":"23033","name":"FC Ergolding 1932 e.V."},"23034":{"id":"23034","name":"ESV Pocking"},"23037":{"id":"23037","name":"SC Simbach e.V."},"23038":{"id":"23038","name":"TSV Aidenbach"},"23044":{"id":"23044","name":"DJK SF Haselbach"},"23046":{"id":"23046","name":"SC Grafenau"},"23047":{"id":"23047","name":"SV Röhrnbach e.V."},"23048":{"id":"23048","name":"TSV Kreuzberg"},"23049":{"id":"23049","name":"SC Ortenburg 1894 e.V."},"23050":{"id":"23050","name":"SC Osterhofen"},"23051":{"id":"23051","name":"SC Rottal"},"23053":{"id":"23053","name":"SC Gardez-Viechtach e.V."},"23054":{"id":"23054","name":"Schachfreunde Gotteszell"},"23055":{"id":"23055","name":"TSV Langquaid 1904 e.V."},"24101":{"id":"24101","name":"SK Abensberg"},"24102":{"id":"24102","name":"Schachclub Eichstätt 1921 e.V."},"24103":{"id":"24103","name":"SK Freising"},"24104":{"id":"24104","name":"MTV Ingolstadt"},"24105":{"id":"24105","name":"TSV Ingolstadt Nord"},"24106":{"id":"24106","name":"SK Ingolstadt"},"24109":{"id":"24109","name":"SC Moosburg 1956 e.V."},"24110":{"id":"24110","name":"SC Neustadt/Donau"},"24114":{"id":"24114","name":"TSV Mainburg"},"24115":{"id":"24115","name":"Schachklub 1872 im BSV Neuburg"},"24116":{"id":"24116","name":"TSV 1897 Kösching"},"24117":{"id":"24117","name":"Schachverein Hepberg"},"24119":{"id":"24119","name":"VfB Friedrichshofen SAbt"},"24120":{"id":"24120","name":"TSV Lenting"},"24121":{"id":"24121","name":"SV Wettstetten e.V."},"24127":{"id":"24127","name":"SC 1947 Beilngries"},"24128":{"id":"24128","name":"SV Ilmmünster"},"24129":{"id":"24129","name":"SV Haunwöhr SAbt"},"24130":{"id":"24130","name":"TSV Grossmehring"},"24132":{"id":"24132","name":"TSV Rohrbach"},"24133":{"id":"24133","name":"SC Kreut e.V."},"24135":{"id":"24135","name":"TV 1861 Ingolstadt"},"24136":{"id":"24136","name":"SV Weichering"},"24201":{"id":"24201","name":"SK Bad Aibling"},"24202":{"id":"24202","name":"SF Bad Reichenhall"},"24204":{"id":"24204","name":"PSV Dorfen"},"24205":{"id":"24205","name":"SK Freilassing"},"24206":{"id":"24206","name":"SU Hirschbichl"},"24207":{"id":"24207","name":"SC Pegasus Lohkirchen"},"24208":{"id":"24208","name":"SG Hausham"},"24209":{"id":"24209","name":"SK Kolbermoor"},"24211":{"id":"24211","name":"SK Bruckmühl e.V."},"24214":{"id":"24214","name":"SC Prien"},"24217":{"id":"24217","name":"SK Töging"},"24219":{"id":"24219","name":"TSV Trostberg"},"24220":{"id":"24220","name":"SC Waldkraiburg"},"24224":{"id":"24224","name":"SC Taufkirchen"},"24225":{"id":"24225","name":"SG Vogtareuth-Prutting"},"24227":{"id":"24227","name":"SK Wasserburg"},"24228":{"id":"24228","name":"TV Altötting 1864"},"24229":{"id":"24229","name":"Post-SV Rosenheim"},"24230":{"id":"24230","name":"ASV J'Adoube Grassau SAB"},"24231":{"id":"24231","name":"SGem Pang/Rosenheim"},"24232":{"id":"24232","name":"SF Brannenburg"},"24233":{"id":"24233","name":"SK Zorneding/Pöring"},"24234":{"id":"24234","name":"SG Traunstein/Traunreut e.V."},"24235":{"id":"24235","name":"SU Ebersberg-Grafing"},"24237":{"id":"24237","name":"RW Klettham SAB"},"24238":{"id":"24238","name":"SF Rosenheim e.V."},"24400":{"id":"24400","name":"Schachkreis Zugspitze"},"24402":{"id":"24402","name":"SC Eichenau"},"24404":{"id":"24404","name":"SAbt TuS Fürstenfeldbruck"},"24405":{"id":"24405","name":"SK Garmisch-Partenkirch."},"24406":{"id":"24406","name":"Gautinger SC"},"24407":{"id":"24407","name":"TSV Gilching-Argelsried"},"24408":{"id":"24408","name":"SC Gröbenzell"},"24409":{"id":"24409","name":"SC Hohenpeißenberg"},"24410":{"id":"24410","name":"TUS Holzkirchen"},"24411":{"id":"24411","name":"SC Lenggries"},"24412":{"id":"24412","name":"SC Miesbach"},"24413":{"id":"24413","name":"SC Mittenwald"},"24415":{"id":"24415","name":"SK Großweil"},"24416":{"id":"24416","name":"SF Olching"},"24417":{"id":"24417","name":"SC Peiting"},"24418":{"id":"24418","name":"SK Penzberg"},"24420":{"id":"24420","name":"SC Starnberg"},"24421":{"id":"24421","name":"TV Tegernsee"},"24422":{"id":"24422","name":"Turm Untermühlhausen"},"24423":{"id":"24423","name":"Schachklub Germering e. V."},"24425":{"id":"24425","name":"SC Wolfratshausen 1948 e.V."},"24426":{"id":"24426","name":"SC Neuaubing 1946 e.V."},"24427":{"id":"24427","name":"SK Weilheim"},"24428":{"id":"24428","name":"Schfr Puchheim"},"24430":{"id":"24430","name":"SC Ammersee"},"24431":{"id":"24431","name":"SK Gräfelfing"},"24432":{"id":"24432","name":"TuS Geretsried"},"24433":{"id":"24433","name":"TSV 1861 Oberammergau"},"24434":{"id":"24434","name":"Sportfr.Windach e.V.1923"},"24439":{"id":"24439","name":"SF Bad Tölz"},"24440":{"id":"24440","name":"SF Starnberger See e.V."},"25101":{"id":"25101","name":"SC 1868 Bamberg"},"25103":{"id":"25103","name":"PSV Bamberg"},"25104":{"id":"25104","name":"SV Memmelsdorf"},"25105":{"id":"25105","name":"TV 1890 Hallstadt"},"25107":{"id":"25107","name":"SC Höchstadt/Aisch"},"25108":{"id":"25108","name":"SC Zapfendorf"},"25109":{"id":"25109","name":"RMV Conc. Strullendorf"},"25111":{"id":"25111","name":"SV Walsdorf"},"25112":{"id":"25112","name":"TV Ebern"},"25113":{"id":"25113","name":"TSV Hirschaid"},"25114":{"id":"25114","name":"SC Hollfeld 1960 e.V."},"25200":{"id":"25200","name":"Kreisverband Bayreuth"},"25205":{"id":"25205","name":"TSV Kirchenlaibach"},"25208":{"id":"25208","name":"SC Waischenfeld"},"25210":{"id":"25210","name":"TSV Bindlach Aktionär-Schachabteilung"},"25300":{"id":"25300","name":"Kreisverband Hof"},"25301":{"id":"25301","name":"SK Helmbrechts"},"25302":{"id":"25302","name":"PTSV SK Hof 1892"},"25305":{"id":"25305","name":"FC Konradsreuth"},"25306":{"id":"25306","name":"SK Lehsten"},"25307":{"id":"25307","name":"SK Marktleugast"},"25309":{"id":"25309","name":"TV Reinersreuth"},"25310":{"id":"25310","name":"SK Presseck"},"25311":{"id":"25311","name":"ASV Rehau"},"25312":{"id":"25312","name":"SC Schwarzenbach"},"25313":{"id":"25313","name":"SpVgg Weißenstadt"},"25315":{"id":"25315","name":"SF Kirchenlamitz e.V."},"25316":{"id":"25316","name":"TuS 1868 Weißdorf"},"25317":{"id":"25317","name":"SK Stammbach"},"25318":{"id":"25318","name":"SF Bad Steben"},"25319":{"id":"25319","name":"SF 1984 Gefrees"},"25320":{"id":"25320","name":"ATSV Oberkotzau"},"25321":{"id":"25321","name":"TFSV Turm Bad Lobenstein e.V"},"25323":{"id":"25323","name":"SK 1907 Kulmbach"},"25401":{"id":"25401","name":"Coburger SV v. 1872 e.V."},"25402":{"id":"25402","name":"SC 1934 Ebersdorf e.V."},"25403":{"id":"25403","name":"VfB Einberg Rödental"},"25404":{"id":"25404","name":"TSV Mönchröden"},"25405":{"id":"25405","name":"SV Neustadt b. Coburg"},"25406":{"id":"25406","name":"TSV Oberlauter"},"25413":{"id":"25413","name":"SK Weidhausen 1989 e.V."},"25414":{"id":"25414","name":"SG 1951 Sonneberg"},"25415":{"id":"25415","name":"TSV Untersiemau"},"25502":{"id":"25502","name":"SK Marktredwitz"},"25503":{"id":"25503","name":"SK Mitterteich"},"25504":{"id":"25504","name":"TuS Mehlmeisel"},"25507":{"id":"25507","name":"SF Schönwald"},"25508":{"id":"25508","name":"SV Thiersheim"},"25509":{"id":"25509","name":"ATG Tröstau"},"25513":{"id":"25513","name":"1.FC Marktleuthen"},"25514":{"id":"25514","name":"SC Waldsassen"},"25515":{"id":"25515","name":"SF Witzlasreuth"},"25518":{"id":"25518","name":"SF Fichtelgebirge"},"25601":{"id":"25601","name":"SSV Burgkunstadt 1931"},"25602":{"id":"25602","name":"Kronacher SK 1882 e.V."},"25603":{"id":"25603","name":"SK Michelau"},"25604":{"id":"25604","name":"SK Mitwitz"},"25606":{"id":"25606","name":"FC Nordhalben"},"25607":{"id":"25607","name":"SC 1925 Stockheim"},"25609":{"id":"25609","name":"SC Steinwiesen"},"25610":{"id":"25610","name":"SV Seubelsdorf"},"25613":{"id":"25613","name":"TSV 1860 Tettau e.V."},"25615":{"id":"25615","name":"SF Windheim e.V."},"26001":{"id":"26001","name":"SK Kelheim 1920"},"26003":{"id":"26003","name":"Schachklub Weiden 1907"},"26004":{"id":"26004","name":"DJK-Regensburg Nord e.V."},"26005":{"id":"26005","name":"SG Siemens Amberg"},"26007":{"id":"26007","name":"Regensb. Turnerschaft"},"26008":{"id":"26008","name":"Schachfreunde Roding"},"26011":{"id":"26011","name":"SC Sulzbach-Rosenberg"},"26012":{"id":"26012","name":"SC Cham"},"26013":{"id":"26013","name":"TSV Wacker Neutraubling"},"26014":{"id":"26014","name":"SK Schwandorf"},"26015":{"id":"26015","name":"Schachclub Hirschau"},"26017":{"id":"26017","name":"TV 1899 Parsberg e.V."},"26019":{"id":"26019","name":"SV Loderhof 72 e.V."},"26020":{"id":"26020","name":"FC Mintraching"},"26021":{"id":"26021","name":"TSV Dietfurt/Altm. e.V."},"26024":{"id":"26024","name":"Schachclub Haselmühl"},"26026":{"id":"26026","name":"SC Tirschenreuth v. 1922"},"26027":{"id":"26027","name":"SV Saal/Donau e.V.SAbt"},"26030":{"id":"26030","name":"T.u.Sportgem.Laaber e.V."},"26031":{"id":"26031","name":"SC Furth im W./Waldmünch"},"26032":{"id":"26032","name":"TSV Kareth-Lappersdorf"},"26033":{"id":"26033","name":"SC Bad Kötzting e.V."},"26035":{"id":"26035","name":"Sportclub Sinzing e.V."},"26037":{"id":"26037","name":"SC Erbendorf 1946 e.V."},"26038":{"id":"26038","name":"SC Eulenspiegel Regensb."},"26040":{"id":"26040","name":"1.FC Schwarzenfeld e.V."},"26042":{"id":"26042","name":"SV Neustadt/Altenstadt"},"26044":{"id":"26044","name":"SC Windischeschenbach"},"26046":{"id":"26046","name":"Spvgg Hainsacker"},"26048":{"id":"26048","name":"SC Bavaria Regensb.1881"},"26049":{"id":"26049","name":"SF Luhe-Wildenau e.V."},"26052":{"id":"26052","name":"TSV Nittenau"},"26055":{"id":"26055","name":"TSV 1880 Schwandorf"},"26058":{"id":"26058","name":"TSV Oberviechtach"},"26062":{"id":"26062","name":"SV Nittendorf SAbt"},"26063":{"id":"26063","name":"ASV Burglengenfeld SAbt"},"26064":{"id":"26064","name":"Schachfreunde Tegernheim"},"27100":{"id":"27100","name":"Augsburg"},"27102":{"id":"27102","name":"Schachges. Augsburg 1873"},"27103":{"id":"27103","name":"BC Aichach"},"27105":{"id":"27105","name":"Schachklub Rochade Augsburg"},"27108":{"id":"27108","name":"SK 1908 Göggingen"},"27109":{"id":"27109","name":"SC Gersthofen"},"27110":{"id":"27110","name":"SAbt TSV Dasing"},"27111":{"id":"27111","name":"SAbt TSV Haunstetten"},"27112":{"id":"27112","name":"SC Inchenhofen"},"27113":{"id":"27113","name":"SK Kriegshaber"},"27114":{"id":"27114","name":"SK Kissing"},"27115":{"id":"27115","name":"SC Lechhausen"},"27116":{"id":"27116","name":"SK Mering"},"27119":{"id":"27119","name":"TSV Steppach, Abt. Schach"},"27120":{"id":"27120","name":"SV Thierhaupten"},"27121":{"id":"27121","name":"SK Caissa Augsburg"},"27125":{"id":"27125","name":"SK Keres-Augsburg 1980"},"27127":{"id":"27127","name":"Rainer SC"},"27128":{"id":"27128","name":"SC Friedberg im Gehörl. Sportverein"},"27129":{"id":"27129","name":"Schachfreunde Augsburg"},"27201":{"id":"27201","name":"SK Buchloe"},"27202":{"id":"27202","name":"SK Bobingen"},"27203":{"id":"27203","name":"SK Krumbach"},"27204":{"id":"27204","name":"SK Königsbrunn"},"27205":{"id":"27205","name":"SK Klosterlechfeld"},"27206":{"id":"27206","name":"TSV Landsberg 1882"},"27207":{"id":"27207","name":"TSV Mindelheim"},"27208":{"id":"27208","name":"SC Schwabmünchen"},"27209":{"id":"27209","name":"SC Türkheim/Bad Wörishofen"},"27211":{"id":"27211","name":"SV Stauden"},"27301":{"id":"27301","name":"SC Dillingen"},"27302":{"id":"27302","name":"SC Günzburg/Reisensburg"},"27303":{"id":"27303","name":"SC Lauingen 1925"},"27304":{"id":"27304","name":"SK 1926 Nördlingen-Ries"},"27307":{"id":"27307","name":"SC Bäumenheim"},"27308":{"id":"27308","name":"TSV Wemding 1892"},"27310":{"id":"27310","name":"VfL Leipheim 1898"},"27312":{"id":"27312","name":"Spgem Kötz/Ichenhausen"},"27313":{"id":"27313","name":"TSV Wertingen 1862 SAbt"},"27315":{"id":"27315","name":"FC 1920 Gundelfingen eV."},"27320":{"id":"27320","name":"SC Zusamspringer"},"27321":{"id":"27321","name":"Schachclub Burlafingen"},"27322":{"id":"27322","name":"EUROCOPTER SG Donauwörth e.V."},"27401":{"id":"27401","name":"SF Buchenberg"},"27404":{"id":"27404","name":"Schachklub Immenstadt"},"27406":{"id":"27406","name":"SC Kempten 1878"},"27407":{"id":"27407","name":"SK Marktoberdorf"},"27408":{"id":"27408","name":"SK Memmingen 1907"},"27409":{"id":"27409","name":"SK Obergünzburg"},"27412":{"id":"27412","name":"SC Sonthofen"},"27413":{"id":"27413","name":"SC Kaufbeuren"},"27414":{"id":"27414","name":"Post-SV Memmingen e.V."},"27416":{"id":"27416","name":"SF Bad Grönenbach"},"27418":{"id":"27418","name":"Schachverein Bernbeuren"},"27419":{"id":"27419","name":"Schachclub Dietmannsried"},"27421":{"id":"27421","name":"Schachklub Ottobeuren 2000 e.V."},"27422":{"id":"27422","name":"ASV Martinszell Abteilung Schach"},"28086":{"id":"28086","name":"SF Tarrasch Schernau 2011"},"28101":{"id":"28101","name":"SV 1965 Kleinheubach"},"28102":{"id":"28102","name":"SV Volkersbrunn"},"28109":{"id":"28109","name":"SK 1928 Mömbris"},"28113":{"id":"28113","name":"SK 1946 Obernburg"},"28114":{"id":"28114","name":"Schachfreunde Sailauf"},"28120":{"id":"28120","name":"SC Bessenbach 1974 e.V"},"28121":{"id":"28121","name":"SC 1926 Kahl"},"28127":{"id":"28127","name":"SC 1959 Obernau"},"28129":{"id":"28129","name":"SC-SF 1957 Stockstadt"},"28130":{"id":"28130","name":"TV-Großostheim 1900 e.V."},"28131":{"id":"28131","name":"TV Faulbach e.V. 1920"},"28135":{"id":"28135","name":"SC Alzenau"},"28138":{"id":"28138","name":"SC 1930 Großwelzheim"},"28139":{"id":"28139","name":"Schachclub Sulzbach"},"28148":{"id":"28148","name":"SK 1929 Mainaschaff"},"28151":{"id":"28151","name":"SK 1925 Großwallstadt"},"28168":{"id":"28168","name":"SK 1982 Klingenberg/Main"},"28176":{"id":"28176","name":"TuS 1863 Aschaffenb.Damm"},"28178":{"id":"28178","name":"Aschaffenburg- Schweinheim e.V."},"28180":{"id":"28180","name":"SC Gymnasium Amorbach"},"28181":{"id":"28181","name":"TSV Amorbach 1863 e.V."},"28224":{"id":"28224","name":"Spvgg 1946 e.V. Stetten"},"28233":{"id":"28233","name":"SF Burgsinn"},"28236":{"id":"28236","name":"SK 79 Arnstein"},"28237":{"id":"28237","name":"SC 1972 Himmelstadt e.V."},"28240":{"id":"28240","name":"SK Wertheim"},"28243":{"id":"28243","name":"SC SF Rieneck"},"28245":{"id":"28245","name":"ESV Gemünden"},"28247":{"id":"28247","name":"SK Lohr a.M."},"28252":{"id":"28252","name":"SV Germania Erlenbach"},"28259":{"id":"28259","name":"SV Neuendorf"},"28261":{"id":"28261","name":"TSV 1895 Karlburg e.V."},"28266":{"id":"28266","name":"SF Phalanx Zellingen"},"28267":{"id":"28267","name":"TSV Langenprozelten 1912"},"28279":{"id":"28279","name":"Germania Ruppertshütten"},"28283":{"id":"28283","name":"TSV Karlstadt"},"28303":{"id":"28303","name":"SC Maßbach 1951"},"28305":{"id":"28305","name":"SV Römershag e.V."},"28308":{"id":"28308","name":"SC Bad Königshofen 1957"},"28322":{"id":"28322","name":"TSV 1876 Bad Kissingen"},"28326":{"id":"28326","name":"SK 1933 Bad Neustadt"},"28350":{"id":"28350","name":"SC 1947 Bergrheinfeld"},"28353":{"id":"28353","name":"SF \"Zeiler Turm\""},"28358":{"id":"28358","name":"DJK Abersfeld"},"28360":{"id":"28360","name":"Spvgg.1933 Hambach e.V."},"28363":{"id":"28363","name":"SV Wildflecken"},"28365":{"id":"28365","name":"Dicker Turm Münnerstadt"},"28370":{"id":"28370","name":"SC Turm 82 Schweinfurt"},"28388":{"id":"28388","name":"Schachclub Knetzgau"},"28390":{"id":"28390","name":"Schachklub Schweinfurt 2000 e.V."},"28392":{"id":"28392","name":"TSV 1928 Trappstadt SAbt."},"28396":{"id":"28396","name":"SK Gerolzhofen"},"28402":{"id":"28402","name":"SV Würzburg von 1865 e.V."},"28404":{"id":"28404","name":"SC Unterdürrbach 1949"},"28406":{"id":"28406","name":"SC Kitzingen von 1905"},"28454":{"id":"28454","name":"SV Bergtheim"},"28462":{"id":"28462","name":"TSV Lengfeld 1876 e.V."},"28464":{"id":"28464","name":"Sportbund Versbach e.V."},"28475":{"id":"28475","name":"TSV Grombühl"},"28483":{"id":"28483","name":"VfR Burggrumbach 1948"},"28484":{"id":"28484","name":"TSV Erlabrunn"},"28491":{"id":"28491","name":"TSV 1869 e. V. Rottendorf"},"28495":{"id":"28495","name":"SC Prichsenstadt"},"30000":{"id":"30000","name":"Berliner Schachverband"},"30001":{"id":"30001","name":"BSG 1827 Eckbauer e.V."},"30002":{"id":"30002","name":"SC Kreuzberg e.V."},"30006":{"id":"30006","name":"Spandauer SV e.V."},"30007":{"id":"30007","name":"SG Lasker Steglitz-Wilmersdorf"},"30008":{"id":"30008","name":"Sfrd. Berlin 1903 e.V."},"30010":{"id":"30010","name":"SK Tempelhof 1931 e.V."},"30011":{"id":"30011","name":"SC Zitadelle Spandau 1977 e.V."},"30012":{"id":"30012","name":"SVG Läufer Reinickendorf e.V."},"30014":{"id":"30014","name":"SK König Tegel 1949 e.V."},"30015":{"id":"30015","name":"SK Zehlendorf e.V."},"30016":{"id":"30016","name":"BSC Rehberge 1945 e.V."},"30017":{"id":"30017","name":"SK CAISSA Hermsdorf-Frohnau"},"30018":{"id":"30018","name":"SF Siemensstadt"},"30019":{"id":"30019","name":"CFC Hertha 06 e.V."},"30020":{"id":"30020","name":"Schwarz-Weiß Neukölln e.V."},"30021":{"id":"30021","name":"SC Weisse Dame e.V."},"30024":{"id":"30024","name":"SK \"Dragojle Babic\""},"30025":{"id":"30025","name":"Berliner Gehörlosen SV"},"30027":{"id":"30027","name":"SC Schwarzer Springer Schmargendorf"},"30031":{"id":"30031","name":"SK Kroatische Gemeinde e.V."},"30033":{"id":"30033","name":"VfB Hermsdorf e.V."},"30035":{"id":"30035","name":"SV Königsjäger Süd-West e.V."},"30036":{"id":"30036","name":"SC Schwarz-Weiß Lichtenrade e.V."},"30037":{"id":"30037","name":"SC Freibauer Schöneberg"},"30040":{"id":"30040","name":"SF Friedrichshagen"},"30041":{"id":"30041","name":"SG Weißensee 49 e.V."},"30042":{"id":"30042","name":"SV Empor Berlin e.V."},"30044":{"id":"30044","name":"SSV Rotation Berlin e.V."},"30045":{"id":"30045","name":"SC Friesen Lichtenberg e.V."},"30047":{"id":"30047","name":"TSG Oberschöneweide e.V."},"30048":{"id":"30048","name":"SV Bau-Union e.V."},"30049":{"id":"30049","name":"Treptower SV 1949 e.V."},"30050":{"id":"30050","name":"Sfr.Nord-Ost Berlin"},"30052":{"id":"30052","name":"SV Berolina Mitte e.V."},"30054":{"id":"30054","name":"SV Motor Wildau e.V."},"30055":{"id":"30055","name":"SC Zugzwang 95 e.V."},"30056":{"id":"30056","name":"SG Eckturm"},"30058":{"id":"30058","name":"SV Berlin-Friedrichstadt"},"30059":{"id":"30059","name":"SV Turbine Berlin e.V."},"30060":{"id":"30060","name":"TSG Rot-Weiß Fredersdorf/Vogelsdorf e.V."},"30061":{"id":"30061","name":"SV Rot-Weiß Neuenhagen"},"30066":{"id":"30066","name":"SG Narva Berlin e.V."},"30068":{"id":"30068","name":"BSV 63 Chemie Weißensee"},"30069":{"id":"30069","name":"SC Rochade e.V."},"30071":{"id":"30071","name":"SC Borussia Friedrichsfelde 1920"},"30072":{"id":"30072","name":"SG Grün-Weiß Baumschulenweg e.V."},"30076":{"id":"30076","name":"SC Eintracht Berlin e.V."},"30079":{"id":"30079","name":"TuS Makkabi Berlin e.V."},"30080":{"id":"30080","name":"Schachgemeinschaft Wedding e.V."},"30082":{"id":"30082","name":"Queer-Springer SSV Berlin"},"30083":{"id":"30083","name":"TSV Marienfelde 1890 e.V."},"30084":{"id":"30084","name":"SC Rotation Pankow e.V."},"30085":{"id":"30085","name":"Schachpinguine Berlin e.V."},"30086":{"id":"30086","name":"SK International Berlin 2010"},"30087":{"id":"30087","name":"Schachunion Berlin e.V."},"40000":{"id":"40000","name":"Hamburger Schachverband"},"40002":{"id":"40002","name":"Schachklub Altona v.1873/Finkenwerder v."},"40003":{"id":"40003","name":"Barmbeker SK 1926 eV"},"40004":{"id":"40004","name":"Bergedorfer SV 1909 eV"},"40005":{"id":"40005","name":"Bergstedter SK von 1962"},"40006":{"id":"40006","name":"SAbt SV Billst.-Horn 91"},"40007":{"id":"40007","name":"SchVgg Blankenese von 1923 e.V."},"40008":{"id":"40008","name":"Bramfelder SK 1947 e.V."},"40009":{"id":"40009","name":"Hamburger SG BUE V1906eV"},"40010":{"id":"40010","name":"SK Caissa Rahlstedt von 1965 e.V."},"40011":{"id":"40011","name":"SC Concordia SAbt Palame"},"40012":{"id":"40012","name":"SV Diag.Harburg 1926 eV"},"40013":{"id":"40013","name":"SC Diogenes eV"},"40015":{"id":"40015","name":"SV Eidelstedt"},"40016":{"id":"40016","name":"SC Farmsen 1966"},"40018":{"id":"40018","name":"TV Fischbek Suederelbe"},"40019":{"id":"40019","name":"SAbt Gehörlosen SPV 04"},"40020":{"id":"40020","name":"SV Großhansdorf"},"40022":{"id":"40022","name":"SC Rösselsprung e.V."},"40023":{"id":"40023","name":"Hamburger SK von 1830 eV"},"40024":{"id":"40024","name":"Mümmelmannsberger SV"},"40026":{"id":"40026","name":"SAbt SV Lurup Hamb. 1923"},"40027":{"id":"40027","name":"Langenhorner SF 1928"},"40028":{"id":"40028","name":"SK Marmstorf GW Harburg"},"40030":{"id":"40030","name":"Niendorfer TSV 1919 SAbt"},"40032":{"id":"40032","name":"Pinneberger SC 1932 eV"},"40033":{"id":"40033","name":"SG Wichern-Schule im SSW"},"40035":{"id":"40035","name":"Bille SC von 1924 e.V."},"40036":{"id":"40036","name":"SF Sasel 1947"},"40037":{"id":"40037","name":"SF Hamburg eV 1934"},"40038":{"id":"40038","name":"SK Johanneum Eppendorf"},"40039":{"id":"40039","name":"FC ST.Pauli 1910 eV SAbt"},"40040":{"id":"40040","name":"SK Union Eimsbuettel eV"},"40041":{"id":"40041","name":"SC Schachelschweine eV"},"40042":{"id":"40042","name":"Volksdorfer SK 1948"},"40043":{"id":"40043","name":"SF Wedel"},"40044":{"id":"40044","name":"SK Wilhelmsburg 1936 eV"},"40055":{"id":"40055","name":"Koenigsspr.SC.1984 e.V."},"40059":{"id":"40059","name":"SC Schwarz-Weiss Harburg"},"40062":{"id":"40062","name":"SK Weisse Dame Hamburg"},"40100":{"id":"40100","name":"Verein 40100"},"51001":{"id":"51001","name":"SV Anderssen Arolsen"},"51002":{"id":"51002","name":"SAbt VfL Bad Wildungen"},"51003":{"id":"51003","name":"SC Eschwege"},"51005":{"id":"51005","name":"Sfr. Hess. Lichtenau"},"51006":{"id":"51006","name":"SK Hofgeismar"},"51008":{"id":"51008","name":"Kasseler SK 1876"},"51009":{"id":"51009","name":"Sfr. Korbach"},"51010":{"id":"51010","name":"Mündener SC von 1925"},"51011":{"id":"51011","name":"SC Fuldatal"},"51013":{"id":"51013","name":"SC Körle 1966"},"51014":{"id":"51014","name":"SV CAISSA e. V. Kassel"},"51015":{"id":"51015","name":"SK Bad Sooden-Allendorf"},"51017":{"id":"51017","name":"SC Neuenbrunslar 1968"},"51019":{"id":"51019","name":"SC Kaufungen"},"51020":{"id":"51020","name":"SK 1950 Vellmar"},"51022":{"id":"51022","name":"SC 1947 Immenhausen"},"51023":{"id":"51023","name":"Homberger SC"},"51025":{"id":"51025","name":"Schachklub Baunatal 1963"},"51027":{"id":"51027","name":"SAbt FSK Lohfelden"},"51030":{"id":"51030","name":"SK Wichtelkönig Zierenberg"},"51032":{"id":"51032","name":"SC Diemelstadt"},"51037":{"id":"51037","name":"TuS Viktoria 1912 Großenenglis"},"51038":{"id":"51038","name":"SC Grauer Turm Fritzlar"},"51041":{"id":"51041","name":"Sfr. Bad Emstal 1993"},"51043":{"id":"51043","name":"SAbt SVH Kassel"},"51050":{"id":"51050","name":"Ahnataler SC 1969 e.V. (ASC69)"},"51053":{"id":"51053","name":"SK Upland-Willingen"},"51055":{"id":"51055","name":"SV KK Heckershausen"},"51056":{"id":"51056","name":"SV Schneller Läufer Edertal 2009"},"51057":{"id":"51057","name":"SAbt TG Wehlheiden"},"51058":{"id":"51058","name":"Schachköpfe Hann. Münden"},"51059":{"id":"51059","name":"TSV Wenigenhasungen"},"52001":{"id":"52001","name":"SV Alsfeld"},"52003":{"id":"52003","name":"SC Fulda"},"52004":{"id":"52004","name":"SV Rochade Hünfeld"},"52005":{"id":"52005","name":"SVG Lauterbach"},"52006":{"id":"52006","name":"SC Rotenburg"},"52007":{"id":"52007","name":"SVG Landeck Schenklengsfeld"},"52010":{"id":"52010","name":"SC Langenbieber"},"52014":{"id":"52014","name":"SC Ehrenberg"},"52016":{"id":"52016","name":"SG Springer Burghaun"},"52017":{"id":"52017","name":"SK Turm Bad Hersfeld"},"53001":{"id":"53001","name":"Sfr. Atzbach"},"53002":{"id":"53002","name":"Sfr. Braunfels e. V."},"53003":{"id":"53003","name":"SV Oberhessen Echzell e.V."},"53004":{"id":"53004","name":"Sfr. Wieseck"},"53005":{"id":"53005","name":"SK Herborn 1946"},"53006":{"id":"53006","name":"SC Heuchelheim"},"53007":{"id":"53007","name":"SK Marburg 1931/72"},"53010":{"id":"53010","name":"SK Stadtallendorf"},"53014":{"id":"53014","name":"Schachfreunde Battenberg"},"53016":{"id":"53016","name":"Sfr. Anderssen Wetzlar"},"53023":{"id":"53023","name":"SC Eschenburg"},"53024":{"id":"53024","name":"SSG Hungen-Lich"},"53030":{"id":"53030","name":"Biebertaler Schachfreunde"},"53034":{"id":"53034","name":"SC Königsspr. Gladenbach"},"53035":{"id":"53035","name":"SC Bauernfreunde Schwalm"},"53036":{"id":"53036","name":"SC Rochade 84 Königsberg"},"53039":{"id":"53039","name":"SJ Herborn 1998"},"53040":{"id":"53040","name":"Schachtreff Großen-Buseck e. V."},"53042":{"id":"53042","name":"Sfr. Kirchhain/Rauschenberg 1947/84"},"53043":{"id":"53043","name":"SC Butzbach 2000"},"53044":{"id":"53044","name":"Sfr. TuS Brandoberndorf"},"53046":{"id":"53046","name":"SAbt TSV 1907 Allendorf/Lumda"},"53047":{"id":"53047","name":"SG Turm Somplar"},"54004":{"id":"54004","name":"SC Turm Büdingen"},"54005":{"id":"54005","name":"SAbt SG 1945 Dietzenbach"},"54006":{"id":"54006","name":"SV Erlensee"},"54007":{"id":"54007","name":"SC 1934 Gelnhausen"},"54008":{"id":"54008","name":"SV Königsspringer 1929 Großauheim"},"54010":{"id":"54010","name":"SK Gründau"},"54011":{"id":"54011","name":"Sfr. Hailer-Meerholz"},"54012":{"id":"54012","name":"1.Hainstädter SC 1950"},"54013":{"id":"54013","name":"SC Nidderau"},"54014":{"id":"54014","name":"SC 1929 Langenselbold"},"54015":{"id":"54015","name":"SV Maintal 1934"},"54016":{"id":"54016","name":"SAbt SU Mühlheim/Main"},"54017":{"id":"54017","name":"SC 1952 Obertshausen"},"54018":{"id":"54018","name":"VSG 1880 Offenbach"},"54019":{"id":"54019","name":"SK Springer Rodenbach"},"54020":{"id":"54020","name":"SC 1953 Ronneburg"},"54022":{"id":"54022","name":"Sfr. Schöneck"},"54024":{"id":"54024","name":"SC 1933 Somborn"},"54027":{"id":"54027","name":"SK 1959 Bischofsheim"},"54029":{"id":"54029","name":"SC Ulmbach"},"54031":{"id":"54031","name":"Sfr. Neuberg"},"54032":{"id":"54032","name":"SC Ortenberg/Nidda 1977"},"54035":{"id":"54035","name":"SC Heusenstamm"},"54039":{"id":"54039","name":"SC Bad Orb 1984"},"54041":{"id":"54041","name":"Bruchköbler SV 93"},"54043":{"id":"54043","name":"SV Bergwinkel"},"54044":{"id":"54044","name":"SV Altenstadt"},"54045":{"id":"54045","name":"SG Wächtersbach/Sotzbach"},"54046":{"id":"54046","name":"SF Dettingen 1950"},"54047":{"id":"54047","name":"Sfr. Seligenstadt 05 e. V."},"54048":{"id":"54048","name":"SV Kinzigtal Erlensee / Langenselbold"},"54049":{"id":"54049","name":"Sfr. Heusenstamm"},"55001":{"id":"55001","name":"SK Bad Homburg 1927"},"55002":{"id":"55002","name":"SC Bergen-Enkheim 1922"},"55003":{"id":"55003","name":"SC Eschbach im Usinger Land"},"55004":{"id":"55004","name":"SV 1926 Fechenheim"},"55005":{"id":"55005","name":"Sfr. Frankfurt 1921"},"55006":{"id":"55006","name":"Sfr.1891 Friedberg"},"55010":{"id":"55010","name":"SV 1926 Neu-Isenburg"},"55018":{"id":"55018","name":"SAbt TuS Hausen"},"55023":{"id":"55023","name":"SC Bad Nauheim"},"55024":{"id":"55024","name":"SV Oberursel"},"55025":{"id":"55025","name":"SG Nordwest Frankfurt 1965"},"55026":{"id":"55026","name":"SC Brett vor'm Kopp Ffm"},"55027":{"id":"55027","name":"Bad Vilbeler Sfr.1985"},"55032":{"id":"55032","name":"SAbt TuS Makkabi Ffm"},"55033":{"id":"55033","name":"Blindenschachklub Frankfurt"},"55034":{"id":"55034","name":"SC Matt im Park Ffm"},"55036":{"id":"55036","name":"Sabt Frankfurter TV 1860"},"55038":{"id":"55038","name":"SAbt Niederräder TG"},"55039":{"id":"55039","name":"Chess Tigers Schach-Förderverein 1999"},"55040":{"id":"55040","name":"SV Frankfurt Nord 1926"},"55041":{"id":"55041","name":"SG 2001 Griesheim"},"55042":{"id":"55042","name":"SK 1858 Gießen"},"55043":{"id":"55043","name":"SK Königsjäger Hungen"},"55044":{"id":"55044","name":"SAbt TSG Nieder-Erlenbach 1888"},"56001":{"id":"56001","name":"SAbt TEC Darmstadt"},"56004":{"id":"56004","name":"SK 1927 Dieburg"},"56005":{"id":"56005","name":"SK Eberstadt 1924"},"56007":{"id":"56007","name":"SC Goddelau"},"56009":{"id":"56009","name":"SC Reinheim/Groß-Bieberau"},"56010":{"id":"56010","name":"SC Turm Breuberg"},"56011":{"id":"56011","name":"SK Langen"},"56013":{"id":"56013","name":"SC Münster"},"56014":{"id":"56014","name":"SC Ober-Ramstadt"},"56015":{"id":"56015","name":"SK 1924 Pfungstadt"},"56016":{"id":"56016","name":"SC Schachmatt Weiterstadt"},"56017":{"id":"56017","name":"SC Groß-Zimmern"},"56018":{"id":"56018","name":"SV Griesheim(DA)"},"56019":{"id":"56019","name":"SC Rödermark"},"56022":{"id":"56022","name":"SC Groß-Umstadt"},"56023":{"id":"56023","name":"SG Wartturm Schaafheim"},"56024":{"id":"56024","name":"SK 1980 Gernsheim"},"56025":{"id":"56025","name":"SC Springer Bad König"},"56026":{"id":"56026","name":"SC Ladja Roßdorf"},"56027":{"id":"56027","name":"SAbt TV 1893 Seeheim"},"56035":{"id":"56035","name":"SC FK Babenhausen 1994"},"56036":{"id":"56036","name":"SV Schachforum Darmstadt 1994"},"56039":{"id":"56039","name":"Schach-Spielgemeinschaft Rödermark/Epper"},"57001":{"id":"57001","name":"SVG Eppstein 1932"},"57003":{"id":"57003","name":"SC Flörsheim 1921"},"57004":{"id":"57004","name":"SV 1934 Ffm-Griesheim"},"57005":{"id":"57005","name":"SV 1946 Groß-Gerau"},"57006":{"id":"57006","name":"Sfr. Hochheim"},"57007":{"id":"57007","name":"SC 1910 Höchst"},"57008":{"id":"57008","name":"SV 1920 Hofheim"},"57009":{"id":"57009","name":"Sfr.1932 Kelkheim"},"57010":{"id":"57010","name":"SV 1920 Kelsterbach"},"57012":{"id":"57012","name":"SC 1961 König Nied"},"57013":{"id":"57013","name":"SV 1929 Raunheim"},"57014":{"id":"57014","name":"SV Rüsselsheim 1929"},"57019":{"id":"57019","name":"SC Steinbach"},"57020":{"id":"57020","name":"Sfr.Königstein 1972"},"57022":{"id":"57022","name":"SC Eschborn 1974"},"57023":{"id":"57023","name":"SC Sulzbach 1975"},"57025":{"id":"57025","name":"SC 1979 Hattersheim"},"57026":{"id":"57026","name":"SC Bad Soden"},"57028":{"id":"57028","name":"SAbt VfL Goldstein"},"57030":{"id":"57030","name":"Sfr. Mörfelden-Walldorf"},"57031":{"id":"57031","name":"SC Frankfurt-West"},"57032":{"id":"57032","name":"SV 1997 Nauheim"},"57033":{"id":"57033","name":"Sfr. Taunus Königstein/Schwalbach"},"57034":{"id":"57034","name":"SV Mainspitze Ginsheim"},"58001":{"id":"58001","name":"SK Bad Schwalbach"},"58002":{"id":"58002","name":"SV Biebrich"},"58003":{"id":"58003","name":"FC 1934 Wiesbaden-Bierstadt"},"58005":{"id":"58005","name":"Sfr. Görsroth-Kesselbach"},"58007":{"id":"58007","name":"SAbt BKA Wiesbaden"},"58008":{"id":"58008","name":"Sfr.Erbach"},"58010":{"id":"58010","name":"SK 1950 Geisenheim"},"58012":{"id":"58012","name":"SG Turm Idstein"},"58018":{"id":"58018","name":"SC Taunusstein 1966"},"58019":{"id":"58019","name":"Wiesbadener SV 1885"},"58024":{"id":"58024","name":"SAbt TuS Dotzheim"},"58029":{"id":"58029","name":"SAbt SV Blau-Gelb Wiesbaden"},"58030":{"id":"58030","name":"TuS Makkabi Wiesbaden"},"58032":{"id":"58032","name":"Sfr Stiller Zug Wiesbaden"},"59003":{"id":"59003","name":"SC Langendernbach"},"59004":{"id":"59004","name":"SV Lahn Limburg"},"59005":{"id":"59005","name":"SK Niederbrechen 1948"},"59007":{"id":"59007","name":"SV Westerburg"},"59008":{"id":"59008","name":"SC \"Rochade 69\" Diez e. V."},"59009":{"id":"59009","name":"SC 1971 Bad Marienberg  e. V."},"59010":{"id":"59010","name":"SK 1948 Weilburg"},"59015":{"id":"59015","name":"SC \"Königsflügel\" Lindenholzhausen 1979"},"61101":{"id":"61101","name":"Bochumer Schachverein 02"},"61102":{"id":"61102","name":"Schachgemeinschaft Höntrop 1947"},"61104":{"id":"61104","name":"Sport Union Annen e.V."},"61105":{"id":"61105","name":"Schachgemeinschaft Blankenstein"},"61108":{"id":"61108","name":"Schachgesellschaft Bochum 1931"},"61109":{"id":"61109","name":"Schachclub an der Uni Bochum 1969"},"61110":{"id":"61110","name":"Schachverein Hattingen e.V."},"61112":{"id":"61112","name":"Schachfreunde Springer Bochum 1921/28"},"61113":{"id":"61113","name":"Schachgesellschaft Witten"},"61115":{"id":"61115","name":"Schachgemeinschaft Winz-Baak 48"},"61116":{"id":"61116","name":"Schachverein Welper 1922 e.V."},"61117":{"id":"61117","name":"SC Gerthe 46 - Werne"},"61119":{"id":"61119","name":"Schachverein Wattenscheid 1930"},"61120":{"id":"61120","name":"Schachverein Günnigfeld 1922 e.V."},"61132":{"id":"61132","name":"TuS Witten-Stockum 1945 e.V."},"61133":{"id":"61133","name":"Schachverein Bochum-Linden-Dahlhausen 19"},"61134":{"id":"61134","name":"Schachclub Dolce Vita 93 e.V."},"61200":{"id":"61200","name":"Schachgemeinschaft Dortmund"},"61202":{"id":"61202","name":"Schachclub Hansa Dortmund e.V."},"61204":{"id":"61204","name":"Post- u. Telekom-Sportverein Dortmund e."},"61205":{"id":"61205","name":"Dortmunder Schachverein 1875"},"61206":{"id":"61206","name":"Schachgesellschaft Mengede 1922"},"61208":{"id":"61208","name":"Schachvereinigung Marten-Bövinghausen"},"61209":{"id":"61209","name":"Schachfreunde Brackel 1930 e.V."},"61210":{"id":"61210","name":"Freier Sportverein von 1898 Dortmund e.V"},"61214":{"id":"61214","name":"Schachverein Eichlinghofen 1935"},"61218":{"id":"61218","name":"Schachunion Huckarde-Westerfilde"},"61226":{"id":"61226","name":"Schachclub Wambel 77 e.V."},"61228":{"id":"61228","name":"SV Rochade Eving 25/64"},"61234":{"id":"61234","name":"Schachverein Brechten 1985"},"61235":{"id":"61235","name":"Schachfreunde Schüren 77/87 e.V."},"61236":{"id":"61236","name":"Schachfreunde Berghofen-Hörde"},"61239":{"id":"61239","name":"Schachfreunde Lünen 1993 e.V."},"61241":{"id":"61241","name":"Schachclub Doppelbauer Brambauer e.V."},"61242":{"id":"61242","name":"DJK Ewaldi Aplerbeck 1930 e.V."},"61243":{"id":"61243","name":"Schachclub Scharnhorst 2002"},"61301":{"id":"61301","name":"Schachverein Rot-Weiß-Altenessen 1930 e."},"61303":{"id":"61303","name":"DJK Wacker Bergeborbeck 1922"},"61304":{"id":"61304","name":"Sportfreunde Katernberg 1913 e.V."},"61305":{"id":"61305","name":"Kettwiger Schachgesellschaft 1948 e.V."},"61307":{"id":"61307","name":"Rochade Steele/Kray 1919/38"},"61309":{"id":"61309","name":"Schachfreunde Essen Überruhr 46/53 e.V."},"61310":{"id":"61310","name":"Schachklub Holsterhausen e.V."},"61311":{"id":"61311","name":"Schachklub Germania Kupferdreh 1924 e.V."},"61313":{"id":"61313","name":"Schachfreunde Essen-Werden 1924/80 e.V."},"61314":{"id":"61314","name":"Schachclub Listiger Bauer Essen-West e.V"},"61316":{"id":"61316","name":"Schachclub Weiße Dame Borbeck 25 e.V."},"61317":{"id":"61317","name":"SC Rochade Rüttenscheid 1983"},"61319":{"id":"61319","name":"Schachclub Jolly Jumper"},"61401":{"id":"61401","name":"Schachfreunde Dorsten 1949"},"61403":{"id":"61403","name":"Hervest-Dorstener Schachklub 1956"},"61404":{"id":"61404","name":"Schachgesellschaft-Gladbeck 19/23 e.V."},"61406":{"id":"61406","name":"Schachfreunde Kirchhellen 50/72e.V."},"61408":{"id":"61408","name":"Schachfreunde Buer 21/74"},"61410":{"id":"61410","name":"Oberhausener Schachverein 1887 e.V."},"61412":{"id":"61412","name":"SC Buer-Hassel 1919 e.V."},"61414":{"id":"61414","name":"Schachverein Horst-Emscher 31"},"61415":{"id":"61415","name":"Schachfreunde Gelsenkirchen 2002"},"61417":{"id":"61417","name":"Schachverein Bottrop 1921"},"61422":{"id":"61422","name":"Schachverein Schwarz-Weiß Oberhausen 51/"},"61423":{"id":"61423","name":"Sportvereinigung Sterkrade-Nord 1920/25"},"61426":{"id":"61426","name":"Schwarze Dame Osterfeld"},"61503":{"id":"61503","name":"Schachvereinigung Hamm"},"61504":{"id":"61504","name":"Schachverein Heessen 1925"},"61505":{"id":"61505","name":"Schachverein Ahlen 1954 e.V."},"61507":{"id":"61507","name":"Schachklub Werne 1972"},"61508":{"id":"61508","name":"Schachverein Unna 1924"},"61510":{"id":"61510","name":"Schachverein Kamen 1930"},"61513":{"id":"61513","name":"Schachverein Rünthe 1946"},"61515":{"id":"61515","name":"Schachverein Bönen 49"},"61516":{"id":"61516","name":"Schachclub Lünen Horstmar 31/73"},"61517":{"id":"61517","name":"Schachgemeinschaft Caissa Hamm 1981"},"61518":{"id":"61518","name":"Schachclub Werl 1981 e.V."},"61520":{"id":"61520","name":"Schachverein Königsspringer Hamm 45/58"},"61603":{"id":"61603","name":"Schachverein Mülheim-Nord 1931 e.V"},"61604":{"id":"61604","name":"Schachclub Mülheim 08/25 e.V."},"61605":{"id":"61605","name":"Schachverein Turm Mülheim 1931 e.V."},"61701":{"id":"61701","name":"Schachklub Recklinghausen Altstadt 06"},"61703":{"id":"61703","name":"Schachverein Königsspringer Haltern 1962"},"61704":{"id":"61704","name":"Schachverein Datteln 1924"},"61705":{"id":"61705","name":"Recklinghäuser Schachgemeinschaft Läufer"},"61706":{"id":"61706","name":"Schachgemeinschaft Drewer 54 e.V."},"61707":{"id":"61707","name":"Schachverein Recklinghausen-Süd"},"61708":{"id":"61708","name":"Schachverein Erkenschwick 1923 e.V."},"61709":{"id":"61709","name":"Schachverein Waltrop 1922 e.V."},"61711":{"id":"61711","name":"Sportgemeinschaft Suderwich 1909 e.V."},"61713":{"id":"61713","name":"SV Hullern von 1968 e.V."},"61714":{"id":"61714","name":"Schachgruppe Rochade Disteln 1991"},"61718":{"id":"61718","name":"Schachverein Castrop-Rauxel 1923"},"61719":{"id":"61719","name":"Schachklub Herne-Sodingen 1924"},"61720":{"id":"61720","name":"Schachklub Ickern 60"},"61721":{"id":"61721","name":"Schachverein Constantin Herne 1940 e.V."},"61722":{"id":"61722","name":"Schachverein Unser Fritz Wanne-Eickel 19"},"61723":{"id":"61723","name":"SV Zeppelin Herne e.V."},"62101":{"id":"62101","name":"Schachgesellschaft Solingen e.V."},"62102":{"id":"62102","name":"Schachclub Solingen 1924"},"62103":{"id":"62103","name":"Ohligser Turnverein 1888 e.V."},"62105":{"id":"62105","name":"Schachclub Solingen 1928 e.V."},"62106":{"id":"62106","name":"Elberfelder Schach-Gesellschaft 1851"},"62109":{"id":"62109","name":"Vohwinkeler Schachclub von 1929"},"62110":{"id":"62110","name":"Ronsdorfer Schachverein e.V."},"62111":{"id":"62111","name":"Schachfreunde Vonkeln 1931"},"62112":{"id":"62112","name":"Radevormwalder Schachverein 1925"},"62113":{"id":"62113","name":"Schachverein Wermelskirchen 32"},"62115":{"id":"62115","name":"SV Schwarz-Weiß Remscheid"},"62119":{"id":"62119","name":"Velberter Schachgesellschaft 1923 e.V."},"62125":{"id":"62125","name":"Schachfreunde Neviges 1960 e.V."},"62130":{"id":"62130","name":"Schachfreunde Unterbarmen"},"62133":{"id":"62133","name":"Schachfreunde Anna 88 Wuppertal"},"62135":{"id":"62135","name":"Schachclub Tornado Wuppertal 1991"},"62138":{"id":"62138","name":"Bahn-Schachclub Wuppertal"},"62140":{"id":"62140","name":"Turnverein Witzhelden 1884 e.V."},"62141":{"id":"62141","name":"Mettmann-Sport e.V."},"62142":{"id":"62142","name":"Männer-Turn-Verein Langenberg 1882 e.V."},"62143":{"id":"62143","name":"Schachfreunde Lennep"},"62202":{"id":"62202","name":"Düsseldorfer Schachverein 1854"},"62203":{"id":"62203","name":"Schachgesellschaft Benrath 1924"},"62209":{"id":"62209","name":"Schachclub Erkrath 1973"},"62212":{"id":"62212","name":"Verein f. Sport u. Freizeit v. 1975 Düss"},"62213":{"id":"62213","name":"Schachclub Düsseldorf Garath 1973"},"62215":{"id":"62215","name":"Schachverein 1922 Hilden"},"62219":{"id":"62219","name":"Sportgemeinschaft Kaarst 1912/35 e.V."},"62220":{"id":"62220","name":"Schachverein Lintorf 1947"},"62221":{"id":"62221","name":"Oberbilker Schachverein 1960"},"62222":{"id":"62222","name":"Ratinger Schachklub 1950"},"62227":{"id":"62227","name":"Turn- u. Sportverein Düsseldorf-Nord e.V"},"62228":{"id":"62228","name":"Schachverein Wersten"},"62229":{"id":"62229","name":"Schachverein Grevenbroich 1953"},"62233":{"id":"62233","name":"Schachgemeinschaft Neuss/Norf e.V."},"62234":{"id":"62234","name":"Schachfreunde Gerresheim 86 e.V."},"62236":{"id":"62236","name":"Düsseldorfer Schachklub 14/25 e.V."},"62239":{"id":"62239","name":"SV Schewe Torm/Derendorf 1928/1930 e.V."},"62240":{"id":"62240","name":"Höseler Bürger-u. Schützenverein 1965 e."},"62301":{"id":"62301","name":"OSC Rheinhausen 04 e.V."},"62302":{"id":"62302","name":"Schachvereinigung Meiderich 23"},"62306":{"id":"62306","name":"Walsumer Schachclub 72 e.V."},"62313":{"id":"62313","name":"ESK Weiße-Dame Wedau-Bissingheim 1925 St"},"62316":{"id":"62316","name":"ESV Grossenbaum e.V. 1973"},"62317":{"id":"62317","name":"Polizeisport-Verein Duisburg 1920 e.V."},"62319":{"id":"62319","name":"St. Ludgerus Schachverein Walsum e.V."},"62320":{"id":"62320","name":"Schachfreunde Brett vor'm Kopp Duisburg"},"62321":{"id":"62321","name":"Schachgemeinschaft Meiderich/Ruhrort e.V"},"62322":{"id":"62322","name":"Schachgemeinschaft Duisburg-Nord 07/45 e"},"62402":{"id":"62402","name":"Emmericher Schachclub 1928 e.V."},"62403":{"id":"62403","name":"Schachfreunde Erkelenz 1959 e.V."},"62408":{"id":"62408","name":"Grefrather Schachverein 1962 e.V."},"62411":{"id":"62411","name":"Schachgemeinschaft Hochneukirch 1955"},"62414":{"id":"62414","name":"Schachclub Kevelaer 1948 e.V."},"62415":{"id":"62415","name":"Schachklub Turm Kleve 1974 e.V."},"62416":{"id":"62416","name":"Schachverein Springer Kranenburg"},"62418":{"id":"62418","name":"Krefelder Schachgesellschaft Rochade 192"},"62419":{"id":"62419","name":"Krefelder Schachklub Turm 1851 e.V."},"62420":{"id":"62420","name":"Mönchengladbacher Schachverein 1887 e.V."},"62421":{"id":"62421","name":"Schachgemeinschaft Nettetal 1929/70 e.V."},"62425":{"id":"62425","name":"Rheydter Schachverein 1920"},"62426":{"id":"62426","name":"Schachklub Turm Rheydt 1929 e.V."},"62427":{"id":"62427","name":"Schachklub Turm Schiefbahn 1931"},"62428":{"id":"62428","name":"Schachclub Straelen 1956 e.V."},"62429":{"id":"62429","name":"Schachfreunde Süchteln 1938 e.V."},"62430":{"id":"62430","name":"Schachclub Springer St.Tönis 1949 e.V."},"62431":{"id":"62431","name":"Uedemer Schachclub 1948 e.V."},"62433":{"id":"62433","name":"Schachclub Bayer Uerdingen 1923 e.V."},"62435":{"id":"62435","name":"Wegberger Schachverein 1962 e.V."},"62437":{"id":"62437","name":"DJK Kleinenbroich 1951 e.V."},"62440":{"id":"62440","name":"Schachfreunde Dremmen 1962"},"62443":{"id":"62443","name":"Schachklub Turm Brüggen"},"62446":{"id":"62446","name":"Schachfreunde 1974 Heinsberg e.V."},"62448":{"id":"62448","name":"SV Blau-Weiß Concordia 07/24 Viersen e.V"},"62451":{"id":"62451","name":"VFL Nierswalde 1952 e.V."},"62452":{"id":"62452","name":"Schachfüchse Kempen 1986 e.V."},"62453":{"id":"62453","name":"SC Tornado 86 Hochneukirch"},"62457":{"id":"62457","name":"Schachfreunde Niederkrüchten e.V."},"62459":{"id":"62459","name":"Schachfreunde WSB-Krefeld 1999 e.V."},"62461":{"id":"62461","name":"TTC Blau-Weiß Geldern Veert e.V."},"62501":{"id":"62501","name":"Schachverein Dinslaken 1923 e.V."},"62505":{"id":"62505","name":"Schachverein Turm Kamp-Lintfort"},"62506":{"id":"62506","name":"Schachfreunde Lohberg 1953"},"62507":{"id":"62507","name":"Schachclub Caissa Moers"},"62508":{"id":"62508","name":"Schachverein Neukirchen-Vluyn von 1927 e"},"62509":{"id":"62509","name":"TUS 08 Rheinberg e.V."},"62510":{"id":"62510","name":"Schachfreunde Moers e.V."},"62511":{"id":"62511","name":"Schachverein Wesel 1928 e.V."},"62512":{"id":"62512","name":"Schachklub Xanten e.V."},"62515":{"id":"62515","name":"Schachverein Turm Spellen"},"62516":{"id":"62516","name":"Schachclub Freibauer Hünxe 87"},"62517":{"id":"62517","name":"Turnverein Bruckhausen 1921 e.V."},"62519":{"id":"62519","name":"Turnverein Mehrhoog 64 e.V."},"62522":{"id":"62522","name":"FC Viktoria Alpen 1911 e.V."},"63202":{"id":"63202","name":"Schachfreunde Fröndenberg"},"63203":{"id":"63203","name":"Schachverein Hemer 1932"},"63205":{"id":"63205","name":"Schachverein Hüingsen 29"},"63206":{"id":"63206","name":"Schachverein Victoria Hohenheide 1948"},"63207":{"id":"63207","name":"Schachklub Königsspringer Iserlohn 1934"},"63209":{"id":"63209","name":"Schachverein Letmathe 1933 e.V."},"63211":{"id":"63211","name":"Turngemeinde Westhofen 1883 e.V."},"63212":{"id":"63212","name":"Schachfreunde Schwerte 1951"},"63213":{"id":"63213","name":"Schachklub Wickede"},"63214":{"id":"63214","name":"Schachverein Menden 24 e.V."},"63215":{"id":"63215","name":"SC Königsspringer Hagen/Wetter"},"63216":{"id":"63216","name":"Schachfreunde Herdecke e.V."},"63217":{"id":"63217","name":"Schachverein Turm Hohenlimburg 1926 e.V."},"63219":{"id":"63219","name":"TSV Hagen 1860 e.V."},"63220":{"id":"63220","name":"Postsportverein Hagen 1926 e.V."},"63221":{"id":"63221","name":"Schachgemeinschaft Ennepe-Ruhr-Süd"},"63222":{"id":"63222","name":"TuS Ende 1892 e.V."},"63223":{"id":"63223","name":"Turn-Spielverein Dahl 1878 e.V."},"63224":{"id":"63224","name":"Schachjugend Schwerte 2010 e.V."},"63302":{"id":"63302","name":"Schachverein Bergneustadt/Derschlag"},"63303":{"id":"63303","name":"Schachverein Gummersbach"},"63306":{"id":"63306","name":"Schachfreunde Lindlar 1977"},"63307":{"id":"63307","name":"Schachclub Marienheide 1933"},"63308":{"id":"63308","name":"Schachklub Meinerzhagen"},"63309":{"id":"63309","name":"Sportverein Morsbach 02/29 e.V."},"63310":{"id":"63310","name":"Schachfreunde Olpe e.V."},"63312":{"id":"63312","name":"Schachverein Schnellenbach"},"63314":{"id":"63314","name":"Schachverein Wiehl 1923 e.V."},"63317":{"id":"63317","name":"Schachverein Kierspe 1929"},"63319":{"id":"63319","name":"Schachfreunde Hückeswagen 85 e.V."},"63320":{"id":"63320","name":"Schachverein Wipperfürth 1969"},"63322":{"id":"63322","name":"Schachclub Turm Windeck"},"63324":{"id":"63324","name":"Schachverein Turm Drolshagen 04"},"63400":{"id":"63400","name":"Schachbezirk Hochsauerland"},"63402":{"id":"63402","name":"Schachverein Herdringen"},"63403":{"id":"63403","name":"Schachverein Sundern 1973"},"63404":{"id":"63404","name":"Schachverein Meschede e.V."},"63405":{"id":"63405","name":"Schachverein Velmede-Bestwig"},"63406":{"id":"63406","name":"Schachfreunde Josefsheim Bigge"},"63407":{"id":"63407","name":"Schachverein Hüsten 1929"},"63408":{"id":"63408","name":"Schachverein Schmallenberg 1948 e.V."},"63410":{"id":"63410","name":"Schachverein Brilon"},"63413":{"id":"63413","name":"Schachfreunde Eslohe"},"63415":{"id":"63415","name":"Schachclub Marsberg e.V."},"63417":{"id":"63417","name":"Ballsportverein Bergheim e.V."},"63418":{"id":"63418","name":"Schachverein Ruhrspringer"},"63501":{"id":"63501","name":"Schachverein Königsspringer e.V. Lüdensc"},"63502":{"id":"63502","name":"Schachvereinigung Lüdenscheid e.V."},"63504":{"id":"63504","name":"VFB Altena 1912 e.V."},"63505":{"id":"63505","name":"Schachfreunde Neuenrade"},"63506":{"id":"63506","name":"Schachfreunde Attendorn e.V."},"63507":{"id":"63507","name":"Schachvereinigung 1920 Plettenberg e.V."},"63508":{"id":"63508","name":"Schachverein Werdohl 1933"},"63510":{"id":"63510","name":"Märkischer Springer Halver-Schalksmühle"},"63511":{"id":"63511","name":"Schachfreunde Lennestadt-Meggen  e.V."},"63606":{"id":"63606","name":"Schachclub Erndtebrück"},"63608":{"id":"63608","name":"Hellertaler Schachfreunde 1954 e.V."},"63609":{"id":"63609","name":"TUS Herdorf DJK"},"63610":{"id":"63610","name":"Schachclub Hilchenbach"},"63613":{"id":"63613","name":"Schachverein Kreuztal e.V."},"63614":{"id":"63614","name":"Schachverein Laasphe 1954"},"63616":{"id":"63616","name":"Königsspringer Schutzbach 1965"},"63617":{"id":"63617","name":"Siegener Schachverein 1878"},"63619":{"id":"63619","name":"SV Betzdorf-Kirchen"},"63622":{"id":"63622","name":"Schachclub Burbach 1971 e.V."},"63623":{"id":"63623","name":"Schachverein Weidenau/Geisweid e.V"},"63624":{"id":"63624","name":"Schachverein Caissa Gosenbach-Eiserfeld"},"63626":{"id":"63626","name":"Schachverein Wäller Schwarz/Weiß Gebhard"},"63628":{"id":"63628","name":"C4 Chess Club e.V."},"63629":{"id":"63629","name":"SC 07 Niederfischbach"},"64100":{"id":"64100","name":"Schachbezirk Bielefeld"},"64101":{"id":"64101","name":"Schachclub Rochade 1963 Beckum"},"64104":{"id":"64104","name":"Brackweder Schachklub von 1924"},"64105":{"id":"64105","name":"Schachverein Ennigerloh-Oelde"},"64107":{"id":"64107","name":"Gütersloher Schachverein von 1923 e.V."},"64108":{"id":"64108","name":"Heeper Schachklub von 1973"},"64109":{"id":"64109","name":"Schachclub Herzebrock-Clarholz 1977"},"64110":{"id":"64110","name":"TuS Einigkeit Hillegossen von 1905 e.V."},"64112":{"id":"64112","name":"Rhedaer Schachverein von 1931 e.V."},"64113":{"id":"64113","name":"Schachklub Sieker Bielefeld"},"64114":{"id":"64114","name":"Schachklub Stukenbrock e.V. 1969"},"64115":{"id":"64115","name":"SV Ubbedissen 09 e.V."},"64116":{"id":"64116","name":"Schachgemeinschaft Friedrichsdorf-Senne"},"64117":{"id":"64117","name":"Schachfreunde Verl"},"64118":{"id":"64118","name":"Schachclub Wiedenbrück"},"64120":{"id":"64120","name":"TuS Brake von 1896 e.V."},"64124":{"id":"64124","name":"Schachgemeinschaft Turm Rietberg e.V."},"64125":{"id":"64125","name":"SC Wadersloh-Diestedde e.V."},"64126":{"id":"64126","name":"Bielefelder Schachklub von 1883 e.V."},"64128":{"id":"64128","name":"Laskers Erben e.V."},"64203":{"id":"64203","name":"Schachclub Geseke e.V."},"64205":{"id":"64205","name":"SpVg. Möhnesee von 1921 e.V."},"64207":{"id":"64207","name":"Schachclub Scharmede 1970 e.V."},"64208":{"id":"64208","name":"Schachverein Soest 1926"},"64210":{"id":"64210","name":"Schachklub Königsspringer Wewelsburg"},"64211":{"id":"64211","name":"Schachklub Delbrück"},"64213":{"id":"64213","name":"Schachclub Turm Beverungen"},"64215":{"id":"64215","name":"SK 1980 Bad Lippspringe e.V."},"64223":{"id":"64223","name":"Spielgemeinschaft Schachfreunde Brakel-B"},"64224":{"id":"64224","name":"Turn- u. Rasensportgemeinde Elsen e.V. 1"},"64228":{"id":"64228","name":"SK Blauer Springer Paderborn 1926 e.V."},"64229":{"id":"64229","name":"Schachgemeinschaft Hövelhof"},"64231":{"id":"64231","name":"LSV Turm Lippstadt"},"64238":{"id":"64238","name":"Schachfreunde Paderborn 2000 e.V."},"64302":{"id":"64302","name":"Schachclub Caissa Bad Salzuflen e.V."},"64303":{"id":"64303","name":"Schachklub Turm Lage 1926"},"64304":{"id":"64304","name":"Schachverein Königsspringer Lemgo e.V."},"64305":{"id":"64305","name":"Schach-Klub Tönsberg Oerlinghausen"},"64306":{"id":"64306","name":"Schachverein Barntrup 1976"},"64308":{"id":"64308","name":"Schachclub Horn-Bad Meinberg e.V."},"64309":{"id":"64309","name":"Schachclub Leopoldshöhe"},"64312":{"id":"64312","name":"Schachfreunde Lieme e.V."},"64314":{"id":"64314","name":"Schach-Sportgemeinschschaft Wöbbel-Stein"},"64315":{"id":"64315","name":"Turn- u. Sportverein  Falke Berlebeck e."},"64316":{"id":"64316","name":"Turn- u. Sportverein Eichholz-Remmighaus"},"64317":{"id":"64317","name":"Schachgemeinschaft Lippe Süd"},"64402":{"id":"64402","name":"Schachverein Bad Oeynhausen"},"64403":{"id":"64403","name":"Schachgemeinschaft Bünde 1945"},"64404":{"id":"64404","name":"Schachgemeinschaft Enger-Spenge"},"64406":{"id":"64406","name":"Herforder Schachverein Königsspringer v."},"64407":{"id":"64407","name":"Schachverein Rochade Rödinghausen e.V."},"64408":{"id":"64408","name":"Schachgemeinschaft Löhne von 1946 e.V."},"64410":{"id":"64410","name":"Schachklub Minden 08"},"64411":{"id":"64411","name":"Schachverein Oetinghausen von 1945"},"64412":{"id":"64412","name":"Schachclub Porta Westfalica Holtrup 1950"},"64414":{"id":"64414","name":"Schachclub Springer Schnathorst e.V."},"64415":{"id":"64415","name":"Schachfreunde Ströhen e.V."},"64417":{"id":"64417","name":"Zugzwang Minden 82 e.V."},"64418":{"id":"64418","name":"Schachgemeinschaft Hücker-Aschen"},"64419":{"id":"64419","name":"Schachgemeinschaft Hiddenhausen 86 e.V."},"64420":{"id":"64420","name":"Schachgemeinschaft Freibauer Lübbecke"},"64421":{"id":"64421","name":"Schachgemeinschaft Kirchlengern 1991"},"64423":{"id":"64423","name":"Proleter Westfalen"},"64426":{"id":"64426","name":"Schachclub Wittekinds Knappen"},"64502":{"id":"64502","name":"Schachklub Ravensberg Borgholzhausen e.V"},"64503":{"id":"64503","name":"Schachklub Halle 1946 e.V."},"64506":{"id":"64506","name":"Spvg. Versmold 1945 e.V."},"64507":{"id":"64507","name":"Schachklub Werther 1949 e.V."},"64508":{"id":"64508","name":"Schachklub Steinhagen"},"64510":{"id":"64510","name":"Spielgemeinschaft Karpovs Enkel e.V."},"64512":{"id":"64512","name":"Schachverein 1948 Künsebeck e.V."},"64513":{"id":"64513","name":"zweihochsechs Bielefeld e.V."},"65105":{"id":"65105","name":"Schachklub Turm Emsdetten e.V."},"65109":{"id":"65109","name":"Schachfreunde Neuenkirchen"},"65112":{"id":"65112","name":"Schachklub Königsspringer Nordwalde"},"65113":{"id":"65113","name":"SC Klein-Berlin Rheine 1923 e.V."},"65114":{"id":"65114","name":"Schachgemeinschaft Rheine 1956"},"65117":{"id":"65117","name":"Schachfreunde Reckenfeld"},"65118":{"id":"65118","name":"Schachverein Ibbenbüren 1946"},"65120":{"id":"65120","name":"Schachklub Westerkappeln 59"},"65126":{"id":"65126","name":"Schachclub Rochade Emsdetten"},"65129":{"id":"65129","name":"Schachclub Steinfurt 1996 e.V."},"65130":{"id":"65130","name":"Chess Club Rheine 97 e.V."},"65131":{"id":"65131","name":"Sportclub Falke Saerbeck 1924 e.V."},"65201":{"id":"65201","name":"Schachclub Bocholt 1926 e.V."},"65202":{"id":"65202","name":"Turnverein Borken 1922 e.V."},"65204":{"id":"65204","name":"Schachclub Heek 1947 e.V."},"65205":{"id":"65205","name":"SV Heiden 62 e.V."},"65206":{"id":"65206","name":"Schachverein Benediktushof Reken e.V."},"65207":{"id":"65207","name":"Schachklub Metelen 46 e.V."},"65208":{"id":"65208","name":"Schachklub Ochtrup 61 e.V."},"65209":{"id":"65209","name":"Südlohner Schachverein 1956 e.V."},"65210":{"id":"65210","name":"Schachfreunde Stadtlohn 1947 e.V."},"65212":{"id":"65212","name":"Schachfreunde Weseke e.V."},"65213":{"id":"65213","name":"Schachgemeinschaft Turm Raesfeld/Erle"},"65214":{"id":"65214","name":"Schachclub Gronau 1920 e.V."},"65216":{"id":"65216","name":"Schachklub Gescher 81 e.V."},"65221":{"id":"65221","name":"Schachgemeinschaft Ahaus-Wessum 1998 e.V"},"65300":{"id":"65300","name":"Schachbezirk Münster"},"65301":{"id":"65301","name":"Schachklub Münster 32 e.V."},"65302":{"id":"65302","name":"Schachfreunde Telgte 1959 e.V."},"65303":{"id":"65303","name":"Schachklub Ostbevern/Westbevern 1970"},"65304":{"id":"65304","name":"Schachklub Dülmen 1952 e.V."},"65306":{"id":"65306","name":"Schachclub Hiltrup 86"},"65308":{"id":"65308","name":"DJK Eintracht Coesfeld VBRS e.V."},"65310":{"id":"65310","name":"Schachfreunde Olfen 1975"},"65312":{"id":"65312","name":"Schachfreunde Greven 1948"},"65314":{"id":"65314","name":"Sport-Club Müssingen 1949 e.V."},"65315":{"id":"65315","name":"Schachclub Sendenhorst e.V."},"65316":{"id":"65316","name":"Allgem. Sportverein Senden Turn- u. Hall"},"65317":{"id":"65317","name":"SK Lüdinghausen"},"65319":{"id":"65319","name":"Schachclub Zug um Zug Everswinkel"},"65320":{"id":"65320","name":"Schachfreunde Beelen 1984 e.V."},"65323":{"id":"65323","name":"Indische Dame Münster"},"65324":{"id":"65324","name":"Sportverein Teutonia Coerde 60 e.V."},"65327":{"id":"65327","name":"Schach Nienberge 2003"},"65328":{"id":"65328","name":"Schachverein Türme Billerbeck e.V."},"65330":{"id":"65330","name":"Schachfreunde Drensteinfurt e.V."},"65331":{"id":"65331","name":"Schachgemeinschaft Schloss-König 07 Nord"},"66101":{"id":"66101","name":"Aachener Schach-Gesellschaft 1930"},"66102":{"id":"66102","name":"Aachener Schachverein 1856 e.V."},"66103":{"id":"66103","name":"Schachvereinigung 1928 Alsdorf e.V."},"66104":{"id":"66104","name":"Turnverein \"Eifeler Turnkraft\" Konzen 19"},"66105":{"id":"66105","name":"DJK Aufwärts St. Josef Aachen 1920"},"66107":{"id":"66107","name":"DJK Arminia Eilendorf 1919 e.V."},"66108":{"id":"66108","name":"Eschweiler Schachclub 1921 e.V."},"66109":{"id":"66109","name":"Schachverein 1949 Herzogenrath"},"66110":{"id":"66110","name":"Schachgesellschaft Kohlscheid 1926 e.V."},"66113":{"id":"66113","name":"Post-Telekom SV 1925 Aachen e.V."},"66114":{"id":"66114","name":"Schachclub Roetgen 1952"},"66116":{"id":"66116","name":"Hansa-Gemeinschaft Simmerath 1921 e.V."},"66117":{"id":"66117","name":"Stolberger Schachverein 1927"},"66118":{"id":"66118","name":"Schachvereinigung Übach-Palenberg 1934 e"},"66119":{"id":"66119","name":"Schachverein Würselen 1926 e.V."},"66121":{"id":"66121","name":"Schachfreunde 1980 Baesweiler e.V."},"66122":{"id":"66122","name":"Schachclub Kalterherberg 1980 e.V."},"66124":{"id":"66124","name":"Schachfreunde Brand 1981 e.V."},"66125":{"id":"66125","name":"Schachclub Tigerli PP Aachen"},"66126":{"id":"66126","name":"Schachfreunde Geilenkirchen 1984"},"66127":{"id":"66127","name":"SV Sportfreunde Aachen-Hörn 1948 e.V."},"66128":{"id":"66128","name":"Salonremis Aachen Null-Null"},"66200":{"id":"66200","name":"Bonn/Rhein-Sieg e.V."},"66202":{"id":"66202","name":"Godesberger Schachklub 1929 e.V."},"66203":{"id":"66203","name":"Schachgemeinschaft Siebengebirge e.V."},"66205":{"id":"66205","name":"Schachverein Hennef 1927 e.V."},"66206":{"id":"66206","name":"Schachclub 1919 Siegburg e.V."},"66207":{"id":"66207","name":"Verein Rheinbacher Schachfreunde 1948 e."},"66208":{"id":"66208","name":"1. Schach-Klub Troisdorf e.V."},"66211":{"id":"66211","name":"Schachfreunde Lohmar 1974 e.V."},"66225":{"id":"66225","name":"Schachklub Heimerzheim"},"66232":{"id":"66232","name":"Vereinigung der Schachsportfreunde Stadt"},"66235":{"id":"66235","name":"SC Empor Maulwurf Bonn"},"66237":{"id":"66237","name":"Schachverein Turm Sankt Augustin e.V."},"66239":{"id":"66239","name":"Tischtennisclub Grün-Weiß Fritzdorf 1958"},"66243":{"id":"66243","name":"Schachclub Bonn Beuel"},"66244":{"id":"66244","name":"Schachfreunde Seelscheid e.V."},"66248":{"id":"66248","name":"Schachclub Limperich e.V."},"66300":{"id":"66300","name":"Kölner Schachverband von 1920 e.V."},"66301":{"id":"66301","name":"Bergische Schachfreunde 1923 Bergisch Gl"},"66302":{"id":"66302","name":"Schachverein 1925 Hürth-Berrenrath"},"66303":{"id":"66303","name":"Schachfreunde Brück-Rath-Heumar 1946"},"66304":{"id":"66304","name":"Brühler Schachklub 1920 e.V."},"66307":{"id":"66307","name":"Schachverein Bayer Dormagen 47"},"66311":{"id":"66311","name":"Schachklub Turm Euskirchen 65"},"66313":{"id":"66313","name":"Ford-Schachfreunde Köln e.V."},"66315":{"id":"66315","name":"Betriebssportgemeinschaft Rheinpark e.V."},"66318":{"id":"66318","name":"Schachklub Sülz-Klettenberg"},"66319":{"id":"66319","name":"Klub Kölner Schachfreunde e.V. 1967"},"66320":{"id":"66320","name":"Kölner Schachklub Dr. Lasker 1861 e.V."},"66322":{"id":"66322","name":"Schachfreunde Köln-Longerich 1956"},"66323":{"id":"66323","name":"Schachfreunde Köln-Mülheim e.V."},"66331":{"id":"66331","name":"Schachfreunde Rodenkirchen e.V."},"66332":{"id":"66332","name":"Turnerschaft Bergisch Gladbach 1879 e.V."},"66334":{"id":"66334","name":"Schachverein Horrem 1948"},"66335":{"id":"66335","name":"Pulheimer Sport-Club 1924/57 e.V."},"66337":{"id":"66337","name":"Internationaler Schachverein Freibauer E"},"66340":{"id":"66340","name":"Schachgemeinschaft Porz e.V."},"66341":{"id":"66341","name":"Schachgemeinschaft Rochade Brauweiler 19"},"66342":{"id":"66342","name":"Schachklub Köln-Worringen 1972"},"66343":{"id":"66343","name":"Schachgemeinschaft Niederkassel e.V."},"66344":{"id":"66344","name":"SF Köln-Müngersdorf 1935"},"66345":{"id":"66345","name":"Schachfreunde Esch e.V."},"66348":{"id":"66348","name":"Schachclub Poller Schachesel 80"},"66357":{"id":"66357","name":"Schachverein Erftstadt e.V."},"66360":{"id":"66360","name":"Schachgemeinschaft Kalker/Deutzer 19/25"},"66361":{"id":"66361","name":"SC Schachuzipus Köln-Mülheim"},"66362":{"id":"66362","name":"Satranc Club 2000 e.V."},"66364":{"id":"66364","name":"Schachklub Kerpen 64 e.V."},"66367":{"id":"66367","name":"Schachverein Grünfeld e.V."},"66401":{"id":"66401","name":"Bedburger Schachverein 1947 e.V."},"66402":{"id":"66402","name":"Schachverein Turm 25 Bergheim"},"66405":{"id":"66405","name":"Ford-Schachclub Düren 73 e.V."},"66408":{"id":"66408","name":"Schachverein Kermeter 1971"},"66410":{"id":"66410","name":"Schachverein Lendersdorf 57 e.V."},"66411":{"id":"66411","name":"SV Turm 1972 Merzenich"},"66413":{"id":"66413","name":"Schachverein Sindorf 1965"},"66414":{"id":"66414","name":"TUS Strempt e.V."},"66418":{"id":"66418","name":"Schachvereinigung Düren 13 Derichsweiler"},"66420":{"id":"66420","name":"SC Hota 25 Düren e.V."},"66421":{"id":"66421","name":"Sportgem. Spfr. Marmagen-Nettersheim 69"},"66424":{"id":"66424","name":"TTC Schwarz-Weiß Niederembt e.V."},"66425":{"id":"66425","name":"Schachclub Partysan Mödrath e.V."},"66426":{"id":"66426","name":"Zug um Zug Düren e.V."},"66428":{"id":"66428","name":"Turn- und Sportverein Blankenheim 1926 e"},"66501":{"id":"66501","name":"Schachverein Opladen 1922 e.V."},"66502":{"id":"66502","name":"Schachverein Springer 70 Hitdorf e.V."},"66503":{"id":"66503","name":"Schachclub Bayer Leverkusen e.V."},"66505":{"id":"66505","name":"Schachclub Baumberg 1958 e.V."},"66508":{"id":"66508","name":"Schachclub Turm 64 Leichlingen"},"66509":{"id":"66509","name":"Langenfelder Schachfreunde 1933"},"66510":{"id":"66510","name":"Schachvereinigung 1919 Königsspringer Le"},"66512":{"id":"66512","name":"BSW Opladen"},"66514":{"id":"66514","name":"SF Schlebusch"},"66517":{"id":"66517","name":"Schachverein Fideler Bauer Leverkusen"},"70000":{"id":"70000","name":"Niedersächsischer Schachverband"},"70103":{"id":"70103","name":"SF Barsinghausen"},"70105":{"id":"70105","name":"SV Berenbostel"},"70106":{"id":"70106","name":"SK Turm Hannover"},"70107":{"id":"70107","name":"SK Lister Turm"},"70108":{"id":"70108","name":"SV Bückeburg"},"70109":{"id":"70109","name":"SVg Calenberg"},"70110":{"id":"70110","name":"SK Döhren"},"70111":{"id":"70111","name":"SF Eldagsen"},"70115":{"id":"70115","name":"SF Hannover"},"70116":{"id":"70116","name":"SK Anderten"},"70119":{"id":"70119","name":"SV Laatzen"},"70124":{"id":"70124","name":"SK Neustadt"},"70126":{"id":"70126","name":"Hannover 96"},"70127":{"id":"70127","name":"SK Ricklingen"},"70128":{"id":"70128","name":"SV Springe"},"70129":{"id":"70129","name":"SC Stadthagen"},"70130":{"id":"70130","name":"SVg Seeprovinz Steinhude"},"70131":{"id":"70131","name":"SK Stolzenau"},"70132":{"id":"70132","name":"SF Sulingen"},"70134":{"id":"70134","name":"SK Wennigsen"},"70136":{"id":"70136","name":"SG Weiß-Blau Eilenriede"},"70138":{"id":"70138","name":"SF Mühlenberg"},"70139":{"id":"70139","name":"SG Gerbsen/Marienwerder"},"70141":{"id":"70141","name":"Eystruper SK"},"70142":{"id":"70142","name":"BSV Hannovera Gleidingen"},"70144":{"id":"70144","name":"SK Rinteln"},"70148":{"id":"70148","name":"Schachtiger Langenhagen"},"70149":{"id":"70149","name":"TSV Pattensen"},"70153":{"id":"70153","name":"SV Gretenberg"},"70154":{"id":"70154","name":"SC Hämelerwald"},"70156":{"id":"70156","name":"SK Lehrte"},"70157":{"id":"70157","name":"SC Uetze-Hänigsen"},"70158":{"id":"70158","name":"TuS Wunstorf"},"70159":{"id":"70159","name":"Freibauer Wedemark"},"70161":{"id":"70161","name":"Schach-Drachen Isernhagen"},"70167":{"id":"70167","name":"Sportverein Warmsen e.V. von 1948"},"70168":{"id":"70168","name":"TSV Burgdorf"},"70169":{"id":"70169","name":"Schachakademie am Deister e.V."},"70170":{"id":"70170","name":"Schachzentrum Bemerode"},"70202":{"id":"70202","name":"Braunschweiger SF"},"70204":{"id":"70204","name":"Polizei SV Braunschweig"},"70206":{"id":"70206","name":"Blau-Gold Braunschweig"},"70215":{"id":"70215","name":"SK Salzgitter-Bad"},"70217":{"id":"70217","name":"SV Caissa Wolfenbüttel"},"70219":{"id":"70219","name":"Helmstedter SV"},"70220":{"id":"70220","name":"SG Königslutter"},"70221":{"id":"70221","name":"Schöninger SV"},"70222":{"id":"70222","name":"SVg Schöppenstedt"},"70224":{"id":"70224","name":"Peiner SV"},"70230":{"id":"70230","name":"SF Fallersleben"},"70231":{"id":"70231","name":"SV Gifhorn"},"70232":{"id":"70232","name":"SC Wolfsburg"},"70233":{"id":"70233","name":"Schachverein Ölsburg von 1947"},"70234":{"id":"70234","name":"SV Hankensbüttel-Bodenteich"},"70235":{"id":"70235","name":"SF Bleckenstedt"},"70239":{"id":"70239","name":"SV Philippsberg Wolfenbüttel"},"70240":{"id":"70240","name":"SV Apelnstedt"},"70243":{"id":"70243","name":"SG Schöningen JFZ-I e.V."},"70244":{"id":"70244","name":"SV Königsspringer Braunschweig"},"70246":{"id":"70246","name":"SC Braunschweig Gliesmarode v. 1869 e.V."},"70247":{"id":"70247","name":"SVG Salzgitter e.V."},"70248":{"id":"70248","name":"Braunschweiger Schachgarde e.V."},"70300":{"id":"70300","name":"Bezirk 3 Südniedersachsen"},"70301":{"id":"70301","name":"Alfelder SV"},"70303":{"id":"70303","name":"SK Bad Harzburg"},"70304":{"id":"70304","name":"SC Bad Salzdetfurth"},"70306":{"id":"70306","name":"Hildesheimer SV"},"70307":{"id":"70307","name":"SG Holzminden"},"70312":{"id":"70312","name":"Plesse Bovenden"},"70313":{"id":"70313","name":"SK Duderstadt"},"70316":{"id":"70316","name":"SK Goslar"},"70318":{"id":"70318","name":"Hamelner SV"},"70328":{"id":"70328","name":"WSV Clausthal-Zellerfeld"},"70331":{"id":"70331","name":"Einbecker SC"},"70332":{"id":"70332","name":"SK Turm Vienenburg"},"70333":{"id":"70333","name":"SV Grün-Weiß Parensen"},"70335":{"id":"70335","name":"SK Gronau"},"70338":{"id":"70338","name":"MTV Bad Gandersheim"},"70339":{"id":"70339","name":"SC Tempo Göttingen"},"70344":{"id":"70344","name":"SV Osterode-Südharz"},"70345":{"id":"70345","name":"ESV Rot-Weiß Göttingen"},"70346":{"id":"70346","name":"SC Schwarz-Weiß Northeim"},"70347":{"id":"70347","name":"VfL Oker"},"70349":{"id":"70349","name":"SC Langelsheim"},"70350":{"id":"70350","name":"SK Bad Lauterberg"},"70351":{"id":"70351","name":"Post SV Bad Pyrmont"},"70352":{"id":"70352","name":"KSV Rochade Göttingen"},"70403":{"id":"70403","name":"SC Bremervörde"},"70404":{"id":"70404","name":"Blau-Weiss Buchholz"},"70408":{"id":"70408","name":"MTV Dannenberg"},"70410":{"id":"70410","name":"SVg Böhmetal"},"70417":{"id":"70417","name":"TV Meckelfeld"},"70418":{"id":"70418","name":"TSV Neuhaus (Oste)"},"70419":{"id":"70419","name":"SK Springer Rotenburg"},"70422":{"id":"70422","name":"Stader SV"},"70423":{"id":"70423","name":"SC Sottrum"},"70424":{"id":"70424","name":"Post SV Uelzen"},"70425":{"id":"70425","name":"SK Celle-Westercelle e.V."},"70426":{"id":"70426","name":"SV Winsen (Luhe) von 1929 e.V."},"70431":{"id":"70431","name":"TSV Bienenbüttel"},"70432":{"id":"70432","name":"MTV Tostedt"},"70435":{"id":"70435","name":"Caissa Schwarmstedt"},"70436":{"id":"70436","name":"Bleckeder SC"},"70439":{"id":"70439","name":"SAbt MTV Salzhausen"},"70441":{"id":"70441","name":"SC 81 Schneverdingen"},"70442":{"id":"70442","name":"SK Verden"},"70444":{"id":"70444","name":"SV Wesel"},"70446":{"id":"70446","name":"Schachkreis Unterlüß"},"70449":{"id":"70449","name":"TSV Gnarrenburg"},"70451":{"id":"70451","name":"TSV Hitzacker"},"70453":{"id":"70453","name":"TSV Wietzendorf"},"70454":{"id":"70454","name":"Breloher SC"},"70455":{"id":"70455","name":"SF Buxtehude"},"70459":{"id":"70459","name":"FC Lachendorf"},"70460":{"id":"70460","name":"MTV \"Fichte\" Winsen"},"70461":{"id":"70461","name":"Jorker SV"},"70462":{"id":"70462","name":"SC Hambühren"},"70464":{"id":"70464","name":"SC Langlingen"},"70466":{"id":"70466","name":"SV Bad Bevensen"},"70469":{"id":"70469","name":"SK Hermannsburg"},"70470":{"id":"70470","name":"SK Soltau"},"70471":{"id":"70471","name":"SK Cuxhaven"},"70472":{"id":"70472","name":"TSV Germania Cadenberge"},"70476":{"id":"70476","name":"SC Turm Lüneburg e.V."},"70477":{"id":"70477","name":"FG Wohlde v. 76 e.V."},"70500":{"id":"70500","name":"Bezirk 5 Oldenburg-Ostfriesland"},"70501":{"id":"70501","name":"SC Aurich"},"70503":{"id":"70503","name":"SV Butjadingen"},"70504":{"id":"70504","name":"SC Cloppenburg"},"70505":{"id":"70505","name":"SK Königsspringer Emden"},"70507":{"id":"70507","name":"SK Jever"},"70509":{"id":"70509","name":"SF Lohne"},"70510":{"id":"70510","name":"SK Haseturm Löningen"},"70514":{"id":"70514","name":"SK Union Oldenburg"},"70515":{"id":"70515","name":"SC Papenburg"},"70516":{"id":"70516","name":"SF Quakenbrück"},"70517":{"id":"70517","name":"SK Weißer Turm Rastede"},"70519":{"id":"70519","name":"SK Varel"},"70520":{"id":"70520","name":"SV Kaponier Vechta"},"70522":{"id":"70522","name":"Wilhelmshavener SC von 1887 e. V."},"70526":{"id":"70526","name":"SC Schw. Springer Bad Zwischenahn"},"70527":{"id":"70527","name":"Fehntjer SK"},"70528":{"id":"70528","name":"SV Esens"},"70529":{"id":"70529","name":"SK Wildeshausen"},"70531":{"id":"70531","name":"SC Hümmling"},"70538":{"id":"70538","name":"SC Schortens"},"70544":{"id":"70544","name":"SC Königsspringer Völlen"},"70547":{"id":"70547","name":"SC Dünsen"},"70552":{"id":"70552","name":"SC Ganderkesee"},"70553":{"id":"70553","name":"SV Norden"},"70554":{"id":"70554","name":"SG Diepholz"},"70557":{"id":"70557","name":"VfR Heisfelde e.V."},"70558":{"id":"70558","name":"Schachgesellschaft Barnstorf"},"70559":{"id":"70559","name":"Spielklub Papenburg 2008 e.V."},"70560":{"id":"70560","name":"TSV Neubruchhausen"},"70600":{"id":"70600","name":"Bezirk 6 Osnabrück-Emsland"},"70601":{"id":"70601","name":"TuS Bramsche"},"70604":{"id":"70604","name":"Hagener SV"},"70605":{"id":"70605","name":"SV Hellern"},"70606":{"id":"70606","name":"SC Rochade Hollage"},"70607":{"id":"70607","name":"SV Bad Bentheim"},"70608":{"id":"70608","name":"SG Osnabrück"},"70609":{"id":"70609","name":"SV Lingen"},"70610":{"id":"70610","name":"SG Oesede-Georgsmarienhütte"},"70611":{"id":"70611","name":"SV Osnabrück"},"70612":{"id":"70612","name":"SK Rulle"},"70614":{"id":"70614","name":"SK Meppen"},"70615":{"id":"70615","name":"SF Nordhorn"},"70616":{"id":"70616","name":"SK Nordhorn-Blanke"},"70617":{"id":"70617","name":"SV Veldhausen 07"},"70618":{"id":"70618","name":"SC Dissen-Bad Rothenfelde"},"70619":{"id":"70619","name":"SF St.Johannes Spelle"},"70620":{"id":"70620","name":"SVg Gaste-Hasbergen"},"70621":{"id":"70621","name":"SC Fürstenau"},"70627":{"id":"70627","name":"SG Ankum/Bersenbrück"},"70629":{"id":"70629","name":"SV Olympia Uelsen"},"70630":{"id":"70630","name":"TSV Riemsloh"},"70634":{"id":"70634","name":"SV Union Lohne"},"70636":{"id":"70636","name":"TSV Osnabrück"},"70638":{"id":"70638","name":"Nordhorner SV Cervisia 94 e.V."},"70642":{"id":"70642","name":"SV Bad Essen"},"70645":{"id":"70645","name":"TuS Aschendorf"},"70649":{"id":"70649","name":"SC Hasetal Herzlake"},"81101":{"id":"81101","name":"SV Andernach"},"81102":{"id":"81102","name":"SC Springer Kruft"},"81103":{"id":"81103","name":"Sfr. Freibauer Bad Breisig 01"},"81104":{"id":"81104","name":"SV Mendig-Mayen e.V."},"81105":{"id":"81105","name":"SV Kalenborn"},"81107":{"id":"81107","name":"SC TS Polch"},"81108":{"id":"81108","name":"SC Brohltal Weibern"},"81109":{"id":"81109","name":"SC Cochem"},"81110":{"id":"81110","name":"SC 1924 Kettig"},"81112":{"id":"81112","name":"SF Nickenich"},"81114":{"id":"81114","name":"SV Urmitz"},"81115":{"id":"81115","name":"HTC Bad Neuenahr"},"81116":{"id":"81116","name":"SC 1950 Remagen"},"81117":{"id":"81117","name":"SF Sinzig"},"81118":{"id":"81118","name":"TC Grafschaft"},"81119":{"id":"81119","name":"Schachfreunde Ochtendung"},"81201":{"id":"81201","name":"SC Einrich"},"81202":{"id":"81202","name":"SG Boppard/BS/W"},"81203":{"id":"81203","name":"SC Hennweiler"},"81204":{"id":"81204","name":"SC Idar-Oberstein"},"81205":{"id":"81205","name":"SV Turm Lahnstein"},"81206":{"id":"81206","name":"SV Koblenz 03/25"},"81207":{"id":"81207","name":"SF  Birkenfeld"},"81208":{"id":"81208","name":"Gambit Leideneck"},"81209":{"id":"81209","name":"SG Mörsdorf-Lahr"},"81210":{"id":"81210","name":"DJK Oberwesel"},"81214":{"id":"81214","name":"SSG Hunsrück"},"81215":{"id":"81215","name":"Kreuznacher SV 1921 e.V."},"81217":{"id":"81217","name":"VfR.Baumholder"},"81218":{"id":"81218","name":"SG Güls/Niederfell"},"81224":{"id":"81224","name":"SC Nastätten"},"81226":{"id":"81226","name":"SG Pieroth/Burg Layen"},"81229":{"id":"81229","name":"VfR-SC Koblenz"},"81230":{"id":"81230","name":"SC Eckersweiler"},"81231":{"id":"81231","name":"SC Koblenz 1955 e. V."},"81301":{"id":"81301","name":"SK Engers"},"81302":{"id":"81302","name":"SF Bad Hönningen"},"81306":{"id":"81306","name":"SC Heimbach-Weis/Neuwied"},"81308":{"id":"81308","name":"SC 1926 Bendorf"},"81309":{"id":"81309","name":"SF Hillscheid"},"81310":{"id":"81310","name":"SV Spr.Siershahn"},"81312":{"id":"81312","name":"Uhrturm Dierdorf"},"81316":{"id":"81316","name":"SG Rheinbreitbach-Linz"},"81317":{"id":"81317","name":"SK Altenkirchen"},"81318":{"id":"81318","name":"SF 1979 Asbacher-Land"},"81319":{"id":"81319","name":"SF 1982 Ötzingen"},"81321":{"id":"81321","name":"SC 1981 Ehlscheid"},"81322":{"id":"81322","name":"Sfr.Hachenburg"},"81501":{"id":"81501","name":"Sfr.Bitburg 1958"},"81502":{"id":"81502","name":"SC Jünkerath"},"81503":{"id":"81503","name":"Sfr.Saarburg-Trier"},"81504":{"id":"81504","name":"SC Gardez Hermeskeil"},"81505":{"id":"81505","name":"SV Kell 1920"},"81506":{"id":"81506","name":"SG Reil-Kinheim"},"81507":{"id":"81507","name":"Sfr.Konz-Karthaus"},"81508":{"id":"81508","name":"SC 1948 Prüm"},"81510":{"id":"81510","name":"SK Schweich"},"81511":{"id":"81511","name":"SK Speicher 1975"},"81515":{"id":"81515","name":"SC Wittlich 1947"},"81517":{"id":"81517","name":"SK Zewen 1975"},"81518":{"id":"81518","name":"SC Trittenheim 1979"},"81519":{"id":"81519","name":"PST-Trier"},"81521":{"id":"81521","name":"SG Bernkastel-Kues Traben Trabach"},"81523":{"id":"81523","name":"Bauer Bollendorf"},"81528":{"id":"81528","name":"SG Trier"},"81529":{"id":"81529","name":"Gambit Gusenburg"},"81535":{"id":"81535","name":"Schachakademie Trier"},"82001":{"id":"82001","name":"SV Alzey"},"82003":{"id":"82003","name":"SV Pfeddersheim"},"82006":{"id":"82006","name":"SC Landskrone"},"82009":{"id":"82009","name":"SC Wörrstadt"},"82010":{"id":"82010","name":"SK Bingen"},"82011":{"id":"82011","name":"SV Bodenheim"},"82012":{"id":"82012","name":"SC Budenheim"},"82015":{"id":"82015","name":"SK Gau-Algesheim"},"82018":{"id":"82018","name":"Sfr.Heidesheim"},"82019":{"id":"82019","name":"Sfr.Heimersheim"},"82023":{"id":"82023","name":"Sfr.Mainz 1928"},"82024":{"id":"82024","name":"TSV Schott Mainz"},"82025":{"id":"82025","name":"SV Mainz-Mombach"},"82027":{"id":"82027","name":"SV Multatuli Ingelheim e.V."},"82028":{"id":"82028","name":"SC Lerchenberg/ZMO"},"82029":{"id":"82029","name":"Vorw.Orient Mainz"},"83101":{"id":"83101","name":"SC Hauptstuhl"},"83103":{"id":"83103","name":"SV Fischbach"},"83106":{"id":"83106","name":"SK Eisenberg 1923"},"83107":{"id":"83107","name":"SK Kirchheimbolanden"},"83109":{"id":"83109","name":"SC 1975 Bann"},"83110":{"id":"83110","name":"SK Enkenbach"},"83112":{"id":"83112","name":"SK Erfenbach"},"83113":{"id":"83113","name":"TV Winnweiler"},"83114":{"id":"83114","name":"SG Kaiserslautern 1905"},"83116":{"id":"83116","name":"Post SG Kaiserslautern"},"83120":{"id":"83120","name":"SC Niederkirchen"},"83121":{"id":"83121","name":"SV Otterberg 1909"},"83201":{"id":"83201","name":"SK 1912 Ludwigshafen"},"83202":{"id":"83202","name":"SK Altrip"},"83203":{"id":"83203","name":"ESV 1927 Ludwigshafen"},"83204":{"id":"83204","name":"TSG Mutterstadt"},"83208":{"id":"83208","name":"Schachhaus Ludwigshafen"},"83209":{"id":"83209","name":"SF Limburgerhof"},"83210":{"id":"83210","name":"SC 1997 Lambsheim"},"83212":{"id":"83212","name":"SK Frankenthal"},"83213":{"id":"83213","name":"SK Bobenheim-Roxheim"},"83214":{"id":"83214","name":"TG Waldsee"},"83215":{"id":"83215","name":"SV Worms 1878"},"83301":{"id":"83301","name":"Post SV Neustadt"},"83304":{"id":"83304","name":"SC 1926 Haßloch"},"83305":{"id":"83305","name":"SC Schifferstadt"},"83306":{"id":"83306","name":"TSG Deidesheim"},"83307":{"id":"83307","name":"SK Freinsheim"},"83308":{"id":"83308","name":"SC Bad Dürkheim"},"83309":{"id":"83309","name":"TSG 1861 Grünstadt"},"83401":{"id":"83401","name":"SC Bad Bergzabern"},"83402":{"id":"83402","name":"SC Bellheim"},"83403":{"id":"83403","name":"SC Hagenbach"},"83404":{"id":"83404","name":"SC Herxheim"},"83405":{"id":"83405","name":"SC Neuburg"},"83407":{"id":"83407","name":"SC Rülzheim"},"83408":{"id":"83408","name":"SC Sondernheim"},"83410":{"id":"83410","name":"SK Landau"},"83411":{"id":"83411","name":"Caissa Jockgrim"},"83413":{"id":"83413","name":"Turm Kandel"},"83414":{"id":"83414","name":"SK Maxau-Wörth"},"83415":{"id":"83415","name":"SC Schwegenheim"},"83416":{"id":"83416","name":"SC 1983 Westheim"},"83501":{"id":"83501","name":"SF Althornbach"},"83503":{"id":"83503","name":"SK Dahn"},"83505":{"id":"83505","name":"SK 1972 Hauenstein"},"83507":{"id":"83507","name":"SC Höheinöd"},"83508":{"id":"83508","name":"SC Pirmasens 1912"},"83510":{"id":"83510","name":"Sfr.95 Pirmasens-Ruhbank"},"83511":{"id":"83511","name":"SK Zweibrücken"},"83512":{"id":"83512","name":"FC Fischbach"},"83513":{"id":"83513","name":"SC Fehrbach"},"83601":{"id":"83601","name":"SC Ramstein-Miesenbach"},"83603":{"id":"83603","name":"SC Weilerbach"},"83605":{"id":"83605","name":"SC Ohmbach"},"83613":{"id":"83613","name":"TSV Hütschenhausen"},"83614":{"id":"83614","name":"SC Rammelsbach"},"83615":{"id":"83615","name":"SK Schönenberg"},"83616":{"id":"83616","name":"SK Lauterecken 1963"},"83617":{"id":"83617","name":"SC Mackenbach"},"83618":{"id":"83618","name":"SC Thallichtenberg"},"83619":{"id":"83619","name":"SC Niedermohr"},"83621":{"id":"83621","name":"SC Reichenbach"},"83623":{"id":"83623","name":"SC Königsland Wolfstein"},"90001":{"id":"90001","name":"SF Alsweiler-Marpingen"},"90002":{"id":"90002","name":"SGem Bexbach"},"90004":{"id":"90004","name":"SF Bliestal"},"90008":{"id":"90008","name":"SAbt DJK Eintracht Dillingen"},"90010":{"id":"90010","name":"SC 1920 Dudweiler-Herrensohr"},"90011":{"id":"90011","name":"SAbt Kulturgemeinde Jägersburg"},"90012":{"id":"90012","name":"SC Aljechin Emmersweiler 1985"},"90013":{"id":"90013","name":"SG 1927 Ensdorf"},"90014":{"id":"90014","name":"SC 1928 Eppelborn"},"90015":{"id":"90015","name":"SC 1913 Fischbach e.V."},"90018":{"id":"90018","name":"SC Reti Heusweiler"},"90020":{"id":"90020","name":"SV 1932 Homburg-Erbach"},"90023":{"id":"90023","name":"SF 1957 Hülzweiler e.V."},"90025":{"id":"90025","name":"SC Turm Illingen"},"90026":{"id":"90026","name":"SC Lebach 1975 e.V."},"90027":{"id":"90027","name":"SGes Merzig 1896"},"90029":{"id":"90029","name":"SV Steinitz Püttlingen"},"90032":{"id":"90032","name":"SV Riegelsberg 1926"},"90034":{"id":"90034","name":"SC Ostertal e.V."},"90036":{"id":"90036","name":"SC Turm Siersburg 1975 e.V."},"90037":{"id":"90037","name":"SC Saarwellingen"},"90038":{"id":"90038","name":"SC Sulzbach"},"90039":{"id":"90039","name":"SV Schiffweiler"},"90040":{"id":"90040","name":"SC Rochade Saarlouis 1993 e.V."},"90041":{"id":"90041","name":"Saarbrücker Gambit 89 e.V."},"90042":{"id":"90042","name":"SC Caissa Schwarzenbach"},"90043":{"id":"90043","name":"SC Anderssen St.Ingbert 1920 e.V."},"90044":{"id":"90044","name":"SC GEMA St.Ingbert"},"90045":{"id":"90045","name":"SV Königskrone Hülzweiler e.V."},"90047":{"id":"90047","name":"Turm Wadern"},"90050":{"id":"90050","name":"SC Turm Winterbach"},"90051":{"id":"90051","name":"SV Saarbrücken 1970 e.V."},"90052":{"id":"90052","name":"SVg Saarlouis e.V. 1985"},"90053":{"id":"90053","name":"SV Schwalbach"},"90057":{"id":"90057","name":"LaskerKirkel"},"90058":{"id":"90058","name":"En Passant Völklingen 1994 e.V."},"90059":{"id":"90059","name":"SF St.Wendel e.V."},"90060":{"id":"90060","name":"SF Wiesbach"},"90062":{"id":"90062","name":"SC Wustweiler"},"90063":{"id":"90063","name":"SF Wadgassen/Differten e.V."},"90064":{"id":"90064","name":"SV Merchweiler-Wemmetsweiler"},"90065":{"id":"90065","name":"SC Völklingen 1921 e.V."},"ZPS":{"id":"ZPS","name":"Vereinname"},"10A01":{"id":"10A01","name":"SK ST Georgen"},"10A03":{"id":"10A03","name":"SC Bad Dürrheim 86"},"10A04":{"id":"10A04","name":"SF Furtwangen-Vöhrenbach"},"10A05":{"id":"10A05","name":"SC Donaueschingen"},"10A06":{"id":"10A06","name":"SC Bräunlingen"},"10A07":{"id":"10A07","name":"SK Villingen"},"10A09":{"id":"10A09","name":"SV Schwenningen 1906 e.V."},"10A10":{"id":"10A10","name":"SC \"e1\" Königsfeld"},"10A11":{"id":"10A11","name":"SK Neustadt"},"10A12":{"id":"10A12","name":"SK Schonach"},"10B01":{"id":"10B01","name":"SC Pfullendorf"},"10B02":{"id":"10B02","name":"SK Singen"},"10B03":{"id":"10B03","name":"SK Meßkirch"},"10B04":{"id":"10B04","name":"SK Engen"},"10B07":{"id":"10B07","name":"SK Radolfzell"},"10B08":{"id":"10B08","name":"SF Gottmadingen"},"10B09":{"id":"10B09","name":"SVG Konstanz"},"10B11":{"id":"10B11","name":"SC Überlingen"},"10B12":{"id":"10B12","name":"SK Gaienhofen"},"10B13":{"id":"10B13","name":"SC Steißlingen"},"5A001":{"id":"5A001","name":"Sges Bensheim 1931"},"5A002":{"id":"5A002","name":"SK Bickenbach"},"5A003":{"id":"5A003","name":"Sfr. Bürstadt"},"5A004":{"id":"5A004","name":"SK 1947 Einhausen"},"5A005":{"id":"5A005","name":"SK 1945 Fürth"},"5A006":{"id":"5A006","name":"Sfr. Heppenheim"},"5A007":{"id":"5A007","name":"Freibauer Mörlenbach-Birkenau"},"5A009":{"id":"5A009","name":"SV Reichenbach"},"5A010":{"id":"5A010","name":"SC 1970 Lorsch"},"5A012":{"id":"5A012","name":"SAbt TG 1886 Rimbach"},"5A014":{"id":"5A014","name":"SV Biblis"},"5A015":{"id":"5A015","name":"SC 1987 Hofheim/Ried"},"A0101":{"id":"A0101","name":"Flensburger SK von 1876"},"A0102":{"id":"A0102","name":"Eckernförder SC von 1921"},"A0103":{"id":"A0103","name":"Husumer SV von 1898"},"A0104":{"id":"A0104","name":"MTV Leck von 1889"},"A0106":{"id":"A0106","name":"TSV Rot-Weiß Niebüll"},"A0107":{"id":"A0107","name":"Schleswiger SV von 1919"},"A0109":{"id":"A0109","name":"Bredstedter SK von 1947"},"A0112":{"id":"A0112","name":"SC Schleispringer Kappeln"},"A0114":{"id":"A0114","name":"Kropper SC von 1981"},"A0116":{"id":"A0116","name":"TSV Amrum"},"A0117":{"id":"A0117","name":"SC Tönning"},"A0118":{"id":"A0118","name":"Wyker TB"},"A0119":{"id":"A0119","name":"SV VHS Rendsburg"},"A0202":{"id":"A0202","name":"Barmstedter MTV"},"A0203":{"id":"A0203","name":"SK Brunsbüttel von 1925"},"A0204":{"id":"A0204","name":"SF Burg von 1966"},"A0205":{"id":"A0205","name":"SV Büsum"},"A0206":{"id":"A0206","name":"SG Glückstadt von 1920"},"A0207":{"id":"A0207","name":"SC Lunden"},"A0208":{"id":"A0208","name":"SV Heide"},"A020A":{"id":"A020A","name":"SV Brokdorf von 1984 e. V."},"A020B":{"id":"A020B","name":"ABC Wesseln"},"A0210":{"id":"A0210","name":"SC Hohenlockstedt"},"A0211":{"id":"A0211","name":"Itzehoer SV von 1923"},"A0212":{"id":"A0212","name":"SK Kollmar"},"A0213":{"id":"A0213","name":"SV Merkur Hademarschen"},"A0214":{"id":"A0214","name":"SC Marne"},"A0216":{"id":"A0216","name":"SC Uetersen"},"A0219":{"id":"A0219","name":"SV Holstein Quickborn"},"A0220":{"id":"A0220","name":"SC Wrist-Kellinghusen von 1979"},"A0221":{"id":"A0221","name":"Elmshorner SC von 1896"},"A0401":{"id":"A0401","name":"VfL Geesthacht von 1970"},"A0402":{"id":"A0402","name":"Verein Segeberger SF"},"A0403":{"id":"A0403","name":"Möllner SV"},"A0404":{"id":"A0404","name":"Schwarzenbeker SK"},"A0405":{"id":"A0405","name":"Lauenburger SV"},"A0407":{"id":"A0407","name":"SC Turm Reinfeld"},"A0408":{"id":"A0408","name":"SV Bad Oldesloe"},"A0409":{"id":"A0409","name":"SG Glinde"},"A0410":{"id":"A0410","name":"Ratzeburger SC Inselspringer"},"A0411":{"id":"A0411","name":"Schachclub Barsbüttel e. V."},"A0412":{"id":"A0412","name":"SK Norderstedt von 1975"},"A0413":{"id":"A0413","name":"SK Kaltenkirchen"},"A0414":{"id":"A0414","name":"SV Henstedt-Ulzburg e. V."},"A0415":{"id":"A0415","name":"SV Bargteheide"},"A0421":{"id":"A0421","name":"TSV Trittau"},"A0423":{"id":"A0423","name":"TuRa Harksheide von 1945 Norderstedt e."},"A0424":{"id":"A0424","name":"Ahrensburger TSV"},"A0501":{"id":"A0501","name":"Lübecker SV von 1873"},"A0504":{"id":"A0504","name":"SV Bad Schwartau von 1930"},"A0505":{"id":"A0505","name":"TSV Travemünde von 1860"},"A0506":{"id":"A0506","name":"SV Strand von 1974"},"A050A":{"id":"A050A","name":"Schach bei Mädler"},"A0510":{"id":"A0510","name":"TSV Kücknitz von 1911"},"A0511":{"id":"A0511","name":"SV Eutin von 1875"},"A0512":{"id":"A0512","name":"SF Neustadt"},"A0513":{"id":"A0513","name":"SC Fehmarn"},"A0601":{"id":"A0601","name":"Kieler SG von 1884 / Meerbauer"},"A0602":{"id":"A0602","name":"SG Turm Kiel von 1910"},"A0603":{"id":"A0603","name":"SG Kiel Ost von 1952 e. V."},"A0605":{"id":"A0605","name":"SVG Friedrichsort"},"A0606":{"id":"A0606","name":"VSF Flintbek"},"A0608":{"id":"A0608","name":"SC Agon Neumünster"},"A0609":{"id":"A0609","name":"TuS Holtenau"},"A0610":{"id":"A0610","name":"NDTSV Holsatia Kiel"},"A0612":{"id":"A0612","name":"TSV Klausdorf"},"A0613":{"id":"A0613","name":"SG Plöner See"},"A0614":{"id":"A0614","name":"Preetzer TSV"},"A0615":{"id":"A0615","name":"SG Phönix Gettorf von 1984 e. V."},"A0616":{"id":"A0616","name":"SC Schönberg"},"A0620":{"id":"A0620","name":"Raisdorfer SG von 1976"},"A0626":{"id":"A0626","name":"SG Neumünster"},"A0628":{"id":"A0628","name":"Heikendorfer SV"},"A0631":{"id":"A0631","name":"SC Fördespringer Schönkirchen"},"A0632":{"id":"A0632","name":"TSV Hessenstein"},"A0633":{"id":"A0633","name":"SK Doppelbauer Kiel"},"A0634":{"id":"A0634","name":"SC Bobbyfischermensfriends NMS"},"B0000":{"id":"B0000","name":"Landesschachbund Bremen"},"B0001":{"id":"B0001","name":"SF Achim"},"B0003":{"id":"B0003","name":"Bremer SG von 1877"},"B0005":{"id":"B0005","name":"Delmenhorster SK V 1931"},"B0007":{"id":"B0007","name":"Findorffer Sfr"},"B0012":{"id":"B0012","name":"SF Leherheide von 1950"},"B0013":{"id":"B0013","name":"SGM Lemwerder"},"B0014":{"id":"B0014","name":"SF Lilienthal von 1971"},"B0016":{"id":"B0016","name":"SK Bremen-Nord"},"B0018":{"id":"B0018","name":"SK Bremen-West"},"B0020":{"id":"B0020","name":"Sfr.Osterholz-Scharmbeck"},"B0021":{"id":"B0021","name":"SK Schwanewede"},"B0022":{"id":"B0022","name":"SC Vahr"},"B0023":{"id":"B0023","name":"SAbt SV Werder Bremen"},"B0027":{"id":"B0027","name":"SC Kattenesch e.V."},"B0029":{"id":"B0029","name":"SAbt TV Arbergen"},"B0031":{"id":"B0031","name":"SAbt TuS Varrel"},"B0032":{"id":"B0032","name":"SAbt TuS Syke"},"B0034":{"id":"B0034","name":"SSG Stotel/Loxstedt"},"B0036":{"id":"B0036","name":"SAbt TV Eiche Horn"},"B0037":{"id":"B0037","name":"Osterholz-Tenever e. V."},"B0038":{"id":"B0038","name":"SF Bremer Osten Bürgerhaus Mahndorf e. V"},"C0101":{"id":"C0101","name":"SAbt Post-SV Ulm"},"C0102":{"id":"C0102","name":"SK Markdorf"},"C0104":{"id":"C0104","name":"SF Vöhringen"},"C0105":{"id":"C0105","name":"SAbt TSV Langenau"},"C0106":{"id":"C0106","name":"SC Lindau"},"C0107":{"id":"C0107","name":"SF Blaustein"},"C0108":{"id":"C0108","name":"SK Lindenberg"},"C0109":{"id":"C0109","name":"SC Obersulmetingen"},"C010A":{"id":"C010A","name":"TSG Ehingen 1848 e.V."},"C0110":{"id":"C0110","name":"TSV Berghülen"},"C0111":{"id":"C0111","name":"SC Tettnang"},"C0112":{"id":"C0112","name":"SC Wangen"},"C0113":{"id":"C0113","name":"TSV Laichingen"},"C0114":{"id":"C0114","name":"SV Friedrichshafen"},"C0115":{"id":"C0115","name":"SF Ravensburg"},"C0116":{"id":"C0116","name":"TG Biberach"},"C0117":{"id":"C0117","name":"SF Wetzisreute"},"C0118":{"id":"C0118","name":"TSV 1880 Neu-Ulm"},"C0120":{"id":"C0120","name":"SF Mengen"},"C0121":{"id":"C0121","name":"SV Weingarten"},"C0122":{"id":"C0122","name":"SK Leutkirch"},"C0124":{"id":"C0124","name":"SC Laupheim 1962 e.V."},"C0125":{"id":"C0125","name":"SF Riedlingen"},"C0127":{"id":"C0127","name":"TSV Seissen e.V."},"C0130":{"id":"C0130","name":"SC Bad Schussenried e.V."},"C0131":{"id":"C0131","name":"SC Weisse Dame Ulm e.V."},"C0132":{"id":"C0132","name":"SC Bad Saulgau"},"C0133":{"id":"C0133","name":"SC Weiler im Allgäu e. V."},"C0137":{"id":"C0137","name":"SV Jedesheim 1921"},"C0138":{"id":"C0138","name":"TV Wiblingen"},"C0139":{"id":"C0139","name":"SV Steinhausen"},"C0140":{"id":"C0140","name":"TSV Reute e.V."},"C0141":{"id":"C0141","name":"SF Ertingen"},"C0142":{"id":"C0142","name":"TSV Westerstetten"},"C0143":{"id":"C0143","name":"SV Thalfingen"},"C0202":{"id":"C0202","name":"SV Balingen"},"C0203":{"id":"C0203","name":"SC Bisingen-Steinhofen"},"C0204":{"id":"C0204","name":"SF Burladingen"},"C0205":{"id":"C0205","name":"SF Geislingen 1990 e.V."},"C0206":{"id":"C0206","name":"SG Turm Albstadt 1902 e.V."},"C0209":{"id":"C0209","name":"SC Hechingen"},"C0210":{"id":"C0210","name":"SC Heinstetten"},"C0211":{"id":"C0211","name":"SK Horb"},"C0212":{"id":"C0212","name":"SC Klosterreichenbach"},"C0215":{"id":"C0215","name":"SC Möhringen 1961"},"C0216":{"id":"C0216","name":"SG Donautal Tuttlingen"},"C0218":{"id":"C0218","name":"SC Nusplingen"},"C0219":{"id":"C0219","name":"SC Oberndorf"},"C0220":{"id":"C0220","name":"SC Rangendingen"},"C0222":{"id":"C0222","name":"SV Rottweil"},"C0226":{"id":"C0226","name":"SR Spaichingen"},"C0228":{"id":"C0228","name":"SV Stockenhausen-Frommern"},"C0230":{"id":"C0230","name":"SR Heuberg-Gosheim"},"C0232":{"id":"C0232","name":"SV Trossingen"},"C0234":{"id":"C0234","name":"SV KJ Schwenningen"},"C0235":{"id":"C0235","name":"SV Winterlingen"},"C0237":{"id":"C0237","name":"SV Schömberg e.V."},"C0238":{"id":"C0238","name":"SF Pfalzgrafenweiler"},"C0241":{"id":"C0241","name":"SG Dotternhausen"},"C0242":{"id":"C0242","name":"SG Schramberg-Lauterbach"},"C0300":{"id":"C0300","name":"Neckar-Fils"},"C0301":{"id":"C0301","name":"SV Altbach e.V."},"C0302":{"id":"C0302","name":"Schachgemeinschaft Filder"},"C0303":{"id":"C0303","name":"SF Deizisau"},"C0304":{"id":"C0304","name":"TSV Denkendorf"},"C0305":{"id":"C0305","name":"SV Dicker Turm Esslingen"},"C0306":{"id":"C0306","name":"TSV/RSK Esslingen"},"C0307":{"id":"C0307","name":"TSG Esslingen"},"C0308":{"id":"C0308","name":"TSV Grafenberg"},"C030A":{"id":"C030A","name":"Schach-Kids Bernhausen e.V."},"C0310":{"id":"C0310","name":"SF Nabern"},"C0311":{"id":"C0311","name":"SF 47 Neckartenzlingen"},"C0312":{"id":"C0312","name":"SC Ostfildern 1952 e.V."},"C0313":{"id":"C0313","name":"SV Nürtingen 1920"},"C0314":{"id":"C0314","name":"SF Plochingen"},"C0316":{"id":"C0316","name":"SV 1947 Wendlingen"},"C0318":{"id":"C0318","name":"SK Wernau"},"C0322":{"id":"C0322","name":"SV Ebersbach"},"C0324":{"id":"C0324","name":"SV Faurndau"},"C0325":{"id":"C0325","name":"SC Geislingen 1881"},"C0327":{"id":"C0327","name":"SF 1876 Göppingen"},"C0328":{"id":"C0328","name":"SC Kirchheim/Teck"},"C0330":{"id":"C0330","name":"TSG Salach"},"C0332":{"id":"C0332","name":"SV Uhingen"},"C0334":{"id":"C0334","name":"SV Urach"},"C0335":{"id":"C0335","name":"SF Ammerbuch"},"C0336":{"id":"C0336","name":"SV Dettingen Erms"},"C0338":{"id":"C0338","name":"SC BW Kirchentellinsfurt"},"C0339":{"id":"C0339","name":"Rochade Metzingen e.V."},"C0344":{"id":"C0344","name":"SF Pfullingen"},"C0345":{"id":"C0345","name":"SV Pliezhausen"},"C0346":{"id":"C0346","name":"SV Reutlingen"},"C0349":{"id":"C0349","name":"SC Steinlach"},"C0350":{"id":"C0350","name":"SV Tübingen 1870 e.V."},"C0351":{"id":"C0351","name":"TSG Zell u.a."},"C0354":{"id":"C0354","name":"SF Springer Rottenburg"},"C0355":{"id":"C0355","name":"SF Lichtenstein"},"C0356":{"id":"C0356","name":"SG Schönbuch"},"C0357":{"id":"C0357","name":"SK Bebenhausen 1992"},"C0358":{"id":"C0358","name":"Schwarz Weiß Münsingen"},"C0359":{"id":"C0359","name":"Ssg Fils-Lauter e. V."},"C0361":{"id":"C0361","name":"SG Königskinder Hohentübingen e.V."},"C0401":{"id":"C0401","name":"SV Aalen"},"C0402":{"id":"C0402","name":"SC Tannhausen 1986 e.V."},"C0403":{"id":"C0403","name":"SV Unterkochen"},"C0405":{"id":"C0405","name":"SV Crailsheim"},"C0406":{"id":"C0406","name":"SC 1875 Ellwangen"},"C0408":{"id":"C0408","name":"SV Giengen"},"C0409":{"id":"C0409","name":"SC Grunbach"},"C0410":{"id":"C0410","name":"SK Heidenheim"},"C0412":{"id":"C0412","name":"SC Heidenheim - Schnaitheim"},"C0413":{"id":"C0413","name":"SF Heubach"},"C0414":{"id":"C0414","name":"RSV Heuchlingen"},"C0415":{"id":"C0415","name":"SF Königsbronn"},"C0416":{"id":"C0416","name":"SC Leinzell"},"C0417":{"id":"C0417","name":"Schachmatt Schorndorf eV"},"C0418":{"id":"C0418","name":"SF 90 Spraitbach e.V."},"C0419":{"id":"C0419","name":"SV Oberkochen"},"C0420":{"id":"C0420","name":"SC Plüderhausen"},"C0421":{"id":"C0421","name":"SV Schorndorf"},"C0422":{"id":"C0422","name":"SG Schwäbisch Gmünd 1872 e.V"},"C0424":{"id":"C0424","name":"SG Bettringen"},"C0425":{"id":"C0425","name":"SV Hussenhofen"},"C0426":{"id":"C0426","name":"SK Sontheim/Brenz e.V."},"C0427":{"id":"C0427","name":"TSF Welzheim"},"C0431":{"id":"C0431","name":"SC Rainau"},"C0433":{"id":"C0433","name":"SF Waldstetten 1982"},"C0436":{"id":"C0436","name":"SC Bopfingen e.V."},"C0438":{"id":"C0438","name":"SV Königsspringer Stödtlen"},"C0439":{"id":"C0439","name":"TSV Alfdorf e.V."},"C0501":{"id":"C0501","name":"SC Affalterbach"},"C0502":{"id":"C0502","name":"SV Backnang"},"C0504":{"id":"C0504","name":"Spvgg Böblingen"},"C0505":{"id":"C0505","name":"SC Böblingen 1975 e.V."},"C0506":{"id":"C0506","name":"TSF Ditzingen"},"C0507":{"id":"C0507","name":"SV Fellbach"},"C0509":{"id":"C0509","name":"SV Herrenberg e.V."},"C0510":{"id":"C0510","name":"SK Korb 1948"},"C0512":{"id":"C0512","name":"SC Leinfelden"},"C0513":{"id":"C0513","name":"SV Leonberg 1978 eV"},"C0514":{"id":"C0514","name":"SC Murrhardt 1948 e.V."},"C0515":{"id":"C0515","name":"SF Oeffingen e.V."},"C0517":{"id":"C0517","name":"SK Schmiden/Cannstatt"},"C0518":{"id":"C0518","name":"SV Schwaikheim"},"C0519":{"id":"C0519","name":"VfL Sindelfingen"},"C0520":{"id":"C0520","name":"SC Stetten a.d.F."},"C0521":{"id":"C0521","name":"Stuttgarter SF 1879"},"C0522":{"id":"C0522","name":"TSV Schönaich"},"C0523":{"id":"C0523","name":"DJK Stuttgart-Süd"},"C0525":{"id":"C0525","name":"SC Aidlingen"},"C0528":{"id":"C0528","name":"SG Fasanenhof"},"C0530":{"id":"C0530","name":"Mönchfelder SV 1967"},"C0531":{"id":"C0531","name":"SV Weil der Stadt"},"C0532":{"id":"C0532","name":"SC Sillenbuch"},"C0534":{"id":"C0534","name":"SV Nagold"},"C0536":{"id":"C0536","name":"SGem Vaihingen-Rohr"},"C0538":{"id":"C0538","name":"SV Stuttgart-Wolfbusch 1956 e.V."},"C0539":{"id":"C0539","name":"SSV Zuffenhausen"},"C0540":{"id":"C0540","name":"SC Waiblingen 1921"},"C0544":{"id":"C0544","name":"SC Winnenden e.V."},"C0545":{"id":"C0545","name":"Spvgg Renningen"},"C0547":{"id":"C0547","name":"SC Magstadt"},"C0548":{"id":"C0548","name":"SK \"e4\" Gerlingen"},"C0551":{"id":"C0551","name":"SpVgg Rommelshausen"},"C0552":{"id":"C0552","name":"SC Schachmatt Botnang"},"C0554":{"id":"C0554","name":"GSV Hemmingen"},"C0555":{"id":"C0555","name":"SF Hohenacker e.V."},"C0558":{"id":"C0558","name":"TSV Heimsheim e.V."},"C0559":{"id":"C0559","name":"Vardar Sindelfingen"},"C0560":{"id":"C0560","name":"TSV Heumaden"},"C0563":{"id":"C0563","name":"SC Feuerbach e. V."},"C0564":{"id":"C0564","name":"TSV Simmozheim"},"C0565":{"id":"C0565","name":"Schach-Pinguine Murrhardt e.V."},"C0566":{"id":"C0566","name":"TV Zazenhausen"},"C0567":{"id":"C0567","name":"SSV Turm Holzgerlingen"},"C0568":{"id":"C0568","name":"DJK Sportbund Stuttgart e.V."},"C0601":{"id":"C0601","name":"SV Bad Friedrichshall"},"C0602":{"id":"C0602","name":"SV Bad Rappenau"},"C0603":{"id":"C0603","name":"SC Blauer Turm Bad Wimpfen"},"C0604":{"id":"C0604","name":"SV Besigheim"},"C0605":{"id":"C0605","name":"VfL Eberstadt"},"C0606":{"id":"C0606","name":"TG Forchtenberg"},"C0607":{"id":"C0607","name":"SV Gemmrigheim"},"C0608":{"id":"C0608","name":"SC Gross-Sachsenheim"},"C0610":{"id":"C0610","name":"TSG Heilbronn 1845 e.V."},"C0611":{"id":"C0611","name":"Heilbronner SV"},"C0613":{"id":"C0613","name":"SV 23 Böckingen"},"C0615":{"id":"C0615","name":"TSV Talheim"},"C0616":{"id":"C0616","name":"SV Kirchheim e.V."},"C0617":{"id":"C0617","name":"SC Künzelsau"},"C0618":{"id":"C0618","name":"SK Lauffen"},"C0619":{"id":"C0619","name":"SAbt SV Leingarten"},"C0623":{"id":"C0623","name":"SG Meimsheim-Güglingen"},"C0624":{"id":"C0624","name":"SF Möglingen 1976"},"C0625":{"id":"C0625","name":"TSV Münchingen"},"C0626":{"id":"C0626","name":"SG Ludwigsburg 1919"},"C0627":{"id":"C0627","name":"TSG Öhringen"},"C0629":{"id":"C0629","name":"SK Schwäbisch Hall"},"C0630":{"id":"C0630","name":"TSG Steinheim"},"C0631":{"id":"C0631","name":"SC Tamm 74"},"C0632":{"id":"C0632","name":"TSV Untergruppenb."},"C0633":{"id":"C0633","name":"SVG Vaihingen/Enz"},"C0635":{"id":"C0635","name":"SC Widdern"},"C0636":{"id":"C0636","name":"TSV Willsbach"},"C0637":{"id":"C0637","name":"SC Erdmannhausen"},"C0638":{"id":"C0638","name":"SV Markgröningen"},"C0639":{"id":"C0639","name":"SC Neckarsulm e.V."},"C0640":{"id":"C0640","name":"SV Marbach"},"C0642":{"id":"C0642","name":"SV Gaildorf"},"C0645":{"id":"C0645","name":"SF 59 Kornwestheim"},"C0646":{"id":"C0646","name":"TSV Schwabbach"},"C0647":{"id":"C0647","name":"SC Asperg"},"C0648":{"id":"C0648","name":"SK Bietigheim-Bissingen"},"C0649":{"id":"C0649","name":"TSV Gerabronn"},"C0650":{"id":"C0650","name":"SV Rochade Neuenstadt"},"C0652":{"id":"C0652","name":"SF HN-Biberach 1978 e.V."},"C0654":{"id":"C0654","name":"SC Ingersheim e.V."},"C0656":{"id":"C0656","name":"SF Freiberg"},"C0657":{"id":"C0657","name":"SV Oberstenfeld"},"C0658":{"id":"C0658","name":"TSV Schwaigern"},"C0659":{"id":"C0659","name":"SV Mundelsheim"},"C0661":{"id":"C0661","name":"Lachender Turm Schwäbisch Hall"},"C0662":{"id":"C0662","name":"Srb.KuS-Slavia Heilbronn"},"C0664":{"id":"C0664","name":"SF Schwaigern"},"C0665":{"id":"C0665","name":"udk SV Ivanchuk Hn Vu Ter"},"D1003":{"id":"D1003","name":"SF Lauchhammer"},"D1004":{"id":"D1004","name":"SSG Lübbenau e.V."},"D1005":{"id":"D1005","name":"Blau-Weiß Vetschau 90"},"D1006":{"id":"D1006","name":"SV Chemie Guben 1990, Abt. Freizeitsport"},"D1007":{"id":"D1007","name":"Hohenleipischer SV Lok"},"D1010":{"id":"D1010","name":"Sportverein Senftenberg"},"D1011":{"id":"D1011","name":"SV Königsspringer Herzberg e.V."},"D1013":{"id":"D1013","name":"ESV Lok Raw Cottbus e.V."},"D1014":{"id":"D1014","name":"SV Bad Liebenwerda"},"D1016":{"id":"D1016","name":"SV Blau-Gelb 1899 Hosena e.V."},"D1020":{"id":"D1020","name":"Forster Schachclub 95"},"D1021":{"id":"D1021","name":"ESV \"Lok Falkenberg\" e.V."},"D1022":{"id":"D1022","name":"FSV Spremberg 1895"},"D1025":{"id":"D1025","name":"BSV-KW Jänschwalde 94 e.V."},"D1028":{"id":"D1028","name":"SC Einheit Luckau, Abt. Schach"},"D1029":{"id":"D1029","name":"SV 1892 Schwarzheide"},"D1030":{"id":"D1030","name":"Schachclub Senioren Cottbus"},"D2001":{"id":"D2001","name":"SC Rochade Müncheberg"},"D2004":{"id":"D2004","name":"SV \"Glück auf\" Rüdersdorf e.V."},"D2005":{"id":"D2005","name":"SV Motor Eberswalde e.V."},"D2006":{"id":"D2006","name":"TSG Angermünde Abt. Schach"},"D2007":{"id":"D2007","name":"TSV Blau-Weiß 65 Schwedt"},"D2008":{"id":"D2008","name":"BSG Stahl Eisenhüttenstadt e.V."},"D2009":{"id":"D2009","name":"ESV \"1949 Eberswalde\" e.V."},"D2010":{"id":"D2010","name":"Schachverein Briesen e.V."},"D2013":{"id":"D2013","name":"BSG Pneumant Fürstenwalde e.V."},"D2014":{"id":"D2014","name":"SV Preußen Frankfurt (Oder) e.V."},"D2020":{"id":"D2020","name":"Schachclub Schwedt/O. e.V."},"D2021":{"id":"D2021","name":"SKV Bad Freienwalde/Oder e.V."},"D2022":{"id":"D2022","name":"USC Viadrina Frankfurt (Oder) e.V."},"D2023":{"id":"D2023","name":"Schachfreunde Schwedt 2000 e.V."},"D2024":{"id":"D2024","name":"Doppelbauer Woltersdorf"},"D2025":{"id":"D2025","name":"SV Blau Weiß Germania Storkow"},"D2026":{"id":"D2026","name":"KSC Strausberg Abt. Schach"},"D2027":{"id":"D2027","name":"MSV 1898 e.V. Müllrose"},"D2028":{"id":"D2028","name":"Schachfreunde Groß Schönebeck"},"D2029":{"id":"D2029","name":"SC Lützlower Dorfgemeinschaft e.V."},"D3001":{"id":"D3001","name":"SC Empor Potsdam 1952 e.V."},"D3002":{"id":"D3002","name":"USV Potsdam e.V., Abt. Schach"},"D3003":{"id":"D3003","name":"Potsdamer SV Mitte e.V."},"D3004":{"id":"D3004","name":"SV Rochade Potsdam-West e.V."},"D3006":{"id":"D3006","name":"SG Lok Brandenburg, Abt. Schach"},"D3009":{"id":"D3009","name":"Postsportverein Brandenburg e.V."},"D3010":{"id":"D3010","name":"ESV Kirchmöser e.V., Schachabt."},"D3011":{"id":"D3011","name":"SV Empor Schenkenberg 1928 e.V."},"D3012":{"id":"D3012","name":"Schachclub \"Hans Clauert\" Trebbin"},"D3013":{"id":"D3013","name":"Schachclub Rathenow e.V."},"D3014":{"id":"D3014","name":"TSV Chemie Premnitz"},"D3015":{"id":"D3015","name":"SV Wusterhausen"},"D3016":{"id":"D3016","name":"Schach-Club Wittstock e.V."},"D3017":{"id":"D3017","name":"Schachfreunde Zehdenick 76 e.V."},"D3018":{"id":"D3018","name":"TSG Neuruppin"},"D3019":{"id":"D3019","name":"SC Caissa Falkensee e.V."},"D3021":{"id":"D3021","name":"Schachclub Oranienburg e.V."},"D3022":{"id":"D3022","name":"Ludwigsfelder Schachclub 54"},"D3024":{"id":"D3024","name":"Gymnasium Luckenwalde"},"D3026":{"id":"D3026","name":"SV Grün-Weiß Niemegk"},"D3027":{"id":"D3027","name":"Schachclub Oberkrämer"},"D3031":{"id":"D3031","name":"SC \"Pegasus 96\" Jüterbog"},"D3035":{"id":"D3035","name":"Schachclub Lindow 02 e.V."},"D3037":{"id":"D3037","name":"SV Hellas Nauen e.V., Abt. Schach"},"D3038":{"id":"D3038","name":"SV Marzahna 57 e.V."},"D3039":{"id":"D3039","name":"SV Kinder-Jugendschach"},"D3041":{"id":"D3041","name":"SV Werder/H."},"D3043":{"id":"D3043","name":"Brandenburger LSSV"},"D3044":{"id":"D3044","name":"SG Blau-Weiß 1948 Leegebruch"},"D3045":{"id":"D3045","name":"Olga e.V."},"E0101":{"id":"E0101","name":"SF Schwerin"},"E0103":{"id":"E0103","name":"SV Einheit Schwerin"},"E0107":{"id":"E0107","name":"SG Tripkau von 1925"},"E0109":{"id":"E0109","name":"Post SV Ludwigslust von 1950"},"E0110":{"id":"E0110","name":"SV Fortschritt Neustadt-Glewe"},"E0111":{"id":"E0111","name":"SV Blau-Weiß Grevesmühlen"},"E0112":{"id":"E0112","name":"TSG Gadebusch"},"E0113":{"id":"E0113","name":"ASV Grün-Weiß Wismar"},"E0114":{"id":"E0114","name":"VfL Blau-Weiß Neukloster"},"E0116":{"id":"E0116","name":"SV Blau-Weiß 69 Parchim"},"E0117":{"id":"E0117","name":"Lok Gymnasium Pritzwalk"},"E0118":{"id":"E0118","name":"Putlitzer SV 1921"},"E0119":{"id":"E0119","name":"ESV 1888 Wittenberge"},"E0121":{"id":"E0121","name":"SC Mecklenburger Springer"},"E0122":{"id":"E0122","name":"RSV Rehna"},"E0201":{"id":"E0201","name":"HSG Uni Rostock"},"E0203":{"id":"E0203","name":"SSC Rostock 07"},"E0204":{"id":"E0204","name":"SF Ostsee Warnemünde"},"E0205":{"id":"E0205","name":"SSC Graal-Müritz"},"E0208":{"id":"E0208","name":"Doberaner SV 90"},"E0209":{"id":"E0209","name":"SV Empor Kühlungsborn"},"E0212":{"id":"E0212","name":"Schwaaner SV"},"E0213":{"id":"E0213","name":"SG Güstrow/Teterow"},"E0214":{"id":"E0214","name":"ESV Waren"},"E0215":{"id":"E0215","name":"SV Malchower Schachinsel"},"E0216":{"id":"E0216","name":"Gnoiener SV"},"E0219":{"id":"E0219","name":"PSV Ribnitz-Damgarten"},"E0220":{"id":"E0220","name":"SV Waterkant Saal"},"E0221":{"id":"E0221","name":"Makkabi Rostock"},"E0222":{"id":"E0222","name":"Think Rochade - SC HRO"},"E0302":{"id":"E0302","name":"SG Eintracht Neubrandenburg"},"E0303":{"id":"E0303","name":"SV Turbine Neubrandenburg"},"E0304":{"id":"E0304","name":"SV RUGIA Bergen"},"E0306":{"id":"E0306","name":"SC Vita Binz"},"E0307":{"id":"E0307","name":"SG Jasmund 1996"},"E0308":{"id":"E0308","name":"TSV 1860 Stralsund"},"E0309":{"id":"E0309","name":"FHSG Stralsund"},"E0312":{"id":"E0312","name":"Greifswalder SV"},"E0313":{"id":"E0313","name":"SV Gryps"},"E0314":{"id":"E0314","name":"SV Motor Wolgast 1949"},"E0317":{"id":"E0317","name":"SV Grün-Weiß 90 Anklam"},"E0319":{"id":"E0319","name":"TSG Neustrelitz"},"E0321":{"id":"E0321","name":"SF Strasburg/Uckermark"},"E0327":{"id":"E0327","name":"SAV Torgelow-Drögeheide 90"},"E0329":{"id":"E0329","name":"TSV Friedland 1814"},"F0000":{"id":"F0000","name":"Schachverband Sachsen e.V."},"F1101":{"id":"F1101","name":"ESV Delitzsch"},"F1102":{"id":"F1102","name":"Krostitzer SV"},"F1105":{"id":"F1105","name":"TSG 1861 Taucha"},"F1201":{"id":"F1201","name":"ESV Lok Döbeln"},"F1203":{"id":"F1203","name":"TuS Hartha"},"F1301":{"id":"F1301","name":"Schachfreunde Torgau e. V."},"F1303":{"id":"F1303","name":"SV Fortschritt Oschatz"},"F1508":{"id":"F1508","name":"Schachgemeinschaft Leipzig"},"F150A":{"id":"F150A","name":"BSG Grün-Weiß Leipzig e. V."},"F1512":{"id":"F1512","name":"SF Leipzig-Südost"},"F1515":{"id":"F1515","name":"SV Springer Leipzig"},"F1517":{"id":"F1517","name":"VfB Schach Leipzig e.V."},"F1519":{"id":"F1519","name":"SG Turm Leipzig"},"F1520":{"id":"F1520","name":"SK Fortuna Leipzig e.V."},"F1521":{"id":"F1521","name":"Schachclub Rote Rüben Leipzig e.V."},"F1522":{"id":"F1522","name":"BSV Weissblau Allianz Leipzig"},"F1523":{"id":"F1523","name":"SC Leipzig-Lindenau"},"F1525":{"id":"F1525","name":"SG BiBaBo Leipzig e. V."},"F1526":{"id":"F1526","name":"SV Fortuna Leipzig 02 e. V."},"F1527":{"id":"F1527","name":"SV Makkabi Leipzig e. V."},"F1528":{"id":"F1528","name":"SV Lok Engelsdorf"},"F1801":{"id":"F1801","name":"SF \"Glück auf\" Borna"},"F1802":{"id":"F1802","name":"SV Groitzsch 1861"},"F1803":{"id":"F1803","name":"Sportfr. Neukieritzsch"},"F1804":{"id":"F1804","name":"SV Chemie Böhlen"},"F1805":{"id":"F1805","name":"TSV Kitzscher"},"F1806":{"id":"F1806","name":"SK Großlehna"},"F1807":{"id":"F1807","name":"TSG Markkleeberg"},"F1808":{"id":"F1808","name":"Frohburger SC 1926"},"F1809":{"id":"F1809","name":"SG Agro Geithain"},"F1902":{"id":"F1902","name":"SV 1919 Grimma"},"F1903":{"id":"F1903","name":"Schachclub Naunhof"},"F1904":{"id":"F1904","name":"Falkenhainer SV 1898"},"F1905":{"id":"F1905","name":"Schachfreunde Bad Lausick"},"F2101":{"id":"F2101","name":"SC Riesa"},"F2102":{"id":"F2102","name":"SV Traktor Priestewitz"},"F2201":{"id":"F2201","name":"Fortschritt Pirna"},"F2203":{"id":"F2203","name":"BSG Sebnitz"},"F2205":{"id":"F2205","name":"Schachklub Heidenau"},"F2206":{"id":"F2206","name":"ESV Lok Bad Schandau"},"F2207":{"id":"F2207","name":"SSV 448 Gohrisch e. V."},"F2301":{"id":"F2301","name":"SV \"Gambit\" Kamenz"},"F2302":{"id":"F2302","name":"SV Schw.-Weiß Königsbrück"},"F2303":{"id":"F2303","name":"TuS 1890 Gersdorf-Möhrsdorf"},"F2304":{"id":"F2304","name":"TSG Bernsdorf"},"F2305":{"id":"F2305","name":"SV Ottendorf-Okrilla"},"F2307":{"id":"F2307","name":"TTC Pulsnitz 69"},"F2308":{"id":"F2308","name":"SC 1911 Großröhrsdorf"},"F2401":{"id":"F2401","name":"FVS ASP Hoyerswerda"},"F2501":{"id":"F2501","name":"SV Freital"},"F2503":{"id":"F2503","name":"SV Bannewitz"},"F2504":{"id":"F2504","name":"SG Kesselsdorf"},"F2505":{"id":"F2505","name":"SSV Altenberg"},"F2603":{"id":"F2603","name":"BSV Chemie Radebeul"},"F2605":{"id":"F2605","name":"TuS Coswig 1920"},"F2607":{"id":"F2607","name":"Schach macht fit"},"F2701":{"id":"F2701","name":"SV Görlitz 1990"},"F2803":{"id":"F2803","name":"SV Lok Dresden"},"F2806":{"id":"F2806","name":"SV Dresden-Leuben"},"F2808":{"id":"F2808","name":"SG Grün-Weiß Dresden"},"F2810":{"id":"F2810","name":"SV Dresden-Striesen 1990"},"F2811":{"id":"F2811","name":"SV TUR Dresden"},"F2813":{"id":"F2813","name":"USV TU Dresden"},"F2816":{"id":"F2816","name":"ZMDI Schachfestival Dresden"},"F2902":{"id":"F2902","name":"SC 1994 Oberland"},"F2906":{"id":"F2906","name":"TSV Großschönau"},"F2909":{"id":"F2909","name":"Spielver. Ebersbach/SA."},"F2911":{"id":"F2911","name":"Löbauer SV"},"F2912":{"id":"F2912","name":"SV Lok Löbau"},"F2A02":{"id":"F2A02","name":"SC Einheit Bautzen"},"F2A04":{"id":"F2A04","name":"SV Gaußig"},"F2A05":{"id":"F2A05","name":"SV Großpostwitz-Kirschau"},"F2A06":{"id":"F2A06","name":"SV W.R. Schirgiswalde"},"F2A09":{"id":"F2A09","name":"Schachfr. Bischofswerda"},"F2A10":{"id":"F2A10","name":"SG Großdrebnitz"},"F2A11":{"id":"F2A11","name":"SV Fortsch. Großharthau"},"F2B02":{"id":"F2B02","name":"Schachclub 90 Niesky"},"F2B03":{"id":"F2B03","name":"SV Aufbau Kodersdorf"},"F2B04":{"id":"F2B04","name":"SV Grün-Weiß Weißwasser"},"F2B06":{"id":"F2B06","name":"FSV Boxberg e. V. Abt. Schach"},"F2B07":{"id":"F2B07","name":"ASV Rothenburg Abt. Schach"},"F3101":{"id":"F3101","name":"SG Neukirchen/Erzg."},"F3103":{"id":"F3103","name":"SV Tanne Thalheim"},"F3104":{"id":"F3104","name":"SV Neu-Oelsnitz"},"F3106":{"id":"F3106","name":"TSV Elektronik Gornsdorf"},"F3201":{"id":"F3201","name":"TSV Fortschritt Mittweida 1949 e. V."},"F3202":{"id":"F3202","name":"SV 1948 Frankenberg"},"F3203":{"id":"F3203","name":"SV Motor Hainichen 1949"},"F3205":{"id":"F3205","name":"SK 1958 Geringswalde"},"F3206":{"id":"F3206","name":"VfA Rochlitzer Berg e. V."},"F3207":{"id":"F3207","name":"Burgstädter TSV 1878"},"F3301":{"id":"F3301","name":"Siebenlehner SV"},"F3302":{"id":"F3302","name":"TV Freiberg 1844"},"F3303":{"id":"F3303","name":"Turn- u. Sportgemeinschaft Oederan"},"F3304":{"id":"F3304","name":"SV Grün-W. Niederwiesa"},"F3306":{"id":"F3306","name":"SV Eppendorf"},"F3401":{"id":"F3401","name":"Glauchauer SC 1873"},"F3403":{"id":"F3403","name":"SG Limbach-Oberfrohna"},"F3405":{"id":"F3405","name":"SSV Fortschritt Lichtenstein"},"F3406":{"id":"F3406","name":"SC Sachsenring"},"F3502":{"id":"F3502","name":"SC 1865 Annabg.-Buchholz"},"F3503":{"id":"F3503","name":"SV Cranzahl 1962"},"F3504":{"id":"F3504","name":"SV Gelenau Abt. Schach"},"F3505":{"id":"F3505","name":"BSV Ehrenfriedersdorf"},"F3506":{"id":"F3506","name":"Allgemeiner Schachclub Thum"},"F3603":{"id":"F3603","name":"USG Chemnitz"},"F3606":{"id":"F3606","name":"Chemnitzer SC Aufbau`95"},"F3607":{"id":"F3607","name":"SV Eiche Reichenbrand"},"F3609":{"id":"F3609","name":"TSV IFA Chemnitz"},"F3610":{"id":"F3610","name":"TV Grüna SAbt"},"F3611":{"id":"F3611","name":"BSC Rapid Chemnitz"},"F3701":{"id":"F3701","name":"Schachclub Reichenbach"},"F3702":{"id":"F3702","name":"SG Waldkirchen"},"F3704":{"id":"F3704","name":"VfB Adorf"},"F3705":{"id":"F3705","name":"SV Bösenbrunn"},"F3706":{"id":"F3706","name":"SV Markneukirchen"},"F3707":{"id":"F3707","name":"Schachverein Klingenthal"},"F3708":{"id":"F3708","name":"Rodewischer Schachmiezen"},"F3709":{"id":"F3709","name":"SV 1992 Treuen"},"F3806":{"id":"F3806","name":"Zwickauer Schachclub"},"F3807":{"id":"F3807","name":"SV Empor West Zwickau"},"F3901":{"id":"F3901","name":"HSV Eintracht Seiffen"},"F3902":{"id":"F3902","name":"Schachverein Marienberg"},"F3903":{"id":"F3903","name":"SG Blumenau"},"F3904":{"id":"F3904","name":"SV Lengefeld"},"F3907":{"id":"F3907","name":"SG Nieder-und Kleinneuschönberg e.V."},"F3908":{"id":"F3908","name":"Rotation Borstendf/E."},"F3909":{"id":"F3909","name":"Einheit Börnichen"},"F3910":{"id":"F3910","name":"SG Hohndorf SAbt"},"F3A02":{"id":"F3A02","name":"Post-SV Crimmitschau"},"F3A03":{"id":"F3A03","name":"Schachklub Kirchberg/SA."},"F3A09":{"id":"F3A09","name":"Muldental Wilkau-Haßlau"},"F3A10":{"id":"F3A10","name":"TSV Lichtentanne SAbt"},"F3B01":{"id":"F3B01","name":"Schachklub König Plauen"},"F3B02":{"id":"F3B02","name":"VSC Plauen 1952"},"F3C01":{"id":"F3C01","name":"ESV Nickelhütte Aue"},"F3C04":{"id":"F3C04","name":"SV SAXONIA Bernsbach"},"F3C08":{"id":"F3C08","name":"SG CX Schwarzenberg-Raschau"},"G0000":{"id":"G0000","name":"LSV Sachsen-Anhalt e.V."},"G0101":{"id":"G0101","name":"SV Aufbau Bernburg"},"G0102":{"id":"G0102","name":"SG Union Sandersdorf"},"G0103":{"id":"G0103","name":"SG Chemie Wolfen"},"G0104":{"id":"G0104","name":"Holzweißiger SV"},"G0106":{"id":"G0106","name":"SG Jeßnitz"},"G0108":{"id":"G0108","name":"SG 1871 Löberitz"},"G0109":{"id":"G0109","name":"Chemie Bitterfeld"},"G0110":{"id":"G0110","name":"SV Zörbig"},"G0111":{"id":"G0111","name":"SC Raguhn"},"G0112":{"id":"G0112","name":"SK Dessau 93"},"G0113":{"id":"G0113","name":"SV Roßlau"},"G0114":{"id":"G0114","name":"VfL Gräfenhainichen"},"G0116":{"id":"G0116","name":"SSC Annaburg"},"G0118":{"id":"G0118","name":"TSV Elbe Aken 1863"},"G0120":{"id":"G0120","name":"SV Grün-Weiß Wittenberg-Piesteritz"},"G0121":{"id":"G0121","name":"TSG Wittenberg"},"G0122":{"id":"G0122","name":"SV Blau-Rot Pratau"},"G0123":{"id":"G0123","name":"SF Bad Schmiedeberg"},"G0124":{"id":"G0124","name":"SV 51 Zerbst"},"G0125":{"id":"G0125","name":"1. Schachclub Anhalt"},"G0126":{"id":"G0126","name":"Cöthener FC Germania 03"},"G0201":{"id":"G0201","name":"1. FC ROMONTA Amsdorf"},"G0202":{"id":"G0202","name":"Klostermansfelder SC 1958"},"G0203":{"id":"G0203","name":"SV 1925 Helbra"},"G0204":{"id":"G0204","name":"SG GW 90 Bischofrode"},"G0205":{"id":"G0205","name":"SSV Hergisdorf"},"G0206":{"id":"G0206","name":"WSG Halle-Neustadt"},"G0207":{"id":"G0207","name":"Reideburger SV 90 Halle"},"G0208":{"id":"G0208","name":"USV Volksbank Halle"},"G0209":{"id":"G0209","name":"SG Einheit Halle"},"G020A":{"id":"G020A","name":"Schachgemeinschaft 2011 Sennewitz"},"G020B":{"id":"G020B","name":"SV Wansleben 2001"},"G020C":{"id":"G020C","name":"Schachzwerge Halle"},"G0210":{"id":"G0210","name":"VfB 07 Lettin"},"G0211":{"id":"G0211","name":"Post- u. Turn-Sportverein Halle"},"G0212":{"id":"G0212","name":"Gehörlosen SBV Halle 09"},"G0214":{"id":"G0214","name":"Schachfreunde Hettstedt"},"G0215":{"id":"G0215","name":"SV Eintracht Quenstedt"},"G0216":{"id":"G0216","name":"Grün-Weiß Granschütz"},"G0217":{"id":"G0217","name":"SG 1920 Trebnitz"},"G0219":{"id":"G0219","name":"SV Merseburg"},"G0221":{"id":"G0221","name":"VfB Bad Lauchstädt"},"G0222":{"id":"G0222","name":"Naumburger Sportverein 1951"},"G0224":{"id":"G0224","name":"Teutschenthaler Schachclub"},"G0225":{"id":"G0225","name":"SV Sangerhausen"},"G0227":{"id":"G0227","name":"SK Roland Weißenfels"},"G0228":{"id":"G0228","name":"SV Motor Zeitz"},"G0229":{"id":"G0229","name":"SG Döllnitz"},"G0301":{"id":"G0301","name":"Burger SK Schwarz-Weiß"},"G0302":{"id":"G0302","name":"SV Gardelegen"},"G0303":{"id":"G0303","name":"VfL Kalbe/Milde"},"G0305":{"id":"G0305","name":"Eintracht Osterwieck"},"G0306":{"id":"G0306","name":"SV Einheit Halberstadt"},"G0307":{"id":"G0307","name":"Verein Schachtradition Ströbeck"},"G0308":{"id":"G0308","name":"Flechtinger SV"},"G0309":{"id":"G0309","name":"SV 90 Havelberg"},"G0310":{"id":"G0310","name":"SV Rochade Magdeburg 96"},"G0312":{"id":"G0312","name":"Post SV Magdeburg 1926"},"G0313":{"id":"G0313","name":"VfB Ottersleben"},"G0314":{"id":"G0314","name":"SG Aufbau Elbe Magdeburg"},"G0315":{"id":"G0315","name":"TuS 1860 Magdeburg"},"G0317":{"id":"G0317","name":"USC Magdeburg"},"G0318":{"id":"G0318","name":"SK Oschersleben 1948"},"G0319":{"id":"G0319","name":"Ballenstedter SV"},"G0320":{"id":"G0320","name":"TSG GutsMuths 1860 Quedlinburg"},"G0321":{"id":"G0321","name":"SG Harzgerode"},"G0322":{"id":"G0322","name":"Schachclub Salzwedel"},"G0324":{"id":"G0324","name":"SG Klötze Süd"},"G0325":{"id":"G0325","name":"SSV Blau-Weiß Barby"},"G0326":{"id":"G0326","name":"TSG Calbe/Saale"},"G0327":{"id":"G0327","name":"Schönebecker SV 1861"},"G0328":{"id":"G0328","name":"SG Einheit Staßfurt"},"G0329":{"id":"G0329","name":"SV Salzland Staßfurt"},"G0330":{"id":"G0330","name":"SV Eintracht Tangerhütte"},"G0331":{"id":"G0331","name":"SV Energie Stendal"},"G0335":{"id":"G0335","name":"SF Turm 2000 Wahrburg"},"G0336":{"id":"G0336","name":"Harzkalk Rübeland"},"G0337":{"id":"G0337","name":"Stahl Blankenburg"},"G0338":{"id":"G0338","name":"SV Eintracht Derenburg"},"G0342":{"id":"G0342","name":"GW Dahlenwarsleben"},"G0344":{"id":"G0344","name":"SV Kali Wolmirstedt"},"G0345":{"id":"G0345","name":"SV Irxleben von 1919"},"G0346":{"id":"G0346","name":"SV Lok Aschersleben"},"G0347":{"id":"G0347","name":"Stendaler Schachklub"},"G0348":{"id":"G0348","name":"Schachfreunde Zeitnot"},"G0349":{"id":"G0349","name":"Haldensleber SC"},"G0353":{"id":"G0353","name":"Schachzwerge Magdeburg"},"G0354":{"id":"G0354","name":"SV Freibauer Barleben"},"G0355":{"id":"G0355","name":"SV Groß Garz"},"H1101":{"id":"H1101","name":"SSV 90 Artern"},"H1102":{"id":"H1102","name":"SV Springer Oldisleben"},"H1120":{"id":"H1120","name":"Glückauf Sondershausen"},"H1224":{"id":"H1224","name":"Schachclub Rochade Leinefelde"},"H1226":{"id":"H1226","name":"Hausener SV 1899 Sektion Schach"},"H1227":{"id":"H1227","name":"SV Breitenworbis"},"H1228":{"id":"H1228","name":"SV Gernrode 1887"},"H1230":{"id":"H1230","name":"SK Dingelstädt 1921"},"H1231":{"id":"H1231","name":"TSV Großbodungen"},"H1232":{"id":"H1232","name":"SV Einheit 1875 Worbis"},"H1233":{"id":"H1233","name":"Aufbau 1952 Heiligenstadt"},"H1234":{"id":"H1234","name":"SG Lutter 1922"},"H12A6":{"id":"H12A6","name":"SG Bernterode"},"H12B3":{"id":"H12B3","name":"Brehmer Schachverein"},"H1321":{"id":"H1321","name":"SC 51 Nordhausen"},"H1322":{"id":"H1322","name":"SC Friedrichsthal"},"H1401":{"id":"H1401","name":"BSV Mühlhausen 04"},"H1434":{"id":"H1434","name":"SV Ammern"},"H1437":{"id":"H1437","name":"SV Empor Bad Langensalza"},"H1439":{"id":"H1439","name":"TSV 1861 Bad Tennstedt"},"H14A4":{"id":"H14A4","name":"Schlotheimer SV 1887"},"H14A7":{"id":"H14A7","name":"SV Bickenriede 85"},"H1535":{"id":"H1535","name":"Schachclub 1998 Gotha"},"H1536":{"id":"H1536","name":"ZSG Grün-Weiß Waltershausen"},"H1538":{"id":"H1538","name":"SG Burgtonna"},"H2103":{"id":"H2103","name":"SV Medizin Erfurt"},"H2104":{"id":"H2104","name":"SV Empor Erfurt"},"H2105":{"id":"H2105","name":"Erfurter Schachklub"},"H2107":{"id":"H2107","name":"USV Erfurt Abteilung Schach"},"H2108":{"id":"H2108","name":"SV 1899 Vieselbach"},"H21B0":{"id":"H21B0","name":"Schachclub Turm Erfurt"},"H2219":{"id":"H2219","name":"TSG Apolda"},"H2314":{"id":"H2314","name":"ESV Lok Sömmerda"},"H2317":{"id":"H2317","name":"SV Grün-Weiß Straußfurt"},"H2409":{"id":"H2409","name":"SG Blau-Weiß Stadtilm"},"H2411":{"id":"H2411","name":"SV Eintracht Frankenhain"},"H2412":{"id":"H2412","name":"TSV 1886 Geschwenda"},"H2413":{"id":"H2413","name":"SG Arnstadt-Stadtilm"},"H2415":{"id":"H2415","name":"Stadtilmer SV"},"H2419":{"id":"H2419","name":"TSV Plaue"},"H2458":{"id":"H2458","name":"SV Gehren 1911"},"H2459":{"id":"H2459","name":"Ilmenauer SV"},"H24A2":{"id":"H24A2","name":"Schachverein Stützerbach"},"H24A8":{"id":"H24A8","name":"SV Motor Katzhütte-Oelze"},"H2518":{"id":"H2518","name":"SSV Vimaria 91 Weimar"},"H3107":{"id":"H3107","name":"Schachzirkel Elstertal Langenberg"},"H3164":{"id":"H3164","name":"ESV Gera"},"H3166":{"id":"H3166","name":"SV 1861 Liebschwitz"},"H3169":{"id":"H3169","name":"VfL 1990 Gera"},"H3208":{"id":"H3208","name":"SV Blau-Weiß Bürgel"},"H3273":{"id":"H3273","name":"SV Hermsdorf"},"H3287":{"id":"H3287","name":"SV Jenapharm Jena"},"H3288":{"id":"H3288","name":"SV 1910 Kahla"},"H3289":{"id":"H3289","name":"Kings Club 98 Jena"},"H3290":{"id":"H3290","name":"SV Schott Jena"},"H3374":{"id":"H3374","name":"TSV Zeulenroda"},"H3375":{"id":"H3375","name":"Thüringer Schachverein Triebes"},"H3376":{"id":"H3376","name":"SK Greiz 1881"},"H33A1":{"id":"H33A1","name":"TuS Osterburg Weida"},"H3492":{"id":"H3492","name":"Meuselwitzer SV"},"H3496":{"id":"H3496","name":"SC Altenburg"},"H3578":{"id":"H3578","name":"SV Grün-Weiß Triptis"},"H3579":{"id":"H3579","name":"MTV 1876 Saalfeld"},"H3583":{"id":"H3583","name":"SV Thuringia Königsee"},"H3584":{"id":"H3584","name":"Fortuna Pößneck"},"H3598":{"id":"H3598","name":"SV Lauscha"},"H4143":{"id":"H4143","name":"SC Suhl"},"H4145":{"id":"H4145","name":"TSV 1883 Benshausen"},"H4147":{"id":"H4147","name":"SV Schmalkalden 04"},"H4148":{"id":"H4148","name":"SC Steinbach-Altersbach"},"H4149":{"id":"H4149","name":"SG Barchfeld/Breitungen"},"H4151":{"id":"H4151","name":"SG Trusetal 92"},"H4152":{"id":"H4152","name":"ESV Lok Meiningen"},"H41A0":{"id":"H41A0","name":"SV Hohe Rhön Frankenheim"},"H4340":{"id":"H4340","name":"SV Wartburgstadt Eisenach"},"H4342":{"id":"H4342","name":"TSG Ruhla"},"H4354":{"id":"H4354","name":"SG Schweina 1949"},"H4355":{"id":"H4355","name":"SV Germania Barchfeld"},"H4356":{"id":"H4356","name":"Randspringer Bad Salzungen"},"H4357":{"id":"H4357","name":"VfB 1919 Vacha"},"L0000":{"id":"L0000","name":"Deutscher Blinden- und Sehbehinderten-SB"}}

},{}]},{},[1])
;