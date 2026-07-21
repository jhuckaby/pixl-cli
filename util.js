// Shared Unicode and terminal utilities for pixl-cli.

// Match ANSI terminal escape sequences so they can be ignored during measurement.
var ansiPattern = new RegExp([
	'[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
	'(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
].join('|'), 'g');

// Split strings into user-perceived characters, including complete emoji sequences.
var graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function splitAnsiGraphemes(text) {
	// Split a string into complete ANSI sequences and Unicode grapheme clusters.
	// ANSI sequences are kept intact so callers can preserve them while editing text.
	var units = [];
	var pattern = new RegExp(ansiPattern.source, 'g');
	var offset = 0;
	var match = null;
	
	var addText = function(value) {
		for (var item of graphemeSegmenter.segment(value)) {
			units.push({ text: item.segment, ansi: false });
		}
	};
	
	while ((match = pattern.exec(text))) {
		if (match.index > offset) addText( text.substring(offset, match.index) );
		units.push({ text: match[0], ansi: true });
		offset = pattern.lastIndex;
	}
	if (offset < text.length) addText( text.substring(offset) );
	return units;
}

module.exports = {
	ansiPattern: ansiPattern,
	graphemeSegmenter: graphemeSegmenter,
	splitAnsiGraphemes: splitAnsiGraphemes
};
