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