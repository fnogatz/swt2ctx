module.exports = setSettings;


/**
 * Set the Tournament's settings, e.g. everything that belongs in the
 *   /tournament/settings path.
 *   
 * @param {Object} swt  result from swtparser
 * @param {Object} tnmt XMLbuilder root element
 */
function setSettings(swt, tnmt) {
  var type = (swt.general['35'] === true ? 'team' : 'individual');

  var settings = tnmt.element('settings');
  var general = settings.element('general');

  // number of rounds
  general.element('rounds', swt.general[1].toString());

  // Team Tournament: number of boards
  if (type === 'team')
    general.element('boards', swt.general[34].toString());
}