// Display-width-aware word wrapping for pixl-cli.

var Util = require('./util');
var stringWidth = require('./width').stringWidth;
var ansiPattern = Util.ansiPattern;
var graphemeSegmenter = Util.graphemeSegmenter;

function getWrapTokens(text) {
	// Split text into alternating words and breakable whitespace, while preserving
	// ANSI sequences as zero-width units in their original positions.
	var units = [];
	var pattern = new RegExp(ansiPattern.source, 'g');
	var offset = 0;
	var match = null;
	
	var addText = function(value) {
		for (var item of graphemeSegmenter.segment(value)) {
			units.push({
				text: item.segment,
				width: stringWidth(item.segment),
				breakable: !!item.segment.match(/^(?:\s|\u200B)+$/u),
				ansi: false
			});
		}
	};
	
	while ((match = pattern.exec(text))) {
		if (match.index > offset) addText( text.substring(offset, match.index) );
		units.push({ text: match[0], width: 0, breakable: false, ansi: true });
		offset = pattern.lastIndex;
	}
	if (offset < text.length) addText( text.substring(offset) );
	
	var tokens = [];
	var token = null;
	var pending = [];
	units.forEach( function(unit) {
		// ANSI codes do not determine whether a token is a word or whitespace.
		if (unit.ansi) {
			if (token) token.units.push(unit);
			else pending.push(unit);
			return;
		}
		
		var type = unit.breakable ? 'break' : 'word';
		if (!token || (token.type != type)) {
			if (token) tokens.push(token);
			token = { type: type, units: pending.concat([unit]) };
			pending = [];
		}
		else token.units.push(unit);
	} );
	
	if (token) tokens.push(token);
	else if (pending.length) tokens.push({ type: 'word', units: pending });
	return tokens;
}

function joinWrapUnits(units) {
	// Join tokenized graphemes and ANSI sequences back into their original string.
	return units.map( function(unit) { return unit.text; } ).join('');
}

function trimWrapLines(text) {
	// Trim spaces and tabs from each line without removing the initial indentation.
	return text.split('\n').map( function(line) {
		return line.replace(/[ \t]+$/, '');
	} ).join('\n');
}

function wordWrap(text, options) {
	// Wrap text using terminal display columns instead of JavaScript string length.
	options = options || {};
	if (text == null) return text;
	
	var width = options.width || 50;
	var indent = (typeof(options.indent) == 'string') ? options.indent : '  ';
	var newline = options.newline || ('\n' + indent);
	var escape = (typeof(options.escape) == 'function') ? options.escape : function(value) {
		return value;
	};
	var tokens = getWrapTokens(text);
	var lines = [];
	var lineUnits = [];
	
	var flushLine = function() {
		var line = joinWrapUnits(lineUnits);
		if (line.slice(-1) == '\n') line = line.slice(0, -1);
		lines.push( escape(line) );
		lineUnits = [];
	};
	
	if (options.cut === true) {
		// Cut mode fills every line to the requested display width, even when that
		// means breaking a word.  Complete grapheme clusters always stay together.
		var lineWidth = 0;
		tokens.forEach( function(token) {
			token.units.forEach( function(unit) {
				if (unit.text.includes('\n')) {
					if (stringWidth(joinWrapUnits(lineUnits))) flushLine();
					else lineUnits = [];
					lineWidth = 0;
					return;
				}
				
				if (!unit.ansi && lineWidth && ((lineWidth + unit.width) > width)) {
					flushLine();
					lineWidth = 0;
				}
				lineUnits.push(unit);
				lineWidth += unit.width;
			} );
		} );
	}
	else {
		tokens.forEach( function(token) {
			var tokenText = joinWrapUnits(token.units);
			
			if (token.type == 'break') {
				lineUnits = lineUnits.concat(token.units);
				if (tokenText.includes('\n')) {
					if (stringWidth(joinWrapUnits(lineUnits))) flushLine();
					else lineUnits = [];
				}
				return;
			}
			
			var lineText = joinWrapUnits(lineUnits);
			var candidateWidth = stringWidth(lineText + tokenText);
			if (lineUnits.length && (candidateWidth > width)) flushLine();
			lineUnits = lineUnits.concat(token.units);
		} );
	}
	
	if (lineUnits.length) flushLine();
	var result = indent + lines.join(newline);
	if (options.trim === true) result = trimWrapLines(result);
	return result;
}

module.exports = wordWrap;
