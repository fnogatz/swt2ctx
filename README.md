# swt2ctx

Convert a [Swiss-Chess](http://swiss-chess.de) Tournament (SWT) file into a valid [Chess Tournament Exchange Format (CTX)](https://github.com/fnogatz/CTX) file.

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

Because this module uses the [swtparser module](https://github.com/fnogatz/node-swtparser), it supports the file versions provided by those module. Currently only tournaments of SWT version 8.xx can be parsed.

## Todo

* Add individual pairings in `/tournament/pairings` for Individual Tournaments
* Add individual, initial ranking in `/tournament/rankings/initial` for Individual Tournaments
* Parse round dates for `/tournament/pairings/round/information`

## Licence

	Copyright (c) 2013 Falco Nogatz (fnogatz@gmail.com)

	 Permission is hereby granted, free of charge, to any person obtaining a copy
	 of this software and associated documentation files (the "Software"), to deal
	 in the Software without restriction, including without limitation the rights
	 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	 copies of the Software, and to permit persons to whom the Software is
	 furnished to do so, subject to the following conditions:

	 The above copyright notice and this permission notice shall be included in
	 all copies or substantial portions of the Software.

	 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	 THE SOFTWARE.