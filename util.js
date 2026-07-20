// Shared Unicode and terminal utilities for pixl-cli.

// Match ANSI terminal escape sequences so they can be ignored during measurement.
var ansiPattern = new RegExp([
	'[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
	'(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
].join('|'), 'g');

// Split strings into user-perceived characters, including complete emoji sequences.
var graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

module.exports = {
	ansiPattern: ansiPattern,
	graphemeSegmenter: graphemeSegmenter
};
