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
        else if (typeof parsedTimeControls === 'object') {
          period = timeControls.element('period');

          if (parsedPeriod.moves) {
            period.element('moves', parsedPeriod.moves);
          }

          if (parsedPeriod.time) {
            period.element('time', parsedPeriod.time.value, { unit: parsedPeriod.time.unit });
          }

          if (parsedPeriod.increment) {
            period.element('increment', parsedPeriod.increment.value, { unit: parsedPeriod.increment.unit });
          }
        }
      });
    }
  }

  return type;
}