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

function preserveAnsiLineStyles(text) {
	// A styled multi-line string normally relies on terminal modes carrying across
	// newline characters.  Callers such as cli.box() insert independently styled
	// borders between those lines, whose reset codes can cancel the content styles.
	// Close all modes at each line ending, then restore the exact SGR state after the
	// next border by replaying the original SGR history at the next line's start.
	var lines = text.split('\n');
	if (lines.length < 2) return text;
	
	var sgrHistory = '';
	var sgrPattern = /^(?:\u001B\[|\u009B)[0-9:;]*m$/;
	var reset = '\u001b[0m';
	
	return lines.map( function(line, idx) {
		var reopen = sgrHistory;
		
		// Only sequences from the original text enter the history.  Synthetic reset
		// and replay sequences added here must not accumulate on subsequent lines.
		splitAnsiGraphemes(line).forEach( function(unit) {
			if (unit.ansi && unit.text.match(sgrPattern)) sgrHistory += unit.text;
		} );
		
		if ((idx < lines.length - 1) && sgrHistory) line += reset;
		return reopen + line;
	} ).join('\n');
}

module.exports = {
	ansiPattern: ansiPattern,
	graphemeSegmenter: graphemeSegmenter,
	splitAnsiGraphemes: splitAnsiGraphemes,
	preserveAnsiLineStyles: preserveAnsiLineStyles
};
