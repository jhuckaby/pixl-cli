// Terminal display-width measurement for pixl-cli.

var Util = require('./util');
var ansiPattern = Util.ansiPattern;
var graphemeSegmenter = Util.graphemeSegmenter;

// These built-in Unicode properties let us identify emoji without carrying a large,
// generated lookup table.  VS16 changes text-default symbols to emoji presentation.
var zeroWidthClusterPattern = /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Format}|\p{Nonspacing_Mark}|\p{Enclosing_Mark}|\p{Surrogate})+$/u;
var emojiPattern = /\p{Emoji}/u;
var emojiPresentationPattern = /\p{Emoji_Presentation}/u;
var emojiModifierPattern = /\p{Emoji_Modifier}/u;
var regionalIndicatorPattern = /\p{Regional_Indicator}/gu;
var extendedPictographicPattern = /\p{Extended_Pictographic}/gu;
var keycapPattern = /^[\d#*]\uFE0F?\u20E3$/;
var keycapBaseWithVs16Pattern = /^[\d#*]\uFE0F$/;

function stringWidth(text) {
	// Measure Western Unicode and emoji terminal columns, ignoring ANSI styling.
	if ((typeof(text) != 'string') || !text.length) return 0;
	text = text.replace(ansiPattern, '');
	if (!text.length) return 0;
	
	// Printable ASCII needs no Unicode segmentation and is by far the common case.
	if (text.match(/^[\u0020-\u007E]*$/)) return text.length;
	
	var width = 0;
	var segments = graphemeSegmenter.segment(text);
	for (var item of segments) {
		var segment = item.segment;
		if (zeroWidthClusterPattern.test(segment)) continue;
		
		// Native emoji generally occupy two terminal columns.  The extra checks cover
		// text-default emoji switched by VS16, flags, keycaps and unqualified sequences.
		var regionalIndicators = segment.match(regionalIndicatorPattern);
		var pictographs = segment.match(extendedPictographicPattern);
		var isEmoji = false;
		
		if (segment.includes('\u20E3')) {
			isEmoji = keycapPattern.test(segment);
		}
		else if (regionalIndicators) {
			isEmoji = (regionalIndicators.length >= 2);
		}
		else {
			isEmoji = emojiPresentationPattern.test(segment) ||
				(emojiPattern.test(segment) && segment.includes('\uFE0F') &&
					!keycapBaseWithVs16Pattern.test(segment)) ||
				(emojiPattern.test(segment) && emojiModifierPattern.test(segment)) ||
				(segment.includes('\u200D') && pictographs && (pictographs.length >= 2));
		}
		
		width += isEmoji ? 2 : 1;
	}
	
	return width;
}

function widestLine(text) {
	// Return the visual width of the widest line in a multi-line string.
	var width = 0;
	text.split(/\n/).forEach( function(line) {
		width = Math.max( width, stringWidth(line) );
	} );
	return width;
}

function truncate(text, width, suffix) {
	// Truncate a string to an exact terminal display width.  Preserve complete ANSI
	// sequences and grapheme clusters, and retain trailing SGR codes to reset styles.
	if (typeof(text) != 'string') text = '' + text;
	if (suffix == null) suffix = '';
	if (stringWidth(text) <= width) return text;
	
	var suffixWidth = stringWidth(suffix);
	var contentWidth = Math.max(0, width - suffixWidth);
	var outputWidth = 0;
	var output = '';
	var units = Util.splitAnsiGraphemes(text);
	var trailingAnsi = [];
	
	for (var idx = units.length - 1; idx >= 0; idx--) {
		if (!units[idx].ansi) break;
		if (units[idx].text.match(/^(?:\u001B\[|\u009B)[^m]*m$/)) {
			trailingAnsi.unshift(units[idx].text);
		}
	}
	
	for (var idx = 0, len = units.length; idx < len; idx++) {
		var unit = units[idx];
		if (unit.ansi) {
			output += unit.text;
			continue;
		}
		
		var unitWidth = stringWidth(unit.text);
		if ((outputWidth + unitWidth) > contentWidth) break;
		output += unit.text;
		outputWidth += unitWidth;
	}
	
	// A wide grapheme may not fit the final available cell.  Pad that cell so the
	// ellipsis still lands at the exact requested width and tables remain aligned.
	if (outputWidth < contentWidth) output += ' '.repeat(contentWidth - outputWidth);
	return output + suffix + trailingAnsi.join('');
}

// Preserve the compatibility aliases provided by the old CommonJS dependencies.
stringWidth.default = stringWidth;
widestLine.default = widestLine;

module.exports = {
	stringWidth: stringWidth,
	widestLine: widestLine,
	truncate: truncate
};
