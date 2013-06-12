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
  var tnmt = builder.create('tournament');
  var relations = {};

  var type = setGeneralInformation(swt, tnmt);
  setSettings(swt, tnmt);
  relations.players = addPlayers(swt, tnmt);

  if (type === 'team') {
    relations.teams = addTeams(swt, tnmt, relations);
    addPairings.forTeams(swt, tnmt, relations);
  }

  // finished
  var xml = tnmt.end(options);
  callback(null, xml);
}