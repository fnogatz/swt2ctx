module.exports = swt2ctx;

var Tournament = require('chesstournament');
Tournament.from.use(require('chesstournament-swt-support'));
Tournament.to.use(require('chesstournament-ctx-support'));


function swt2ctx(from, options, callback) {
  Tournament.from.SWT(Tournament, from, function(err, tournament) {
    if (err)
      throw err;

    tournament.to.CTX(options, function(err, ctx) {
      if (err)
        throw err;

      callback(null, ctx);
    });
  });
}