var csv = require('csv');

var json = {};

csv()
  .from.path('./vereine/vereine.csv', { encoding: 'binary' })
  .on('record', function(row) {
    json[row[0]] = {
      id: row[0],
      name: row[3]
    };
  })
  .on('end', function() {
    console.log(JSON.stringify(json));
  })