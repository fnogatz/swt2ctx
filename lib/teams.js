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

  // add initial rankings
  var initialRankingElement = tnmt.element('rankings').element('initial');
  for (var position in initialRanking) {
    initialRankingElement.element('team')
      .attribute('position', position.toString())
      .attribute('id', initialRanking[position].toString());
  }

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