# swt2ctx

[![Greenkeeper badge](https://badges.greenkeeper.io/fnogatz/swt2ctx.svg)](https://greenkeeper.io/)

Convert a [Swiss-Chess](http://swiss-chess.de) Tournament (SWT) file into a 
valid [Chess Tournament Exchange Format (CTX)](https://github.com/fnogatz/CTX).

## Installation

Simply install the package and its command line interface via npm:

	npm install swt2ctx

## Usage

The most comfortable way to convert SWT files is to use the command line interface:

	swt2ctx < /my/tournament.SWT

There are multiple options to format the output, see `swt2ctx --help` for further information.

You can also use `swt2ctx` programmatically:

	var convert = require('swt2ctx');
	convert('/my/tournament.SWT', 
	  { indent: 2, pretty: true, newline: '\n' }, 
	  function handleXML(err, xml) {
	  	// do whatever you want
	  });

## Supported SWT versions

Because this module uses the [chesstournament.js](fnogatz/chesstournament.js)' plugin to [import SWT files](fnogatz/chesstournament.js-SWT-support), it supports the file versions provided by this module. Currently only tournaments of SWT version 8.xx can be parsed.