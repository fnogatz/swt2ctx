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