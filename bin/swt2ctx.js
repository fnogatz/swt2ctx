var convert = require('../lib/index');

var opts = require('nomnom')
  .option('input', {
    abbr: 'i',
    flag: false,
    help: 'SWT file'
  })
  .option('version', {
    flag: true,
    help: 'print version and exit',
    callback: function() {
      return require('../package.json').version;
    }
  })
  .option('small', {
    flag: true,
    abbr: 'p',
    help: 'No indent, no newlines'
  })
  .option('indent', {
    default: 2,
    help: 'number of spaces to indent XML sub-structures'
  })
  .option('newline', {
    default: '\n',
    help: 'newline separator'
  })
  .parse();

var xmlBuilderOptions = {
  pretty: (opts.small ? false : true),
  indent: (new Array(parseInt(opts.indent)+1)).join(' '),
  newline: opts.newline
}

if (opts.input) {
  // read from file
  convert(opts.input, xmlBuilderOptions, done);
}
else {
  // read from stdin
  var buffers = [];
  process.stdin.resume();
  process.stdin.on('data', function(buf) { buffers.push(buf); });
  process.stdin.on('end', function() {
    var buffer = Buffer.concat(buffers);
    convert(buffer, xmlBuilderOptions, done);
  });
}

function done(err, xml) {
  if (err)
    throw err;

  console.log(xml);
}