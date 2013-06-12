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
        value: string.replace(/^([1-9][0-9]*)'\/([1-9][0-9]*)\+([1-9][0-9]*)"$/, '$1'),
        unit: 'minutes'
      },
      moves: parseInt(string.replace(/^([1-9][0-9]*)'\/([1-9][0-9]*)\+([1-9][0-9]*)"$/, '$2')),
      increment: {
        value: string.replace(/^([1-9][0-9]*)'\/([1-9][0-9]*)\+([1-9][0-9]*)"$/, '$3'),
        unit: 'seconds'
      }
    };

    return period;
  } else if (/^[1-9][0-9]*'\+[1-9][0-9]*"$/.test(string)) {
    // form: 30'+30"
    var period = {
      time: {
        value: string.replace(/^([1-9][0-9]*)'\+[1-9][0-9]*"$/, '$1'),
        unit: 'minutes'
      },
      increment: {
        value: string.replace(/^[1-9][0-9]*'\+([1-9][0-9]*)"$/, '$1'),
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