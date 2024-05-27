// Tools for writing command-line apps in Node.
// Copyright (c) 2016 - 2018 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var readline = require('readline');
var path = require('path');
var chalk = require('chalk');
var stringWidth = require('string-width');
var widestLine = require('widest-line');
var repeating = require('repeating');
var wordWrap = require('word-wrap');

var Tools = require('pixl-tools');
var Args = require('pixl-args');
var args = new Args();

var cli = module.exports = {
	
	// CLI args hash
	args: args.get(),
	
	// expose some 3rd party utilities
	chalk: chalk,
	stringWidth: stringWidth,
	widestLine: widestLine,
	wordWrap: wordWrap,
	Tools: Tools,
	
	// for stripping colors:
	ansiPattern: new RegExp([
		'[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
		'(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
	].join('|'), 'g'),
	
	mapArgs: function(aliases) {
		// apply alias lookup to a set of args
		// e.g. { 'q':'quiet', 'v':'verbose' }
		for (var key in aliases) {
			if (key in this.args) {
				this.args[ aliases[key] ] = this.args[key];
				delete this.args[key];
			}
		}
	},
	
	tty: function() {
		// return true if stdout is connected to a TTY, 
		// i.e. so we can ask the user things
		return process.stdout.isTTY;
	},
	
	width: function() {
		// returns current terminal width
		if (!this.tty()) return 0;
		return process.stdout.columns;
	},
	
	prompt: function(text, def, callback) {
		// prompt user for input, send answer to callback
		var self = this;
		if (!this.tty()) return callback(def);
		var rl = readline.createInterface(process.stdin, process.stdout);
		
		if (!text.match(/\s$/)) text += ' ';
		if (def) text += '[' + def + '] ';
		
		this.currentPrompt = text;
		
		rl.question(text, function(answer) {
			rl.close();
			delete self.currentPrompt;
			callback( answer || def );
		} );
	},
	
	clearPrompt: function() {
		// erase previous prompt text, if any
		if (this.currentPrompt) {
			process.stdout.write( "\r" + this.space( stringWidth(this.currentPrompt) ) + "\r" );
		}
	},
	
	restorePrompt: function() {
		// restore previous prompt text, if any
		if (this.currentPrompt) {
			process.stdout.write( this.currentPrompt );
		}
	},
	
	yesno: function(text, def, callback) {
		// prompt user with a yes/no question
		// callback will be sent a true/false value
		this.prompt( text.trim() + " (y/n) ", def, function(answer) {
			callback( answer && answer.match(/y/i) );
		} );
	},
	
	repeat: function(text, amount) {
		// repeat string by specified number of times
		if (!amount || (amount < 0)) return "";
		return repeating(amount, ''+text);
	},
	
	space: function(amount) {
		// generate some amount of whitespace
		return this.repeat(" ", amount);
	},
	
	pad: function(text, width) {
		// pad a string with spaces on right side to take up specified width
		return text + this.space(width - stringWidth(text));
	},
	
	center: function(text, width) {
		// center string horizontally
		var self = this;
		text = text.toString().trim();
		if (!width) width = widestLine(text);
		
		// recurse for multi-line text blobs
		if (text.match(/\n/)) {
			return text.split(/\n/).map(function(line) {
				return self.center(line, width);
			}).join("\n");
		} // multi-line
		
		var margin = Math.floor( (width - stringWidth(text)) / 2 );
		var output = this.space(margin) + text;
		var remain = width - stringWidth(output);
		output += this.space(remain);
		return output;
	},
	
	wrap: function(text, width) {
		// return word-wrapped text block
		return wordWrap( text, {
			width: width,
			indent: "",
			newline: "\n",
			trim: true,
			cut: false
		} );
	},
	
	box: function(text, args) {
		// ┌───────────────────────────────────────┐
		// │  Wrap a text string in an ASCII box.  │
		// └───────────────────────────────────────┘
		var self = this;
		text = text.toString();
		
		if (!args) args = {};
		var width = args.width || 0;
		var hspace = ("hspace" in args) ? args.hspace : 1;
		var vspace = args.vspace || 0;
		var styles = args.styles || ["gray"];
		var indent = args.indent || "";
		if (typeof(indent) == 'number') indent = cli.space(indent);
		
		var output = [];
		
		// calc width / wrap text
		if (width) text = this.wrap(text, width);
		else width = widestLine(text);
		width += (hspace * 2);
		
		// top border
		output.push( indent + this.applyStyles("┌" + this.repeat("─", width) + "┐", styles) );
		
		// left, content, right
		var lines = text.split(/\n/);
		while (vspace-- > 0) {
			lines.unshift( "" );
			lines.push( "" );
		}
		lines.forEach( function(line) {
			line = self.space(hspace) + line + self.space(hspace);
			output.push(
				indent + 
				self.applyStyles("│", styles) + 
				self.pad(line, width) + 
				self.applyStyles("│", styles) 
			);
		} );
		
		// bottom border
		output.push( indent + this.applyStyles("└" + this.repeat("─", width) + "┘", styles) );
		
		return output.join("\n");
	},
	
	applyStyles: function(text, styles) {
		// apply one or more chalk styles or functions to text string
		if (!styles) return text;
		styles.forEach( function(style) {
			if (typeof style === 'function') {
				text = style( text );
			} else {
				text = chalk[style]( text );
			}
		} );
		return text;
	},
	
	tree: function(dir, indent, args) {
		// render dir/file tree view based on array of files/dirs
		var self = this;
		if (!dir) dir = ".";
		if (!indent) indent = "";
		if (!args) args = {};
		var output = [];
		
		args.folderStyles = args.folderStyles || ["bold", "yellow"];
		args.fileStyles = args.fileStyles || ["green"];
		args.symlinkStyles = args.symlinkStyles || ["purple"];
		args.lineStyles = args.lineStyles || ["gray"];
		args.includeFilter = args.includeFilter || /./;
		args.excludeFilter = args.excludeFilter || /(?!)/;
		
		if (!indent) {
			output.push( this.applyStyles( path.basename(dir) + "/", args.folderStyles ) );
		}
		
		fs.readdirSync(dir).forEach( function(filename, idx, arr) {
			if (!filename.match(args.includeFilter) || filename.match(args.excludeFilter)) return;
			var file = path.join( dir, filename );
			var stats = fs.statSync(file);
			var last = (idx == arr.length - 1);
			var prefix = indent + self.applyStyles( " " + (last ? "└" : "├"), args.lineStyles ) + " ";
			
			if (stats.isDirectory()) {
				output.push( prefix + self.applyStyles(filename + "/", args.folderStyles) );
				var results = self.tree(file, indent + self.applyStyles( last ? "  " : " │", args.lineStyles ) + " ", args );
				if (results) output.push( results );
			}
			else if (stats.isSymbolicLink()) {
				output.push( prefix + self.applyStyles(filename, args.symlinkStyles) );
			}
			else {
				output.push( prefix + self.applyStyles(filename, args.fileStyles) );
			}
		} );
		
		return output.length ? output.join("\n") : "";
	},
	
	autoFitTableRows: function(rows, args) {
		// add ellipsis to rows as needed to fit entire table into horiz terminal width
		var self = this;
		var avail_width = (this.width() - (stringWidth(args.indent) * 2));
		if (avail_width < 1) return;
		
		var max_col_widths = [];
		rows.forEach( function(cols, idx) {
			cols.forEach( function(col, idy) {
				max_col_widths[idy] = Math.max( max_col_widths[idy] || 0, stringWidth(''+col) );
			} );
		} );
		
		var measureTableWidth = function() {
			// measure table width with current settings and max_col_widths "virtually" applied
			var widestCols = [];
			rows.forEach( function(cols, idx) {
				cols.forEach( function(col, idy) {
					var sw = Math.min( stringWidth(''+col), max_col_widths[idy] );
					widestCols[idy] = Math.max( widestCols[idy] || 0, sw + 2 );
				} );
			} );
			
			var numCols = widestCols.length;
			var line = "┌";
			widestCols.forEach( function(num, idx) {
				line += self.repeat("─", num);
				if (idx < numCols - 1) line += "┬";
			} );
			line += "┐";
			
			return line.length;
		}; // measureTableWidth
		
		// now keep chopping down max_col_widths until we fit
		while (measureTableWidth() > avail_width) {
			// find largest max_col_widths and decrement it by 1
			var longest_col_width = Math.max.apply( Math, max_col_widths );
			if (longest_col_width < 2) return; // e-brake
			
			var longest_col_idx = max_col_widths.indexOf(longest_col_width);
			if (longest_col_idx == -1) return; // sanity
			
			max_col_widths[longest_col_idx]--;
		}
		
		// finally prune affected columns, trying to preserve ANSI color inside column value
		rows.forEach( function(cols, idx) {
			cols.forEach( function(col, idy) {
				col = '' + col;
				if (stringWidth(col) > max_col_widths[idy]) {
					var suffix = '';
					var prefix = '';
					
					while (col.match(/^(\u001b\[[^m]*?m)/)) {
						prefix += RegExp.$1;
						col = col.replace(/^(\u001b\[[^m]*?m)/, '');
					}
					
					while (col.match(/(\u001b\[[^m]*?m)$/)) {
						suffix = RegExp.$1 + suffix;
						col = col.replace(/(\u001b\[[^m]*?m)$/, '');
					}
					
					cols[idy] = prefix + col.substring(0, max_col_widths[idy] - 1) + '…' + suffix;
				} // too wide
			});
		});
	},
	
	table: function(rows, args) {
		// render table of cols/rows with unicode borders
		// rows should be an array of arrays (columns), with row 0 being the header
		var self = this;
		
		// optional args
		if (!args) args = {};
		args.headerStyles = args.headerStyles || ["bold", "yellow"];
		args.borderStyles = args.borderStyles || ["gray"];
		args.textStyles = args.textStyles || ["cyan"];
		args.indent = args.indent || "";
		if (typeof(args.indent) == 'number') args.indent = cli.space(args.indent);
		
		if (args.autoFit) this.autoFitTableRows(rows, args);
		
		// calculate widest columns (+1spc of hpadding)
		var widestCols = [];
		rows.forEach( function(cols, idx) {
			cols.forEach( function(col, idy) {
				widestCols[idy] = Math.max( widestCols[idy] || 0, stringWidth(''+col) + 2 );
			} );
		} );
		
		var numCols = widestCols.length;
		var output = [];
		
		// top border
		var line = "┌";
		widestCols.forEach( function(num, idx) {
			line += self.repeat("─", num);
			if (idx < numCols - 1) line += "┬";
		} );
		line += "┐";
		output.push( args.indent + this.applyStyles(line, args.borderStyles) );
		
		// header row
		var line = this.applyStyles("│", args.borderStyles);
		rows.shift().forEach( function(col, idx) {
			col = self.applyStyles(" " + col + " ", args.headerStyles);
			line += self.pad(col, widestCols[idx]) + self.applyStyles("│", args.borderStyles);
		} );
		output.push(args.indent + line);
		
		// header divider
		var line = "├";
		widestCols.forEach( function(num, idx) {
			line += self.repeat("─", num);
			if (idx < numCols - 1) line += "┼";
		} );
		line += "┤";
		output.push( args.indent + this.applyStyles(line, args.borderStyles) );
		
		// main content
		rows.forEach( function(cols, idx) {
			var line = self.applyStyles("│", args.borderStyles);
			cols.forEach( function(col, idy) {
				col = self.applyStyles(" " + col + " ", args.textStyles);
				line += self.pad(col, widestCols[idy]) + self.applyStyles("│", args.borderStyles);
			} );
			output.push(args.indent + line);
		} );
		
		// bottom border
		var line = "└";
		widestCols.forEach( function(num, idx) {
			line += self.repeat("─", num);
			if (idx < numCols - 1) line += "┴";
		} );
		line += "┘";
		output.push( args.indent + this.applyStyles(line, args.borderStyles) );
		
		return output.join("\n");
	},
	
	loadFile: function(file) {
		// load file into memory synchronously, return string
		return fs.readFileSync( file, { encoding: 'utf8' } );
	},
	
	saveFile: function(file, content) {
		// save file to disk synchronously
		fs.writeFileSync( file, content );
	},
	
	appendFile: function(file, content) {
		// append to file synchronously
		fs.appendFileSync( file, content );
	},
	
	jsonPretty: function(mixed) {
		// return pretty-printed JSON (which I always forget how to do in Node)
		return JSON.stringify( mixed, null, "\t" );
	},
	
	stripColor: function(text) {
		// strip ANSI colors from text
		return text.replace( this.ansiPattern, '' );
	},
	
	setLogFile: function(file) {
		// log all output from our print methods to file
		this.logFile = file;
	},
	
	log: function(msg) {
		// log something (if log file is configured)
		if (this.logFile) {
			if (typeof(msg) == 'object') msg = JSON.stringify(msg);
			else if (!msg.match(/\S/)) return; // skip whitespace
			var dargs = Tools.getDateArgs( Tools.timeNow() );
			var line = '[' + dargs.yyyy_mm_dd + ' ' + dargs.hh_mi_ss + '] ' + this.stripColor(msg.trim()).trim() + "\n";
			fs.appendFileSync( this.logFile, line );
		}
	},
	
	print: function(msg) {
		// print message to console
		if (!this.args.quiet) {
			if (this.progress.running) this.progress.erase();
			process.stdout.write(msg);
			if (this.progress.running) this.progress.draw();
		}
		this.log(msg);
	},
	
	println: function(msg) {
		// print plus EOL
		this.print( msg + "\n" );
	},
	
	verbose: function(msg) {
		// print only in verbose mode
		if (this.args.verbose) this.print(msg);
		else this.log(msg);
	},
	
	verboseln: function(msg) {
		// verbose print plus EOL
		this.verbose( msg + "\n" );
	},
	
	warn: function(msg) {
		// print to stderr
		if (!this.args.quiet) {
			if (this.progress.running) this.progress.erase();
			process.stderr.write(msg);
			if (this.progress.running) this.progress.draw();
		}
		this.log(msg);
	},
	
	warnln: function(msg) {
		// warn plus EOL
		this.warn( msg + "\n" );
	},
	
	die: function(msg) {
		// print to stderr and exit with non-zero code
		if (this.progress.running) this.progress.end();
		this.warn(msg);
		process.exit(1);
	},
	
	dieln: function(msg) {
		// die plus EOL
		this.die( msg + "\n" );
	},
	
	global: function() {
		// pollute global namespace with our wares
		var self = this;
		
		// copy over some objects
		global.args = this.args;
		global.progress = this.progress;
		global.Tools = Tools;
		
		// bind wrap functions
		["prompt", "yesno", "table", "box", "wrap", "center", "print", "println", "verbose", "verboseln", "warn", "warnln", "die", "dieln", "loadFile", "saveFile", "appendFile"].forEach( function(func) {
			global[func] = self[func].bind(self);
		} );
		
		// copy over some common pixl-tools functions
		["commify", "shortFloat", "pct", "pluralize", "ucfirst"].forEach( function(func) {
			global[func] = self[func]; // these are already bound to Tools
		} );
		
		// expose chalk styles as global keywords
		["reset","bold","dim","italic","underline","inverse","hidden","strikethrough","black","red","green","yellow","blue","magenta","cyan","white","gray","grey","bgBlack","bgRed","bgGreen","bgYellow","bgBlue","bgMagenta","bgCyan","bgWhite"].forEach( function(key) {
			global[key] = chalk[key];
		} );
	},
	
	progress: {
		// unicode progress bar
		args: {},
		defaults: {
			spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
			braces: ['⟦', '⟧'],
			filling: [' ', '⡀', '⡄', '⡆', '⡇', '⣇', '⣧', '⣷'],
			filled: '⣿',
			indent: "",
			styles: {
				spinner: ['bold', 'green'],
				braces: ['gray'],
				bar: ['bold', 'cyan'],
				indeterminate: ['gray'],
				pct: ['bold', 'yellow'],
				remain: ['green'],
				text: []
			},
			pct: true,
			width: 30,
			freq: 100,
			remain: true,
			color: true,
			unicode: true,
			catchInt: false,
			catchTerm: false,
			catchCrash: false,
			exitOnSig: true
		},
		asciiOverrides: {
			spinner: ['|', '/', '-', "\\"],
			filling: [' ', '.', ':'],
			filled: '#',
			braces: ['[', ']']
		},
		
		start: function(overrides) {
			// start new progress session
			if (!cli.tty()) return;
			
			// copy defaults and apply user overrides
			var args = Tools.copyHash( this.defaults );
			Tools.mergeHashInto( args, overrides || {} );
			
			if (!args.amount) args.amount = 0;
			if (!args.max) args.max = 1.0;
			if (!args.text) args.text = "";
			if (!args.lastRemainCheck) args.lastRemainCheck = 0;
			if (!args.timeStart) args.timeStart = Tools.timeNow();
			
			// no color?  wipe all chalk styles
			if (!args.color) args.styles = {};
			
			// ascii mode?  copy over safe chars
			if (!args.unicode) {
				Tools.mergeHashInto( args, this.asciiOverrides );
			}
			
			// make sure indent doesn't contain a hard tab
			if (typeof(args.indent) == 'number') args.indent = cli.space(args.indent);
			args.indent = args.indent.replace(/\t/g, "    ");
			
			this.args = args;
			this.running = true;
			this.spinFrame = 0;
			this.lastLine = "";
			
			this.draw();
			this.timer = setInterval( this.draw.bind(this), args.freq );
			
			// hide CLI cursor
			if (!this.args.quiet) process.stdout.write('\u001b[?25l');
			
			// just in case
			process.once('exit', function() {
				if (cli.progress.running) cli.progress.end();
			} );
			
			if (args.catchInt) {
				process.once('SIGINT', function() {
					if (cli.progress.running) cli.progress.end();
					if (args.exitOnSig) process.exit(128 + 2);
				} );
			}
			if (args.catchTerm) {
				process.once('SIGTERM', function() {
					if (cli.progress.running) cli.progress.end();
					if (args.exitOnSig) process.exit(128 + 15);
				} );
			}
			if (args.catchCrash) {
				process.once('uncaughtException', function() {
					if (cli.progress.running) cli.progress.end();
				} );
			}
		},
		
		draw: function() {
			// draw progress bar, spinner
			if (!this.running) return;
			if (!cli.tty()) return;
			
			var args = this.args;
			var line = args.indent;
			
			// spinner
			line += cli.applyStyles( args.spinner[ this.spinFrame++ % args.spinner.length ], args.styles.spinner );
			line += " ";
			
			// progress bar
			line += cli.applyStyles( args.braces[0], args.styles.braces );
			var bar = "";
			var width = Math.max(0, Math.min(args.amount / args.max, 1.0)) * args.width;
			var partial = width - Math.floor(width);
			
			bar += cli.repeat(args.filled, Math.floor(width));
			if (partial > 0) {
				bar += args.filling[ Math.floor(partial * args.filling.length) ];
			}
			bar += cli.space(args.width - stringWidth(bar));
			
			line += cli.applyStyles( bar, (args.amount === args.max) ? args.styles.indeterminate : args.styles.bar );
			line += cli.applyStyles( args.braces[1], args.styles.braces );
			
			// percentage
			if (args.pct) {
				line += " ";
				var pct = cli.pct(args.amount, args.max, true);
				line += cli.applyStyles( pct, args.styles.pct );
			}
			
			// remaining
			var now = Tools.timeNow();
			var elapsed = now - args.timeStart;
			
			if ((args.amount > 0) && (args.amount < args.max) && (elapsed >= 5) && args.remain) {
				if (now - args.lastRemainCheck >= 1.0) {
					args.lastRemainString = cli.getNiceRemainingTime( elapsed, args.amount, args.max, true, true );
					args.lastRemainCheck = now;
				}
				if (args.lastRemainString) {
					line += cli.applyStyles( " (" + args.lastRemainString + " remain)", args.styles.remain );
				}
			}
			
			// custom text
			if (args.text) {
				line += " ";
				line += cli.applyStyles( args.text.trim(), args.styles.text );
			}
			
			// clean up last line
			if (this.lastLine) {
				var curWidth = stringWidth(line);
				var lastWidth = stringWidth(this.lastLine);
				if (curWidth < lastWidth) {
					line += cli.space(lastWidth - curWidth);
				}
			}
			
			if (!this.args.quiet) process.stdout.write( line + "\r" );
			this.lastLine = line;
		},
		
		update: function(args) {
			if (!this.running) return;
			if (!cli.tty()) return;
			
			if (typeof(args) == 'number') {
				// just updating the amount
				this.args.amount = args;
			}
			else {
				// update any key/value pairs
				for (var key in args) { 
					this.args[key] = args[key]; 
				}
			}
			this.args.amount = Math.max(0, Math.min(this.args.max, this.args.amount));
		},
		
		erase: function() {
			// erase progress
			if (!this.running) return;
			if (!cli.tty()) return;
			if (this.lastLine && !this.args.quiet) {
				process.stdout.write( cli.space( stringWidth(this.lastLine) ) + "\r" );
			}
		},
		
		end: function(erase) {
			// end of progress session
			if (!this.running) return;
			if (!cli.tty()) return;
			
			if (erase !== false) {
			  this.erase();
			}
			clearTimeout( this.timer );
			this.running = false;
			this.args = {};
			this.lastLine = '';
			
			// restore CLI cursor
			if (!this.args.quiet) process.stdout.write('\u001b[?25h');
		}
	} // progress
	
};

// import some common utilities
["getTextFromBytes", "commify", "shortFloat", "pct", "zeroPad", "getTextFromSeconds", "getNiceRemainingTime", "pluralize", "ucfirst"].forEach( function(func) {
	module.exports[func] = Tools[func].bind(Tools);
} );

// import chalk into our module
["reset","bold","dim","italic","underline","inverse","hidden","strikethrough","black","red","green","yellow","blue","magenta","cyan","white","gray","grey","bgBlack","bgRed","bgGreen","bgYellow","bgBlue","bgMagenta","bgCyan","bgWhite"].forEach( function(key) {
	module.exports[key] = chalk[key];
} );
