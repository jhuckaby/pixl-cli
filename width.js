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

// Preserve the compatibility aliases provided by the old CommonJS dependencies.
stringWidth.default = stringWidth;
widestLine.default = widestLine;

module.exports = {
	stringWidth: stringWidth,
	widestLine: widestLine
};
