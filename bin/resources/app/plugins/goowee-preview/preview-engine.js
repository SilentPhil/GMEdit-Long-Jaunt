/* GooWee source preview. This is a bounded, allowlisted abstract interpreter, not
 * a GML runtime: callbacks and unknown calls are never executed. No eval/Function.
 * Public API: analyze(source, {width,height,entry,assets,constants}). Source lines
 * are 1-based; node bounds are absolute viewport pixels. See README.md. */
(function(root, factory) {
	"use strict";
	var api = factory();
	if (typeof module === "object" && module.exports) module.exports = api;
	if (root) root.GooWeePreviewEngine = api;
})(typeof window !== "undefined" ? window : null, function() {
	"use strict";
	var Layout = typeof window !== "undefined" ? window.GooWeePreviewLayout : require("./preview-layout.js");
	var Annotations = typeof window !== "undefined" ? window.GooWeePreviewAnnotations : require("./preview-annotations.js");
	function dict() { return Object.create(null); }
	var valueBrand=Symbol("GooWeePreviewValue");
	var preboundStaticMethods=Symbol("GooWeePreviewStaticMethods");
	var functionStaticScope=Symbol("GooWeePreviewFunctionStatics");
	function tagged(value,kind){Object.defineProperty(value,valueBrand,{value:kind});return value;}
	function isKind(value,kind){return !!value && value[valueBrand]===kind;}
	function isNode(value){return isKind(value,"node");}
	function isStruct(value){return isKind(value,"struct");}
	function closureValue(fn,env,boundSelf){return tagged({fn:fn,env:env,boundSelf:boundSelf},"closure");}
	function methodValue(receiver,name){return tagged({receiver:receiver,method:name},"method");}
	function sameValue(a,b){
		if(a===b)return true;
		if(isKind(a,"closure") && isKind(b,"closure"))return a.fn===b.fn && a.boundSelf===b.boundSelf;
		if(isKind(a,"method") && isKind(b,"method"))return a.receiver===b.receiver && a.method===b.method;
		return false;
	}
	function structValue(type,props){return tagged({struct:true,props:props || dict(),type:type},"struct");}
	function unknown(name) { return tagged({unknown: true, name: name || "dynamic"},"unknown"); }
	function isUnknown(v) { return isKind(v,"unknown"); }
	function unit(kind, value) { return tagged({unit: kind, value: value},"unit"); }
	function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
	function safeKey(k) { return k !== "__proto__" && k !== "prototype" && k !== "constructor"; }
	function shortName(s) { return s.replace(/^gw_/, ""); }
	function sourceKey(path){var key=String(path || "").replace(/\\/g,"/");return /^[A-Za-z]:\//.test(key)?key.toLowerCase():key;}
	function isNativeAliasTarget(name){return /^(?:array_(?:map|filter|foreach|find_index|any|all|push|pop|copy|concat|create|length|sort|get_index|contains|clone)|ds_(?:map|priority)_\w+|surface_\w+|sprite_get_\w+|sprite_exists|sprite_delete|draw_sprite(?:_part)?(?:_ext)?|draw_surface(?:_part)?(?:_ext)?|matrix_\w+|string(?:_\w+)?|real)$/.test(name);}
	function fontName(value) { return typeof value === "string" ? value : isUnknown(value) ? value.name : null; }
	function lexRaw(source) {
		var out = [];
		var i = 0, line = 1;
		function emit(token) { token.start=start;token.end=i;out.push(token); }
		while (i < source.length && out.length < 120000) {
			var start = i, startLine = line, c = source[i], value;
			if (/\s/.test(c)) { if (c === "\n") line++; i++; continue; }
			if (source.substr(i, 2) === "//") { while (i < source.length && source[i] !== "\n") i++; var comment = source.slice(start,i); if (/^\/\/!\s*#(?:import|mfunc)\b/.test(comment)) emit({v:comment.replace(/^\/\/!\s*/,""),k:"directive",line:line}); continue; }
			if (source.substr(i, 2) === "/*") { i += 2; while (i < source.length && source.substr(i, 2) !== "*/") { if (source[i] === "\n") line++; i++; } i += 2; continue; }
			if (c === "#" && /[A-Za-z]/.test(source[i + 1] || "") && !/^#[0-9a-f]{6}(?!\w)/i.test(source.slice(i))) {
				while (i < source.length && source[i] !== "\n") i++;
				emit({v: source.slice(start, i), k: "directive", line: line}); continue;
			}
			if (c === '"' || c === "'" || (c === "@" && /["']/.test(source[i + 1]))) {
				var verbatim = c === "@", quote = verbatim ? source[++i] : c; i++; value = "";
				while (i < source.length && source[i] !== quote) {
					c = source[i++]; if (c === "\n") line++;
					if (c === "\\" && !verbatim && i < source.length) { c = source[i++]; value += ({n:"\n",r:"\r",t:"\t"})[c] || c; }
					else value += c;
				}
				i++; emit({v:value,k:"string",line:startLine}); continue;
			}
			var rest = source.slice(i), m;
			if ((m = /^(?:#[0-9a-fA-F]{6}|\$[0-9a-fA-F]+|0x[0-9a-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/.exec(rest))) {
				i += m[0].length; value = m[0]; emit({v:value,k:"number",line:line}); continue;
			}
			if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) {
				i += m[0].length;
				emit({v:m[0],k:"id",line:line});
				continue;
			}
			m = /^(?:\?\?=|\?\?|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|%=|\|=|&=|\^=|<<|>>|=>|->)/.exec(rest);
			value = m ? m[0] : c; i += value.length; emit({v:value,k:"punct",line:line});
		}
		start=i;emit({v:"<eof>",k:"eof",line:line}); return out;
	}
	function lex(source, context) {
		var raw=lexRaw(source), macros=Object.assign(dict(),context && context.macros), mfuncs=Object.assign(dict(),context && context.macroFunctions);
		var emitted=0, expanding=dict(), macroBodies=dict(), codeMacros=dict();
		function fail(token,message){var error=Error(message);error.previewSyntax=true;error.line=token.line;throw error;}
		raw.forEach(function(token){
			if(token.k!=="directive")return;
			var declaration=/^#macro\s+(\w+)\s+([^\r\n]*)/.exec(token.v);
			if(declaration)macros[declaration[1]]=declaration[2];
			var definition=/^#mfunc\s+(\w+)\s+(\{.*\})\s*$/.exec(token.v);
			if(definition){try{mfuncs[definition[1]]=JSON.parse(definition[2]);}catch(_){fail(token,"Invalid macro-function metadata for "+definition[1]+".");}}
		});
		function at(token,anchor){return {v:token.v,k:token.k,start:anchor.start,end:anchor.end,line:anchor.line};}
		function macroBody(name){
			if(own(macroBodies,name))return macroBodies[name];
			var expression=macros[name];if(expression && typeof expression==="object")expression=expression.expr;
			return macroBodies[name]=typeof expression==="string"?lexRaw(expression).filter(function(token){return token.k!=="eof";}):null;
		}
		function isCodeMacro(name,anchor){
			if(own(codeMacros,name))return codeMacros[name];
			// Expand statement fragments lexically so braces, return and local
			// declarations belong to the caller. Ordinary expression macros stay
			// deferred, preserving their scope and exact-path preview overrides.
			var pending=[name],seen=new Set(),examined=0;
			while(pending.length){
				var current=pending.pop();if(seen.has(current))continue;seen.add(current);
				if(seen.size>128)fail(anchor,"Macro classification dependency limit exceeded.");
				if(codeMacros[current]===true)return codeMacros[name]=true;
				var body=macroBody(current);if(!body)continue;
				for(var bi=0;bi<body.length;bi++){
					var item=body[bi];if(++examined>120000)fail(anchor,"Macro classification token limit exceeded.");
					if(item.k==="punct" && /^(?:;|\{|\})$/.test(item.v) || item.k==="id" && /^(?:var|static|if|else|for|while|repeat|with|switch|case|default|do|try|catch|finally|return|break|continue|exit|throw)$/.test(item.v))return codeMacros[name]=true;
					if(item.k==="id" && own(macros,item.v))pending.push(item.v);
				}
			}
			return codeMacros[name]=false;
		}
		function expand(tokens,depth){
			if(depth>32)fail(tokens[0] || raw[0],"Macro expansion depth limit exceeded.");
			var out=[];
			function append(items){emitted+=items.length;if(emitted>120000)fail(items[0] || raw[0],"Macro expansion token limit exceeded.");Array.prototype.push.apply(out,items);}
			for(var i=0;i<tokens.length;i++){
				var token=tokens[i], name=token.v;
				if(token.k!=="id"){append([token]);continue;}
				if(own(macros,name) && (/_mf\d+$/.test(name) || isCodeMacro(name,token))){
					if(expanding[name])fail(token,"Recursive token macro "+name+".");
					var body=macroBody(name);if(!body){append([token]);continue;}
					expanding[name]=true;
					try{append(expand(body.map(function(item){return at(item,token);}),depth+1));}finally{delete expanding[name];}
					continue;
				}
				// Older indexes may omit scope's saved token definitions.
				var scope=/^scope(\d+)_mf(\d+)$/.exec(name);
				if(scope && +scope[2]<=+scope[1]*2){var part=+scope[2];append([at({v:part===0?"{":part===+scope[1]*2?"}":part%2?":":",",k:"punct"},token)]);continue;}
				var definition=mfuncs[name];
				if(definition && Array.isArray(definition.order) && tokens[i+1] && tokens[i+1].v==="(" && (!tokens[i-1] || tokens[i-1].v!=="function")){
					if(expanding[name])fail(token,"Recursive macro function "+name+".");
					var args=[], argument=[], stack=[], close=i+2, pairs={"(":")","[":"]","{":"}"};
					for(;close<tokens.length;close++){
						var item=tokens[close];
						if(item.k==="punct"){
							if(!stack.length && item.v===")"){if(argument.length || args.length)args.push(argument);break;}
							if(!stack.length && item.v===","){args.push(argument);argument=[];continue;}
							if(own(pairs,item.v))stack.push(pairs[item.v]);else if(/^[)\]}]$/.test(item.v) && stack.pop()!==item.v)fail(item,"Unbalanced macro-function argument.");
						}
						argument.push(item);
					}
					if(close>=tokens.length)fail(token,"Unclosed macro function "+name+".");
					if(Array.isArray(definition.args) && args.length!==definition.args.length)fail(token,"Macro function "+name+" expects "+definition.args.length+" arguments.");
					// A nested source call to the same macro is valid; only recursive
					// references introduced by its definition are a cycle.
					args=args.map(function(argument){return expand(argument,depth+1);});
					var generated=[];
					for(var index=0;index<=definition.order.length;index++){
						var partName=name+"_mf"+index;
						if(!own(macros,partName))fail(token,"Missing token macro "+partName+".");
						generated.push(at({v:partName,k:"id"},index===definition.order.length?tokens[close]:token));
						if(index===definition.order.length)break;
						var order=definition.order[index];
						if(!Number.isInteger(order) || order<0 || order>=args.length)fail(token,"Unsupported argument mapping in macro function "+name+".");
						Array.prototype.push.apply(generated,args[order]);
					}
					expanding[name]=true;try{append(expand(generated,depth+1));}finally{delete expanding[name];}
					i=close;continue;
				}
				append([token]);
			}
			return out;
		}
		var tokens=expand(raw,0);tokens.macroContext={macros:macros,macroFunctions:mfuncs};return tokens;
	}
	var precedence = {"=":1,"+=":1,"-=":1,"*=":1,"/=":1,"%=":1,"|=":1,"&=":1,"^=":1,"??=":1,"?":2,"??":3,"||":4,"or":4,"&&":5,"and":5,"|":6,"^":7,"&":8,"==":9,"!=":9,"<":10,">":10,"<=":10,">=":10,"<<":11,">>":11,"+":12,"-":12,"*":13,"/":13,"%":13,"div":13,"mod":13};
	function Parser(tokens, markers) { this.t = tokens; this.i = 0; this.depth = 0; this.markers=markers || dict(); this.macroContext=tokens.macroContext;this.statements=[];this.blocks=[{id:0,start:0,end:tokens[tokens.length-1].end}];this.blockId=0; }
	Parser.prototype.peek = function(v) { return this.t[this.i].v === v; };
	Parser.prototype.take = function(v) { if (this.peek(v)) { this.i++; return true; } return false; };
	Parser.prototype.next = function() { return this.t[Math.min(this.i++, this.t.length - 1)]; };
	Parser.prototype.fail = function(message) { var error = new Error(message); error.previewSyntax = true; error.line = this.t[Math.min(this.i,this.t.length-1)].line; throw error; };
	// GMEdit unwraps comment annotations on opening a script. Consume the same
	// type forms as GmlTypeParser.skipTypeName, without changing source line numbers.
	Parser.prototype.typeGroup = function(open, close) {
		if (!this.take(open)) return false;
		var stack = [close], pairs = {"<":">","(":")","[":"]","{":"}"};
		while (stack.length && !this.peek("<eof>")) {
			var token = this.t[this.i], v = token.v;
			if (token.k === "string") { this.i++; continue; }
			// The expression lexer keeps shift/comparison operators intact. Inside
			// types these can instead be nested generic closers followed by '='.
			if (stack[stack.length-1] === ">" && (v === ">>" || v === ">=")) {
				this.t.splice(this.i,1,{v:">",k:"punct",line:token.line},{v:v[1],k:"punct",line:token.line}); v = ">";
			}
			this.i++;
			if (own(pairs,v)) stack.push(pairs[v]);
			else if (/^[>\)\]\}]$/.test(v)) { if (v !== stack.pop()) return false; }
		}
		return stack.length === 0;
	};
	Parser.prototype.type = function(depth) {
		if ((depth || 0) > 100) return false;
		var v = this.t[this.i].v;
		if (this.t[this.i].k === "id") {
			this.i++;
			while (this.take(".")) { if (this.t[this.i].k !== "id") return false; this.i++; }
			if (this.peek("<") && !this.typeGroup("<",">")) return false;
		} else if (v === "(" || v === "[" || v === "{") {
			if (!this.typeGroup(v, {"(":")","[":"]","{":"}"}[v])) return false;
		} else return false;
		while (!this.peek("<eof>")) {
			if (this.peek("[") && this.t[this.i+1].v === "]") this.i += 2;
			else if (this.take("?")) continue;
			else if (this.take("|")) return this.type((depth || 0)+1);
			else break;
		}
		return true;
	};
	Parser.prototype.annotation = function(marker) { if (this.take(marker) && !this.type()) this.fail("Incomplete type annotation."); };
	Parser.prototype.params = function() {
		var params = [];
		if (!this.take("(")) this.fail("Expected function parameters.");
		while (!this.peek(")") && !this.peek("<eof>")) {
			if (this.t[this.i].k !== "id") this.fail("Incomplete function parameter.");
			var p = {name:this.next().v}; this.annotation(":");
			if (this.take("=")) p.value = this.expr(2);
			params.push(p);
			if (!this.take(",")) break;
		}
		if (!this.take(")")) this.fail("Expected ')' after function parameters.");
		return params;
	};
	Parser.prototype.isArrow = function() {
		var depth = 0;
		for (var i = this.i; i < this.t.length; i++) {
			if (this.t[i].k !== "punct") continue;
			var v = this.t[i].v;
			if (v === "(") depth++;
			if (v === ")" && --depth === 0) return this.t[i+1].v === "=>";
		}
		return false;
	};
	Parser.prototype.arrow = function(line) {
		var params = this.params(); this.take("=>");
		var body = this.peek("{") ? this.block() : this.take(";") ? {k:"block",body:[this.statement()]} : {k:"block",body:[{k:"return",value:this.expr(2),line:line}]};
		return {k:"fn",name:"",params:params,body:body,base:null,constructor:false,line:line};
	};
	Parser.prototype.block = function() {
		var out = [], previousBlock=this.blockId, block={id:this.blocks.length,start:this.t[this.i].start,end:Infinity};
		this.blocks.push(block);this.blockId=block.id;this.take("{");
		while (!this.peek("}") && !this.peek("<eof>")) { var i = this.i; out.push(this.statement()); if (this.i <= i) this.i++; }
		this.take("}");block.end=this.t[Math.max(0,this.i-1)].end;this.blockId=previousBlock;return {k:"block",body:out};
	};
	Parser.prototype.func = function(line) {
		var name = this.peek("(") ? "" : this.next().v, params = this.params();
		this.annotation("->"); var base = null;
		if (this.take(":")) {
			var baseToken = this.next();
			if (baseToken.k !== "id") this.fail("Expected constructor base.");
			var baseCallee = {k:"id",name:baseToken.v,line:baseToken.line};
			while (this.take(".")) {
				if (this.t[this.i].k !== "id") this.fail("Incomplete constructor base name.");
				baseCallee = {k:"member",object:baseCallee,key:{k:"literal",value:this.next().v},line:baseToken.line};
			}
			if (this.peek("<") && !this.typeGroup("<",">")) this.fail("Incomplete constructor type.");
			base = {k:"call",callee:baseCallee,args:this.args(),line:baseToken.line};
		}
		var ctor = this.take("constructor");
		if (!this.peek("{")) this.fail("Expected function body.");
		var body = this.block();
		return {k:"fn",name:name,params:params,body:body,base:base,constructor:ctor,line:line};
	};
	Parser.prototype.statement = function() {
		var start=this.t[this.i].start, blockId=this.blockId, node=this.statementRaw();
		var last=this.t[Math.max(0,this.i-1)];
		node._start=start;node._end=last.end;node._endLine=last.line;node._blockId=blockId;
		this.statements.push(node);return node;
	};
	Parser.prototype.statementRaw = function() {
		var token = this.t[this.i], line = token.line;
		if(token.k==="id" && own(this.markers,token.v)){
			var annotation=this.markers[token.v];this.i++;this.take(";");
			if(annotation.kind==="skip-next" || annotation.kind==="replace"){
				if(this.peek("<eof>") || this.peek("}"))this.fail("Preview annotation requires a following statement.");
				this.statement();
			}
			return {k:"preview",body:annotation.kind==="skip-next"?[]:parseAnnotated(annotation,this.macroContext),line:annotation.line};
		}
		if (token.k === "directive") { this.i++; return {k:"directive",value:token.v,line:line}; }
		if (this.peek("{")) return this.block();
		if (this.take(";")) return {k:"empty"};
		if (this.take("function")) return this.func(line);
		if (this.take("enum")) {
			var enumName = this.next().v, members = []; this.take("{");
			while (!this.peek("}") && !this.peek("<eof>")) {
				var memberName = this.next().v;
				members.push({name:memberName,value:this.take("=") ? this.expr(2) : null});
				if (!this.take(",")) break;
			}
			this.take("}"); return {k:"enum",name:enumName,members:members,line:line};
		}
		if (this.take("if")) { this.take("("); var cond = this.expr(); this.take(")"); var yes = this.statement(); return {k:"if",cond:cond,yes:yes,no:this.take("else") ? this.statement() : null,line:line}; }
		if (this.take("for")) { this.take("("); var init = this.statement(), test = this.expr(); this.take(";"); var step = this.expr(); this.take(")"); return {k:"for",init:init,test:test,step:step,body:this.statement(),line:line}; }
		if (this.take("repeat") || this.take("while")) { var kind = token.v; this.take("("); var count = this.expr(); this.take(")"); return {k:kind,test:count,body:this.statement(),line:line}; }
		if (this.take("return")) { var value = this.peek(";") || this.peek("}") ? null : this.expr(); this.take(";"); return {k:"return",value:value,line:line}; }
		if (this.take("break") || this.take("continue") || this.take("exit")) { this.take(";"); return {k:token.v,line:line}; }
		if (this.take("var") || this.take("static") || this.take("globalvar")) {
			var vars = []; do { var name = this.next().v; this.annotation(":"); vars.push({name:name,value:this.take("=") ? this.expr(2) : null}); } while (this.take(","));
			this.take(";"); return {k:"vars",vars:vars,line:line,static:token.v === "static"};
		}
		if(this.take("with")){this.take("(");var target=this.expr();this.take(")");return {k:"with",target:target,body:this.statement(),line:line};}
		if(this.take("switch")){
			this.take("(");var switchValue=this.expr();this.take(")");
			if(!this.take("{"))this.fail("Expected switch body.");
			var cases=[],currentCase=null;
			while(!this.peek("}") && !this.peek("<eof>")){
				if(this.take("case")){currentCase={value:this.expr(),body:[]};if(!this.take(":"))this.fail("Expected case colon.");cases.push(currentCase);}
				else if(this.take("default")){currentCase={isDefault:true,body:[]};if(!this.take(":"))this.fail("Expected default colon.");cases.push(currentCase);}
				else {if(!currentCase)this.fail("Expected switch case.");var before=this.i;currentCase.body.push(this.statement());if(this.i===before)this.fail("Incomplete switch case.");}
			}
			if(!this.take("}"))this.fail("Unclosed switch body.");
			return {k:"switch",value:switchValue,cases:cases,line:line};
		}
		if(this.take("try")){
			var attempt=this.statement(),handler=null,exceptionName=null,finalizer=null;
			if(this.take("catch")){if(!this.take("("))this.fail("Expected catch parameter.");exceptionName=this.next().v;if(!this.take(")"))this.fail("Expected catch parameter end.");handler=this.statement();}
			if(this.take("finally"))finalizer=this.statement();
			return {k:"try",body:attempt,handler:handler,exceptionName:exceptionName,finalizer:finalizer,line:line};
		}
		if(this.take("throw")){var thrown=this.expr();this.take(";");return {k:"throw",value:thrown,line:line};}
		if (this.take("do")) {
			if (this.take("(")) { this.expr(); this.take(")"); }
			return {k:"unsupported",body:this.statement(),line:line,label:token.v};
		}
		var expr = this.expr(); this.take(";"); return {k:"expr",value:expr,line:line};
	};
	Parser.prototype.expr = function(min) {
		min = min || 1;
		if (++this.depth > 150) { this.depth--; this.next(); return {k:"unknown"}; }
		var token = this.next(), v = token.v, node;
		if (token.k === "number") node = {k:"literal",value:v[0] === "#" ? v : v[0] === "$" ? parseInt(v.slice(1),16) : Number(v),line:token.line};
		else if (token.k === "string") node = {k:"literal",value:v,line:token.line};
		else if (v === "function") node = this.func(token.line);
		else if (v === "new") { var cls = this.next().v; if (this.peek("<") && !this.typeGroup("<",">")) this.fail("Incomplete constructor type."); var args = this.args(); node = {k:"new",name:cls,args:args,line:token.line}; }
		else if (v === "(") { this.i--; if (this.isArrow()) node = this.arrow(token.line); else { this.i++; node = this.expr(); this.take(")"); } }
		else if (v === "cast") node = this.expr(14);
		else if (v === "[" || v === "{") {
			var list = [], end = v === "[" ? "]" : "}";
			while (!this.peek(end) && !this.peek("<eof>")) {
				var before = this.i;
				if (v === "{") { var key = this.next().v; list.push({key:key,value:this.take(":") ? this.expr(2) : {k:"id",name:key}}); }
				else list.push(this.expr(2));
				if (!this.take(",") || this.i === before) break;
			}
			this.take(end); node = {k:v === "[" ? "array" : "object",items:list,line:token.line};
		}
		else if (v === "!" || v === "-" || v === "+" || v === "~" || v === "not" || v === "++" || v === "--") node = {k:"unary",op:v,value:this.expr(14),line:token.line};
		else node = {k:"id",name:v,line:token.line};
		while (!this.peek("<eof>")) {
			v = this.t[this.i].v;
			if (v === ".") { this.i++; node = {k:"member",object:node,key:{k:"literal",value:this.next().v},line:token.line}; }
			else if (v === "[") { this.i++; if (this.peek("?") || this.peek("#") || this.peek("|") || this.peek("@") || this.peek("$")) this.i++; var index = this.expr(); this.take("]"); node = {k:"member",object:node,key:index,line:token.line}; }
			else if (v === "(") node = {k:"call",callee:node,args:this.args(),line:token.line};
			else if (v === "as") { this.i++; if (!this.type()) this.fail("Incomplete cast type."); }
			else if (v === "++" || v === "--") { this.i++; node = {k:"update",op:v,value:node,line:token.line}; }
			else if (own(precedence,v) && precedence[v] >= min) {
				this.i++; if (v === "?") { var yes = this.expr(2); this.take(":"); node = {k:"ternary",cond:node,yes:yes,no:this.expr(2),line:token.line}; }
				else node = {k:"binary",op:v,left:node,right:this.expr(precedence[v] + (precedence[v] === 1 ? 0 : 1)),line:token.line};
			} else break;
		}
		this.depth--; return node;
	};
	Parser.prototype.args = function() {
		var args = []; if (!this.take("(")) return args;
		while (!this.peek(")") && !this.peek("<eof>")) { var before = this.i; args.push(this.expr(2)); if (!this.take(",") || this.i === before) break; }
		this.take(")"); return args;
	};
	function exprName(n) {
		if (!n) return ""; if (n.k === "id") return n.name;
		if (n.k === "member") return exprName(n.object) + "." + (n.key.value == null ? "?" : n.key.value);
		return n.k === "call" ? exprName(n.callee) + "(...)" : n.k === "literal" ? String(n.value) : "expression";
	}
	function parse(source, markers, macroContext) { var p = new Parser(lex(source,macroContext),markers), body = []; while (!p.peek("<eof>")) { var i = p.i; body.push(p.statement()); if (p.i <= i) p.i++; } Object.defineProperty(body,"parseMeta",{value:{statements:p.statements,blocks:p.blocks}});Object.defineProperty(body,"macroContext",{value:p.macroContext});return body; }
	function parseAnnotated(annotation,macroContext){
		var body;
		try{body=parse(annotation.code || "",null,macroContext);}catch(error){error.line=(error.line || 1)+annotation.codeLine-1;throw error;}
		JSON.stringify(body,function(key,value){if(value && typeof value==="object"){if(value.line)value.line+=annotation.codeLine-1;if(value.k==="fn")value.preview=true;}return value;});
		return body;
	}
	function compactExpression(tag, code, macroContext) {
		for(var index=0;index<code.length;index++){
			var pair=code.substr(index,2), c=code[index], verbatim=c==="@" && /["']/.test(code[index+1] || "");
			if(pair==="//")break;
			if(pair==="/*"){var close=code.indexOf("*/",index+2);if(close<0)throw Error("Unterminated comment in expression.");index=close+1;continue;}
			if(c==='"' || c==="'" || verbatim){
				var quote=verbatim?code[++index]:c, closed=false;
				while(++index<code.length){
					if(!verbatim && code[index]==="\\"){index++;continue;}
					if(code[index]===quote){if(verbatim && code[index+1]===quote){index++;continue;}closed=true;break;}
				}
				if(!closed)throw Error("Unterminated string in expression.");
			}
		}
		var tokens=lex(code,macroContext), stack=[], pairs={"(":")","[":"]","{":"}"};
		tokens.forEach(function(token){
			if(token.k!=="punct")return;
			if(own(pairs,token.v))stack.push(pairs[token.v]);
			else if(/^[)\]}]$/.test(token.v) && token.v!==stack.pop())throw Error("Unbalanced expression.");
		});
		if(stack.length || tokens.length<2)throw Error("Expected one complete expression.");
		var p=new Parser(tokens), expression;
		try{expression=p.expr();p.take(";");}catch(error){throw Error("Expected one complete expression.");}
		if(!p.peek("<eof>"))throw Error("Expected one expression, not multiple statements.");
		JSON.stringify(expression,function(key,value){if(value && typeof value==="object"){if(value.line)value.line+=tag.codeLine-1;if(value.k==="fn")value.preview=true;}return value;});
		return expression;
	}
	function compactValueSlot(statement, allowCondition) {
		if(statement.k==="vars" && statement.vars.length===1)return {object:statement.vars[0],key:"value"};
		if(statement.k==="return")return {object:statement,key:"value"};
		if(statement.k==="expr" && statement.value && statement.value.k==="binary" && statement.value.op==="=")return {object:statement.value,key:"right"};
		if(allowCondition && statement.k==="if")return {object:statement,key:"cond"};
		return null;
	}
	function applyCompactTags(body, tags, diagnostics) {
		var meta=body.parseMeta;
		if(!meta || !tags.length)return;
		function note(tag,message){if(diagnostics.length<100)diagnostics.push({line:tag.line,severity:"warning",message:"@preview " + tag.kind + ": " + message});}
		tags.forEach(function(tag){
			var block=meta.blocks[0];
			meta.blocks.forEach(function(item){if(item.start<tag.offset && item.end>tag.endOffset && item.start>=block.start)block=item;});
			var candidates=meta.statements.filter(function(n){return n._blockId===block.id && (tag.trailing?n._end<=tag.offset && n._endLine===tag.line:n._start>=tag.endOffset);});
			candidates.sort(tag.trailing?function(a,b){return b._end-a._end || a._start-b._start;}:function(a,b){return a._start-b._start || b._end-a._end;});
			var target=candidates[0];
			if(!target || !tag.trailing && meta.statements.some(function(n){return n._blockId===block.id && n._start<tag.offset && n._end>tag.endOffset;})){
				note(tag,"Place the tag before a complete statement or after its end on the same line.");return;
			}
			try {
				var slot=compactValueSlot(target,true), expression, operation, value;
				if(tag.kind==="value"){
					if(!slot)throw Error("Expected one variable declaration, assignment, return or if statement.");
					expression=compactExpression(tag,tag.code,body.macroContext);
					slot.object[slot.key]={k:"preview_value",value:expression,line:tag.line};
				} else if(tag.kind==="arg"){
					var match=/^(\d+)\s*=\s*([\s\S]+)$/.exec(tag.code);
					if(!match)throw Error("Use arg <zero-based index> = <expression>.");
					var call=slot?slot.object[slot.key]:target.k==="expr"?target.value:null, index=Number(match[1]);
					if(!call || call.k!=="call" && call.k!=="new")throw Error("The attached statement must contain an outer function or constructor call.");
					if(index>=call.args.length)throw Error("Argument index is outside the original call's arguments.");
					expression=compactExpression(tag,match[2],body.macroContext);
					call.args[index]={k:"preview_value",value:expression,line:tag.line};
				} else if(tag.kind==="skip"){
					var line=target.line,start=target._start,end=target._end,endLine=target._endLine,blockId=target._blockId;
					Object.keys(target).forEach(function(key){delete target[key];});
					Object.assign(target,{k:"empty",line:line,_start:start,_end:end,_endLine:endLine,_blockId:blockId});
				} else if(tag.kind==="hide"){
					if(target.k==="vars" && target.vars.length===1)value={k:"id",name:target.vars[0].name,line:tag.line};
					else if(target.k==="expr" && target.value.k==="binary" && target.value.op==="=" && target.value.left.k==="id")value=target.value.left;
					else throw Error("Expected a single variable declaration or an assignment to a variable containing an element.");
					operation={kind:"hide",value:value,line:tag.line};
					(target._previewAfter || (target._previewAfter=[])).push(operation);
				} else if(tag.kind==="init" || tag.kind==="set"){
					if(target.k==="fn" || target.k==="directive" || target.k==="enum")throw Error("Put this tag inside a function next to an executable statement.");
					if(tag.trailing && /^(return|break|continue|exit)$/.test(target.k))throw Error("Put this tag before the control-flow statement.");
					expression=compactExpression(tag,tag.code,body.macroContext);
					if(tag.kind==="init" && expression.k!=="call")throw Error("Expected a function call.");
					if(tag.kind==="set" && (expression.k!=="binary" || expression.op!=="=" || !/^(id|member)$/.test(expression.left.k)))throw Error("Expected target = expression.");
					operation={kind:tag.kind,value:expression,line:tag.line};
					var property=tag.trailing?"_previewAfter":"_previewBefore";
					(target[property] || (target[property]=[])).push(operation);
				}
			} catch(error){note(tag,error.message || "Invalid hint; the original statement is retained.");}
		});
	}
	// Only GooWee primitives belong here. Project controls are identified by their
	// constructor ancestry, never by an application-specific class/name list.
	var visualTypes = /^(?:Canvas(?:Surface|Scroll|DragScroll)?|Container(?:Canvas)?|Control|Float|Panel|StackPanel|WrapPanel|Label|Image|Button|Scroll|DragScroll)$/;
	function containsVisual(fn) {
		if (fn.constructor === true && visualTypes.test(shortName(fn.name))) return true;
		var found = false;
		JSON.stringify(fn.body,function(key,value) { if(value && value.k === "new" && visualTypes.test(shortName(value.name))) found = true; return value; });
		return found;
	}
	function State(options) {
		this.options = options; this.nodes = []; this.diagnostics = []; this.diagKeys = dict(); this.functions = dict(); this.global = dict(); this.steps = 0; this.calls = 0; this.depth = 0; this.truncated = false;
		this.width = Math.max(1, Math.min(16384, Number(options.width) || 1920)); this.height = Math.max(1, Math.min(16384, Number(options.height) || 1080));
		this.scale = Number.isFinite(Number(options.scale)) && Number(options.scale)>0 ? Math.max(0.01,Math.min(100,Number(options.scale))) : 1;
		this.resolvingMacros = dict();
		this.sourceMacros = dict();this.nativeAliases=dict();
		this.loadedSources = dict(); this.missingFunctions = dict(); this.sourceCount = 0;
		this.sourceBodies=dict();this.initializedSources=new Set();
		this.currentPath = options.sourcePath || ""; this.dataUpdates = 0; this.nextNodeId=1;
		this.overrides = dict(); this.entryArgs = []; this.previewDepth = 0; this.lazyGlobals = dict(); this.resolvingGlobals = dict();
		this.setups=[];this.setupsReady=false;
		this.previewHints=0;
		this.captureInfo=new WeakMap();
		this.functionStatics=new WeakMap();
		var constants = {true:true,false:false,undefined:null,noone:null,infinity:Infinity,pi:Math.PI,GUI_SCALE_FACTOR:this.scale,
			c_white:16777215,c_black:0,c_red:255,c_green:32768,c_blue:16711680,c_yellow:65535,c_lime:65280,c_aqua:16776960,c_fuchsia:16711935,c_gray:8421504,c_grey:8421504,c_dkgray:4210752,c_ltgray:12632256,c_silver:12632256,c_orange:4235519,c_maroon:128,c_navy:8388608,c_olive:32896,c_purple:8388736,c_teal:8421376};
		Object.keys(constants).forEach(function(k) { this.global[k] = constants[k]; },this);
		Object.keys(options.constants || {}).forEach(function(k) { if (safeKey(k)) this.global[k] = options.constants[k]; },this);
		if (!own(this.global,"global")) this.global.global=tagged(dict(),"globals");
	}
	State.prototype.warn = function(line, message) { var key = this.currentPath + line + message; if (this.diagKeys[key] || this.diagnostics.length >= 100) return; this.diagKeys[key] = true; this.diagnostics.push({line:line || 1,sourcePath:this.currentPath,message:message,severity:"warning"}); };
	State.prototype.loadSource = function(source, path) {
		var self = this, body, previous = this.currentPath;
		var annotations=Annotations ? Annotations.extract(source) : {source:source,markers:{},setups:[],diagnostics:[]};
		this.previewHints+=annotations.setups.length+Object.keys(annotations.markers).length+(annotations.tags || []).length;
		var macroContext={macros:Object.assign(dict(),this.options.macros,this.sourceMacros),macroFunctions:this.options.macroFunctions};
		try { body = parse(annotations.source,annotations.markers,macroContext);applyCompactTags(body,annotations.tags || [],annotations.diagnostics); } catch (error) { error.sourcePath = path || ""; throw error; }
		this.currentPath = path || "";
		annotations.diagnostics.forEach(function(note){self.warn(note.line,note.message);});
		annotations.setups.forEach(function(annotation){
			var setupBody=parseAnnotated(annotation,body.macroContext);
			JSON.stringify(setupBody,function(key,value){if(value && value.k==="fn")value.sourcePath=path || "";return value;});
			setupBody.forEach(function(n){if(n.k==="fn" && n.name)self.functions[n.name]=n;});
			self.setups.push({body:setupBody,path:path || "",line:annotation.line});
		});
		JSON.stringify(body, function(key,value) { if(value && value.k === "fn") value.sourcePath=path || ""; return value; });
		body.forEach(function(n) { if(n.k === "fn" && n.name) self.functions[n.name]=n; });
		body.forEach(function(n) { if(n.k === "vars")n.vars.forEach(function(v){if(safeKey(v.name))self.lazyGlobals[v.name]={expression:v.value,path:path || ""};}); });
		var declaredMacros=dict();body.forEach(function(n) {
			if(n.k === "directive") {
				var macro=/^#macro\s+(\w+)\s+(.+)$/.exec(n.value.trim());
				if(macro){var target=macro[2].trim();if(isNativeAliasTarget(target) && !own(declaredMacros,target) && macro[1]!==target)self.nativeAliases[macro[1]]=target;self.sourceMacros[macro[1]]=macro[2];declaredMacros[macro[1]]=true;}
			}
		});
		// GameMaker enums are compile-time globals, even when their declaration is
		// inside a constructor (for example GUI_SCROLL_PARAMS in gw_Scroll).
		JSON.stringify(body,function(key,value) { if(value && value.k === "enum") self.execute(value,self.global); return value; });
		this.sourceBodies[sourceKey(path)]={body:body,path:path || ""};
		this.currentPath=previous;if(this.setupsReady)this.runSetups();return body;
	};
	State.prototype.runSetups=function(){
		if(this.runningSetups)return;this.runningSetups=true;
		try{while(this.setups.length){var setup=this.setups.shift(),previous=this.currentPath;this.currentPath=setup.path;this.previewDepth++;
			try{this.execute({k:"block",body:setup.body},this.global);}finally{this.previewDepth--;this.currentPath=previous;}
		}}finally{this.runningSetups=false;}
	};
	State.prototype.initializeScript=function(name,line){
		if(typeof name!=="string" || !/^[A-Za-z_]\w*$/.test(name) || typeof this.options.sourceFor!=="function"){this.warn(line,"preview_init_script expects an indexed script symbol.");return false;}
		var source=this.options.sourceFor(name);
		if(!source || typeof source.source!=="string" || source.source.length>1500000){this.warn(line,"Preview initialization source " + name + " is unavailable or exceeds its size limit.");return false;}
		var key=sourceKey(source.path || source.name || name);
		if(!this.loadedSources[key]){
			if(this.sourceCount>=128){this.warn(line,"Preview source limit reached before initializing " + name + ".");return false;}
			this.loadedSources[key]=true;this.sourceCount++;this.loadSource(source.source,source.path || key);
		}
		var record=this.sourceBodies[key];if(!record){this.warn(line,"Could not initialize source " + name + ".");return false;}
		if(this.initializedSources.has(record.body))return true;this.initializedSources.add(record.body);
		var previous=this.currentPath;this.currentPath=record.path;
		try{for(var i=0;i<record.body.length;i++){var statement=record.body[i];if(statement.k!=="fn" && statement.k!=="enum" && statement.k!=="directive")this.execute(statement,this.global);}}
		finally{this.currentPath=previous;}return true;
	};
	State.prototype.includePreview=function(path,line){
		if(typeof path!=="string" || typeof this.options.previewSourceFor!=="function"){this.warn(line,"preview_include expects a project-relative GML file and a preview source reader.");return false;}
		var source;
		try { source=this.options.previewSourceFor(path); } catch(error){this.warn(line,"Could not include preview file " + path + ": " + (error.message || error));return false;}
		if(!source || typeof source.source!=="string" || source.source.length>256*1024){this.warn(line,"Preview include " + path + " is unavailable or exceeds its size limit.");return false;}
		var key=sourceKey(source.path || path);
		if(this.loadedSources[key])return true;
		if(this.sourceCount>=128){this.warn(line,"Preview source limit reached before including " + path + ".");return false;}
		this.loadedSources[key]=true;this.sourceCount++;
		this.loadSource(source.source,source.path || path);
		// Includes inside a running setup must finish before its next statement.
		// Other on-demand source setups keep their normal queue order.
		if(this.runningSetups){
			var selected=[],remaining=[];
			this.setups.forEach(function(setup){(sourceKey(setup.path)===key?selected:remaining).push(setup);});
			this.setups=remaining;
			for(var i=0;i<selected.length;i++){
				var previous=this.currentPath;this.currentPath=selected[i].path;this.previewDepth++;
				try{this.execute({k:"block",body:selected[i].body},this.global);}finally{this.previewDepth--;this.currentPath=previous;}
			}
		}
		return true;
	};
	State.prototype.resolveFunction = function(name) {
		if (this.functions[name] || this.functions["gw_"+name]) return this.functions[name] || this.functions["gw_"+name];
		if (this.missingFunctions[name] || typeof this.options.sourceFor !== "function") return null;
		if(this.sourceCount>=128){this.warn(1,"Preview source limit (128 scripts) reached; further dependencies are unavailable.");return null;}
		this.missingFunctions[name]=true;
		var source = this.options.sourceFor(name);
		if (!source || typeof source.source !== "string" || source.source.length > 1500000) return null;
		var key=sourceKey(source.path || source.name || name);
		if (!this.loadedSources[key]) { this.loadedSources[key]=true;this.sourceCount++;this.loadSource(source.source,source.path || key); }
		return this.functions[name] || this.functions["gw_"+name] || null;
	};
	State.prototype.previewInstance = function(constructor, fields, line) {
		var name=typeof constructor==="string"?constructor:isUnknown(constructor)?constructor.name:isKind(constructor,"closure")?constructor.fn.name:"";
		var definition=name && this.resolveFunction(name),props=isStruct(fields)?fields.props:fields;
		if(!definition || !definition.constructor || props!=null && (typeof props!=="object" || Array.isArray(props) || isUnknown(props))){
			this.warn(line,"preview_instance expects an indexed constructor and optional sample fields; constructor initialization is not run.");return unknown("preview_instance");
		}
		var instance=structValue(name),state=this,seen=new Set();
		function bind(fn){
			if(!fn || seen.has(fn) || seen.size>=32){state.warn(line,"Preview instance ancestry is unavailable or cyclic.");return;}
			seen.add(fn);
			if(fn.base && fn.base.k==="call")bind(state.resolveFunction(exprName(fn.base.callee)));
			if(!fn.body || fn.body.k!=="block")return;
			fn.body.body.forEach(function(statement){
				if(statement.k!=="vars" || !statement.static)return;
				statement.vars.forEach(function(variable){
					if(safeKey(variable.name) && variable.value && variable.value.k==="fn")instance.props[variable.name]=closureValue(variable.value,dict(),instance);
				});
			});
		}
		bind(definition);
		Object.keys(props || {}).forEach(function(key){if(safeKey(key))instance.props[key]=props[key];});
		return instance;
	};
	State.prototype.check = function() { if (++this.steps > 350000 || this.nodes.length >= 4000) { this.truncated = true; throw new Error("Preview complexity limit reached"); } };
	State.prototype.spriteAsset = function(value) {
		if(isKind(value,"sprite") && value.virtual)return value;
		return (this.options.assets || {})[isUnknown(value)?value.name:isKind(value,"sprite")?value.name:value] || null;
	};
	function identityMatrix(){return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}
	State.prototype.captureGraphInfo = function(sprite) {
		var cache=this.captureInfo,active=new Set(),examined=0;
		function visit(image,level){
			if(!image || typeof image!=="object" || level>16 || ++examined>4096 || active.has(image))return null;
			if(cache.has(image)){var known=cache.get(image);return known.depth+level<=16?known:null;}
			var info={cost:1,depth:0};
			if(image.layers!=null){
				if(!Array.isArray(image.layers) || image.layers.length>256)return null;
				active.add(image);
				for(var i=0;i<image.layers.length;i++){
					var layer=image.layers[i];if(!layer || typeof layer!=="object"){active.delete(image);return null;}
					var child=layer.fill?{cost:0,depth:-1}:visit(layer.sprite,level+1);
					if(!child){active.delete(image);return null;}
					info.cost+=1+child.cost;info.depth=Math.max(info.depth,child.depth+1);
					if(info.cost>4096 || info.depth>16){active.delete(image);return null;}
				}
				active.delete(image);
			}
			cache.set(image,info);return info;
		}
		return visit(sprite,0);
	};
	State.prototype.surfaceSnapshot = function(surface,line) {
		var image=spriteValue("<preview surface>",[]);image.virtual=true;image.width=surface.width;image.height=surface.height;image.originX=0;image.originY=0;image.layers=surface.layers.slice();
		if(!this.captureGraphInfo(image)){this.warn(line,"Captured graphics exceed 4096 nested draw nodes or 16 composition levels; draw omitted.");return null;}
		return image;
	};
	State.prototype.graphicsCall = function(name,args,line) {
		var state=this,validSurface=function(s){return isKind(s,"surface") && !s.freed;};
		this.surfaceStack=this.surfaceStack || [];this.matrices=this.matrices || dict();
		var surface=args[0],target=this.surfaceStack[this.surfaceStack.length-1];
		if(name==="surface_create"){
			var w=Math.ceil(args[0]),h=Math.ceil(args[1]);
			if(!Number.isFinite(w) || !Number.isFinite(h) || w<1 || h<1 || w>2048 || h>2048 || (this.surfacePixels || 0)+w*h>8*1024*1024){this.warn(line,"Virtual surfaces are limited to 2048 per axis and 8M active pixels.");return null;}
			this.surfacePixels=(this.surfacePixels || 0)+w*h;return tagged({width:w,height:h,layers:[],freed:false},"surface");
		}
		if(name==="surface_exists")return validSurface(surface);
		if(name==="surface_get_target")return target || null;
		if(name==="surface_reset_target"){this.surfaceStack.pop();return null;}
		if(/^surface_/.test(name)){
			if(!validSurface(surface)){this.warn(line,name+" requires a live preview surface.");return null;}
			if(name==="surface_get_width")return surface.width;if(name==="surface_get_height")return surface.height;
			if(name==="surface_get_texture")return surface;
			if(name==="surface_set_target"){if(this.surfaceStack.length>=32)this.warn(line,"Virtual surface target stack limit reached.");else this.surfaceStack.push(surface);return null;}
			if(name==="surface_free"){this.surfacePixels-=surface.width*surface.height;surface.freed=true;surface.layers=[];return null;}
			if(name==="surface_resize"){
				var nw=Math.ceil(args[1]),nh=Math.ceil(args[2]),pixels=this.surfacePixels-surface.width*surface.height+nw*nh;
				if(![nw,nh].every(Number.isFinite) || nw<1 || nh<1 || nw>2048 || nh>2048 || pixels>8*1024*1024){this.warn(line,"Virtual surface resize exceeds preview bounds.");return null;}
				this.surfacePixels=pixels;surface.width=nw;surface.height=nh;surface.layers=[];return null;
			}
		}
		if(/^texture_get_texel_/.test(name))return validSurface(surface)?1/surface[name==="texture_get_texel_width"?"width":"height"]:null;
		if(name==="matrix_build_identity")return identityMatrix();
		if(name==="matrix_get")return (this.matrices[isUnknown(args[0])?args[0].name:args[0]] || identityMatrix()).slice();
		if(name==="matrix_set"){
			if(Array.isArray(args[1]) && args[1].length===16 && args[1].every(Number.isFinite))this.matrices[isUnknown(args[0])?args[0].name:args[0]]=args[1].slice();else this.warn(line,"Preview matrix requires 16 finite values.");return null;
		}
		if(name==="matrix_build"){
			if(!args.slice(0,9).every(Number.isFinite)){this.warn(line,"Preview matrix requires numeric values.");return identityMatrix();}
			if(args[3] || args[4])this.warn(line,"3D matrix rotation is not supported by the 2D preview.");
			var m=identityMatrix(),angle=args[5]*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);m[0]=c*args[6];m[1]=-s*args[6];m[4]=s*args[7];m[5]=c*args[7];m[10]=args[8];m[12]=args[0];m[13]=args[1];m[14]=args[2];return m;
		}
		if(name==="sprite_create_from_surface"){
			if(!validSurface(surface)){this.warn(line,"Sprite capture requires a live preview surface.");return null;}
			var values=args.slice(1,5);if(!values.every(Number.isFinite) || args[3]<=0 || args[4]<=0 || args[3]>2048 || args[4]>2048){this.warn(line,"Sprite capture rectangle exceeds preview bounds.");return null;}
			if(args[5])this.warn(line,"Sprite capture remove-background is not simulated; source alpha is preserved.");
			var captured=this.surfaceSnapshot(surface,line);if(!captured)return null;
			var image=spriteValue("<preview capture>",[]);image.virtual=true;image.width=args[3];image.height=args[4];image.originX=Number.isFinite(args[7])?args[7]:0;image.originY=Number.isFinite(args[8])?args[8]:0;
			image.layers=[{sprite:captured,x:0,y:0,width:args[3],height:args[4],crop:{x:args[1],y:args[2],width:args[3],height:args[4]}}];
			if(!this.captureGraphInfo(image)){this.warn(line,"Sprite capture exceeds 4096 nested draw nodes or 16 composition levels.");return null;}return image;
		}
		if(name==="draw_clear_alpha" || name==="draw_clear"){
			if(!validSurface(target)){this.warn(line,"Drawing outside a virtual surface is omitted from preview.");return null;}
			target.layers=[];if(name==="draw_clear" || args[1]>0)target.layers.push({fill:color(args[0],"#000000"),alpha:name==="draw_clear"?1:args[1],x:0,y:0,width:target.width,height:target.height});return null;
		}
		if(/^draw_(?:sprite|surface)/.test(name)){
			if(!validSurface(target)){this.warn(line,"Drawing outside a virtual surface is omitted from preview.");return null;}
			if(target.layers.length>=256){this.warn(line,"Virtual surface capped at 256 draw calls.");return null;}
			var isSurface=/^draw_surface/.test(name),isPart=/part/.test(name),isExt=/_ext$/.test(name),asset=isSurface?validSurface(surface)?surface:null:this.spriteAsset(args[0]);
			if(!asset || isSurface && surface===target){this.warn(line,"Draw capture needs an available sprite or a separate source surface.");return null;}
			var image=isSurface?this.surfaceSnapshot(surface,line):spriteValue(args[0],[]),offset=isSurface?1:2;if(!image)return null;
			if(!isSurface){image=tagged(Object.assign({},image),"sprite");image.index=Number(args[1]) || 0;}
			var crop=isPart?{x:args[offset],y:args[offset+1],width:args[offset+2],height:args[offset+3]}:null;if(isPart)offset+=4;
			var x=args[offset],y=args[offset+1],sx=isExt?args[offset+2]:1,sy=isExt?args[offset+3]:1,rotation=isExt && !isPart?args[offset+4]:0,colorIndex=offset+(isPart?4:5);
			var tint=isExt?args[colorIndex]:"#ffffff",alpha=isExt?args[colorIndex+1]:1;
			if(![x,y,sx,sy,rotation,alpha].every(Number.isFinite) || crop && !Object.keys(crop).every(function(k){return Number.isFinite(crop[k]);})){this.warn(line,"Draw capture requires finite positions, dimensions and opacity.");return null;}
			image.color=color(tint,"#ffffff");image.alpha=Math.max(0,Math.min(1,alpha));
			var matrix=this.matrices.matrix_world || this.matrices[0] || identityMatrix();
			target.layers.push({sprite:image,x:x,y:y,width:crop?crop.width:asset.width,height:crop?crop.height:asset.height,originX:isPart?0:asset.originX || 0,originY:isPart?0:asset.originY || 0,scaleX:sx,scaleY:sy,angle:rotation,crop:crop,matrix:[matrix[0],matrix[1],matrix[4],matrix[5],matrix[12],matrix[13]]});
			if(!this.surfaceSnapshot(target,line))target.layers.pop();return null;
		}
		this.warn(line,"Unsupported captured graphics call " + name + ".");return null;
	};
	State.prototype.visualBase = function(name, seen) {
		var type=shortName(name);if(visualTypes.test(type))return type;
		seen=seen || dict();if(seen[name])return null;seen[name]=true;
		var fn=this.resolveFunction(name);
		return fn && fn.constructor && fn.base && fn.base.k === "call" ? this.visualBase(exprName(fn.base.callee),seen) : null;
	};
	State.prototype.containsVisual = function(fn, seen) {
		if(containsVisual(fn))return true;
		seen=seen || new Set();if(seen.has(fn))return false;seen.add(fn);
		if(fn.constructor && this.visualBase(fn.name))return true;
		var self=this, found=false;
		JSON.stringify(fn.body,function(key,value){
			if(found || !value || typeof value!=="object")return value;
			if(value.k==="new" && self.visualBase(value.name))found=true;
			if(value.k==="call" && value.callee && value.callee.k==="id"){
				var called=self.resolveFunction(value.callee.name);if(called && self.containsVisual(called,seen))found=true;
			}
			return value;
		});return found;
	};
	State.prototype.get = function(env, name) {
		if(this.previewDepth && /^preview_/.test(name))return tagged({builtin:name},"builtin");
		if (own(env,name)) return env[name];
		if (env.self && own(env.self.props,name)) { var field=env.self.props[name];return isKind(field,"closure") ? closureValue(field.fn,field.env,env.self) : field; }
		if (env.self && name === "style") return env.self._style;
		if (isNode(env.self) && /^(layout|size_actual|padding_actual|margin_actual|children|parent|child_count|_measure_margin)$/.test(name)) return this.member(env.self,name,name,0);
		if (env.self && /^(size|size_min|size_max|margin|padding|alignment|aspectratio|orientation|text|sprite|alpha|progress|draw_disable|draw_enable|draw_set_enable|is_draw_disabled|set_codename)$/.test(name)) return methodValue(env.self,name);
		if(/^(?:gw_)?(?:ABS|ABSV|REL|AUTO|AUTOV)$/.test(name) || visualTypes.test(shortName(name)) || /^(?:gw_)?SpriteImage$/.test(name))return tagged({builtin:name},"builtin");
		if (own(this.global,name)) return this.global[name]; if (own(this.functions,name)) return closureValue(this.functions[name],this.global);
		if(own(this.lazyGlobals,name) && !this.resolvingGlobals[name]){
			this.resolvingGlobals[name]=true;var declaration=this.lazyGlobals[name],previous=this.currentPath;this.currentPath=declaration.path;
			try{return this.global[name]=this.eval(declaration.expression,this.global);}finally{delete this.resolvingGlobals[name];this.currentPath=previous;}
		}
		var macros=own(this.sourceMacros,name)?this.sourceMacros:this.options.macros || {};
		if(own(this.nativeAliases,name))return tagged({builtin:this.nativeAliases[name]},"builtin");
		if (own(macros,name) && !this.resolvingMacros[name]) {
			this.resolvingMacros[name] = true;
			try { var expr = macros[name]; if (typeof expr === "string") return this.eval(new Parser(lex(expr)).expr(),this.global); } finally { delete this.resolvingMacros[name]; }
		}
		var reference=/^[A-Za-z_]\w*$/.test(name)?this.resolveFunction(name):null;
		if(reference)return closureValue(reference,this.global);
		// Resolving a symbol may load its enum declaration rather than a function.
		if(own(this.global,name))return this.global[name];
		if((this.options.assets || {})[name])return name;
		return unknown(name);
	};
	State.prototype.assign = function(n, value, env) {
		if (!n) return value;
		if (n.k === "id" && safeKey(n.name)) { if (env.self && !own(env,n.name)) env.self.props[n.name] = value; else env[n.name] = value; if (isNode(value) && value.name === value.type) value.name = n.name; }
		else if (n.k === "member") {
			var obj = this.eval(n.object,env), key = this.eval(n.key,env);
			if (!isUnknown(obj) && obj && safeKey(key) && (typeof obj === "object")) {
				if(isKind(obj,"dsMap")){if(obj.values.size>=2048 && !obj.values.has(key))this.warn(n.line,"Preview map capped at 2048 entries.");else obj.values.set(key,value);return value;}
				if (isKind(obj,"sprite") && key==="sprite") {
					if(isKind(value,"sprite") && value.virtual){
						["name","virtual","width","height","originX","originY","layers"].forEach(function(field){obj[field]=value[field];});
					}else{
						obj.name=typeof value==="string"?value:isUnknown(value)?value.name:"";
						["virtual","width","height","originX","originY","layers"].forEach(function(field){delete obj[field];});
					}
					this.captureInfo=new WeakMap();return value;
				}
				if (isKind(obj,"textStyle")) {
					if (key === "font") { obj.fontResource = fontName(value); return value; }
					if (key === "sdf_size_pt") { obj.fontSizeUnit = typeof value === "number" && value > 0 ? "sdf" : "native"; if (obj.fontSizeUnit === "sdf") obj.fontSize = value; return value; }
					key = ({alpha:"fontAlpha",sdf_line_height:"sdfLineHeight",sdf_spread_size:"sdfSpread",sdf_line_y_correction:"sdfLineYCorrection",sdf_effect:"sdfEffect",is_native_sdf:"nativeSdf"})[key] || key;
				}
				if (isNode(obj) && obj.layoutType==="Image" && key==="_sprite_image") { obj.sprite=spriteValue(value,[]);return value; }
				(isNode(obj) || isStruct(obj) ? obj.props : obj)[key] = value;
				if (isNode(obj) && /^(on_draw|on_resize|on_place)$/.test(key)) { obj.approximate=true; this.warn(n.line,"Custom " + key + " callback omitted from static preview."); }
			}
		}
		return value;
	};
	State.prototype.member = function(obj, key, name, line) {
		if (!safeKey(key)) return unknown(name);
		if(isKind(obj,"dsMap"))return obj.values.has(key)?obj.values.get(key):null;
		if(/^(?:gw_)?GooWee\.view$/.test(name))return null;
		if (isUnknown(obj) && /^[A-Za-z_]\w*$/.test(obj.name)) {
			this.resolveFunction(obj.name);
			if (own(this.global,obj.name)) obj=this.global[obj.name];
		}
		if (isKind(obj,"sprite") && key === "clone") return tagged({spriteReceiver:obj},"spriteClone");
		if (isKind(obj,"sprite") && key === "sprite") return obj.virtual?obj:obj.name;
		if (isKind(obj,"textStyle")) {
			if (key === "clone") return tagged({textStyleReceiver:obj},"textStyleClone");
			if (key === "font") return obj.fontResource || null;
			if (key === "sdf_size_pt") return obj.fontSizeUnit === "sdf" ? obj.fontSize : 0;
			key = ({alpha:"fontAlpha",sdf_line_height:"sdfLineHeight",sdf_spread_size:"sdfSpread",sdf_line_y_correction:"sdfLineYCorrection",sdf_effect:"sdfEffect",is_native_sdf:"nativeSdf"})[key] || key;
		}
		if (isNode(obj) || isStruct(obj) || isKind(obj,"binding")) {
			if (isNode(obj) && obj.layoutType==="Image" && key==="_sprite_image") return obj.sprite;
			if (key === "style") return obj._style;
			if (key === "layout") return {x:obj.x || 0,y:obj.y || 0,width:obj.width || 0,height:obj.height || 0};
			if (key === "size_actual") return {width:obj.width || 0,height:obj.height || 0};
			if (isNode(obj) && (key === "padding_actual" || key === "margin_actual")) {
				var edges=(key === "padding_actual" ? obj.paddingActual : obj.marginActual) || [0,0,0,0];
				return {left:edges[0],top:edges[1],right:edges[2],bottom:edges[3]};
			}
			if (isNode(obj) && key === "children") return obj.children;
			if (isNode(obj) && (key === "child_count" || key === "_measure_margin")) return methodValue(obj,key);
			if (key === "parent") return this.nodes.find(function(n) { return n.id === obj.parentId; });
			if (obj.props && own(obj.props,key)) { var field=obj.props[key];return isKind(field,"closure") ? closureValue(field.fn,field.env,obj) : field; }
			if(isKind(obj,"binding") && key==="update" || isNode(obj) && /^(?:size|size_min|size_max|margin|padding|alignment|aspectratio|orientation|justify|set_render_scale|disable_affect_by_gui_scale|separate_render|push_all_canvases_to_array|text|sprite|is_draw_disabled|draw_disable|draw_enable|draw_set_enable|set_codename|progress|alpha|set_parent|relocate|clear|add_surface_render_callback|get_base_layout|enable|disable)$/.test(key))return methodValue(obj,key);
			return isStruct(obj)?null:unknown(name);
		}
		if (obj && !isUnknown(obj) && own(obj,key)) return obj[key];
		if(obj && typeof obj==="object" && !obj[valueBrand])return null;
		var en = /(?:gw_)?(?:Align|Orientation)\.(left|top|center|right|bottom|horizontal|vertical)$/.exec(name);
		if (en) return ({left:0,top:0,center:1,right:2,bottom:2,horizontal:0,vertical:1})[en[1]];
		return unknown(name);
	};
	State.prototype.eval = function(n, env) {
		if (!n) return null; this.check(); var self = this, a, b, name;
		switch(n.k) {
			case "literal": return n.value;
			case "preview_value": this.previewDepth++;try{return this.eval(n.value,env);}finally{this.previewDepth--;}
			case "id": return this.get(env,n.name);
			case "fn": return closureValue(n,env);
			case "member": return this.member(this.eval(n.object,env),this.eval(n.key,env),exprName(n),n.line);
			case "array": return n.items.map(function(x) { return self.eval(x,env); });
			case "object": var object = dict(); n.items.forEach(function(x) { if (safeKey(x.key)) object[x.key] = self.eval(x.value,env); }); return object;
			case "new": return this.construct(n.name,n.args.map(function(x) { return self.eval(x,env); }),n.line,env);
			case "call":
				if (/^scope\d+$/.test(exprName(n.callee))) { var scope=dict();n.args.forEach(function(arg){var key=arg.k === "id" ? arg.name : exprName(arg);if(safeKey(key))scope[key]=self.eval(arg,env);});return scope; }
				name = exprName(n.callee); b = n.args.map(function(x) { return self.eval(x,env); });
				if(own(this.overrides,name)){var override=this.overrides[name];return this.invoke(override.fn,b,override.env,override.boundSelf || null);}
				a = this.eval(n.callee,env);
				if(isKind(a,"builtin"))return this.call(a.builtin,b,n.line,env);
				if (isKind(a,"spriteClone")) { var clone = {}; Object.keys(a.spriteReceiver).forEach(function(k) { clone[k]=a.spriteReceiver[k]; }); return tagged(clone,"sprite"); }
				if (isKind(a,"textStyleClone")) { var copy = Object.assign({},a.textStyleReceiver); if(b[0]!=null)copy.color=b[0]; return tagged(copy,"textStyle"); }
				if (isKind(a,"method")) return this.method(a.receiver,a.method,b,n.line);
				if (isKind(a,"closure")) return this.invoke(a.fn,b,a.env,a.boundSelf || null);
				return this.call(name,b,n.line,env);
			case "update": a = this.eval(n.value,env); this.assign(n.value,isUnknown(a) ? a : Number(a) + (n.op === "++" ? 1 : -1),env); return a;
			case "unary": a = this.eval(n.value,env); if (isUnknown(a)) return a; if (n.op === "!" || n.op === "not") return !a; if (n.op === "-") return -a; if (n.op === "+") return +a; if (n.op === "~") return ~a; return this.assign(n.value,Number(a) + (n.op === "++" ? 1 : -1),env);
			case "ternary": a = this.eval(n.cond,env); if (isUnknown(a)) { this.warn(n.line,"Dynamic condition: showing the first alternative."); return this.eval(n.yes,env); } return this.eval(a ? n.yes : n.no,env);
			case "binary":
				if (n.op === "=") return this.assign(n.left,this.eval(n.right,env),env);
				a = this.eval(n.left,env);
				if (n.op === "??=") return a == null ? this.assign(n.left,this.eval(n.right,env),env) : a;
				if ((n.op === "&&" || n.op === "and") && !isUnknown(a) && !a) return false;
				if ((n.op === "||" || n.op === "or") && !isUnknown(a) && a) return a;
				b = this.eval(n.right,env);
				if (n.op === "??") return a == null ? b : a;
				if((n.op==="&&" || n.op==="and") && (b===false || b===0))return false;
				if((n.op==="||" || n.op==="or") && (b===true || b===1))return true;
				if (isUnknown(a) || isUnknown(b)) return unknown(exprName(n));
				var op = n.op, assign = /^(?:\+=|-=|\*=|\/=|%=|\|=|&=|\^=)$/.test(op); if (assign) op = op[0];
				var result;
				switch(op) { case "+":result=a+b;break;case "-":result=a-b;break;case "*":result=a*b;break;case "/":result=b===0 ? 0 : a/b;break;case "%":case "mod":result=a%b;break;case "div":result=Math.floor(a/b);break;case "==":result=sameValue(a,b);break;case "!=":result=!sameValue(a,b);break;case "<":result=a<b;break;case ">":result=a>b;break;case "<=":result=a<=b;break;case ">=":result=a>=b;break;case "&&":case "and":result=a&&b;break;case "||":case "or":result=a||b;break;case "&":result=a&b;break;case "|":result=a|b;break;case "^":result=a^b;break;case "<<":result=a<<b;break;case ">>":result=a>>b;break;default:result=unknown("operator"); }
				return assign ? this.assign(n.left,result,env) : result;
		} return unknown("expression");
	};
	State.prototype.runCompactHints = function(hints,env) {
		for(var i=0;i<(hints || []).length;i++){
			var hint=hints[i];this.previewDepth++;
			try{
				var value=this.eval(hint.value,env);
				if(hint.kind==="hide"){
					if(isNode(value))value.hidden=true;
					else this.warn(hint.line,"@preview hide requires a constructed visual element.");
				}
			}finally{this.previewDepth--;}
		}
	};
	State.prototype.execute = function(n, env) {
		if(!n)return null;
		this.runCompactHints(n._previewBefore,env);
		var result=this.executeStatement(n,env);
		if(!result || !result.signal)this.runCompactHints(n._previewAfter,env);
		return result;
	};
	State.prototype.executeStatement = function(n, env) {
		if (!n) return null; this.check(); var result, i, test;
		switch(n.k) {
			case "block": for (i = 0; i < n.body.length; i++) { result = this.execute(n.body[i],env); if (result) return result; } break;
			case "preview": this.previewDepth++;try{return this.execute({k:"block",body:n.body},env);}finally{this.previewDepth--;}
			case "with":
				var target=this.eval(n.target,env);
				if(!target || isUnknown(target) || typeof target!=="object" || Array.isArray(target)){this.warn(n.line,"with requires a known struct in preview; instance iteration was omitted.");break;}
				var scope=dict();Object.keys(env).forEach(function(key){scope[key]=env[key];});scope.other=env.self || null;
				scope.self=isNode(target) || isStruct(target) ? target : structValue("struct",target);return this.execute(n.body,scope);
			case "fn": if (n.name) env[n.name] = closureValue(n,env); break;
			case "enum": var en=dict(),next=0;for(i=0;i<n.members.length;i++){var m=n.members[i];var value=m.value?this.eval(m.value,env):next;if(safeKey(m.name))en[m.name]=value;next=typeof value === "number"?value+1:unknown(m.name);}if(safeKey(n.name))env[n.name]=en;break;
			case "vars": for (i = 0; i < n.vars.length; i++) {
				var v = n.vars[i]; if(env[preboundStaticMethods] && env[preboundStaticMethods].has(v))continue;
				if(n.static && env[functionStaticScope] && safeKey(v.name)){
					var storage=env[functionStaticScope];
					if(!own(storage,v.name))storage[v.name]=this.eval(v.value,env);
					// Accessors preserve writes and recursive reads in the same analysis.
					(function(key,values){Object.defineProperty(env,key,{enumerable:true,configurable:true,get:function(){return values[key];},set:function(value){values[key]=value;}});})(v.name,storage);
					continue;
				}
				var value = this.eval(v.value,env);
				if (safeKey(v.name)) { if (n.static && env.self) env.self.props[v.name] = value; else env[v.name] = value; if (isNode(value) && value.name === value.type) value.name = v.name; }
			} break;
			case "expr": this.eval(n.value,env); break;
			case "return": return {signal:"return",value:this.eval(n.value,env)};
			case "throw":
				var thrown=this.eval(n.value,env);throw tagged({value:thrown,line:n.line,sourcePath:this.currentPath,message:typeof thrown==="string"?thrown:typeof thrown==="number"?String(thrown):thrown && typeof thrown.message==="string"?thrown.message:"Unhandled GML exception"},"gmlException");
			case "try":
				try{result=this.execute(n.body,env);}catch(error){
					if(!isKind(error,"gmlException") || !n.handler)throw error;
					var existed=own(env,n.exceptionName),old=env[n.exceptionName];env[n.exceptionName]=error.value;
					try{result=this.execute(n.handler,env);}finally{if(existed)env[n.exceptionName]=old;else delete env[n.exceptionName];}
				}finally{if(n.finalizer){var finalized=this.execute(n.finalizer,env);if(finalized)result=finalized;}}
				return result;
			case "exit": return {signal:"return",value:null};
			case "break": case "continue": return {signal:n.k};
			case "if": test = this.eval(n.cond,env); if (isUnknown(test)) { this.warn(n.line,"Dynamic condition: showing the first branch."); test = true; } return this.execute(test ? n.yes : n.no,env);
			case "switch":
				var switchValue=this.eval(n.value,env),chosen=-1,fallback=-1;
				if(isUnknown(switchValue)){this.warn(n.line,"Dynamic switch value: cases omitted. Supply preview data to choose a state.");break;}
				for(i=0;i<n.cases.length;i++){
					if(n.cases[i].isDefault){fallback=i;continue;}
					var caseValue=this.eval(n.cases[i].value,env);
					if(!isUnknown(caseValue) && switchValue===caseValue){chosen=i;break;}
				}
				if(chosen<0)chosen=fallback;
				for(i=chosen;i>=0 && i<n.cases.length;i++){
					result=this.execute({k:"block",body:n.cases[i].body},env);
					if(result){if(result.signal!=="break")return result;break;}
				}
				break;
			case "for": case "while": case "repeat":
				if (n.init) this.execute(n.init,env);
				var cap=containsVisual({body:n.body}) ? 64 : 2048;
				var limit = n.k === "repeat" ? this.eval(n.test,env) : cap;
				if (isUnknown(limit)) { limit = 1; this.warn(n.line,"Dynamic repetition: showing one example item."); }
				for (i = 0; i < Math.min(cap,Number(limit)); i++) {
					test = n.k === "repeat" ? true : this.eval(n.test,env); if (isUnknown(test)) { this.warn(n.line,"Dynamic loop: showing one example item."); if (i > 0) break; } else if (!test) break;
					result = this.execute(n.body,env); if (result && result.signal === "return") return result; if (result && result.signal === "break") break;
					if (n.step) this.eval(n.step,env); if (isUnknown(test)) break;
				}
				if (i === cap) {
					var remaining=n.k === "repeat" ? Number(limit)>cap : this.eval(n.test,env);
					if(isUnknown(remaining) || remaining)this.warn(n.line,"Repetition capped at " + cap + " preview items.");
				}
				break;
			case "unsupported": this.warn(n.line,"Unsupported " + n.label + " block omitted from static preview."); break;
		} return null;
	};
	State.prototype.invoke = function(fn, args, closure, receiver) {
		if (++this.calls > 4000 || this.depth >= 25) { this.warn(fn.line,"Recursive helper or call limit: remaining calls omitted."); return unknown(fn.name); }
		var env = dict(), self = this; Object.keys(closure || {}).forEach(function(k) { env[k] = closure[k]; }); if (receiver) env.self = receiver;
		fn.params.forEach(function(p,i) { env[p.name] = i < args.length ? args[i] : p.value ? self.eval(p.value,env) : unknown(p.name); });
		if(!fn.constructor){
			var staticScopes=this.functionStatics.get(fn);
			if(!staticScopes){staticScopes=new WeakMap();this.functionStatics.set(fn,staticScopes);}
			var staticOwner=closure || this.global,statics=staticScopes.get(staticOwner);
			if(!statics){statics=dict();staticScopes.set(staticOwner,statics);}
			env[functionStaticScope]=statics;
		}
		env.argument_count = args.length; env.argument = args; this.depth++;
		var previousPath=this.currentPath;this.currentPath=fn.sourcePath || previousPath;
		if(fn.preview)this.previewDepth++;
		// Constructor static methods are available throughout the instance body,
		// including calls appearing before their declaration. Preserve known method
		// aliases in declaration order before installing an override, so a saved
		// parent method cannot turn into a recursive reference to the override.
		// Ordinary initializers and conditional statements keep their execution order.
		if(fn.constructor && receiver && fn.body && fn.body.k === "block") {
			env[preboundStaticMethods]=new Set();
			fn.body.body.forEach(function(statement) {
				if(statement.k !== "vars" || !statement.static)return;
				statement.vars.forEach(function(variable) {
					if(!safeKey(variable.name) || !variable.value)return;
					if(variable.value.k === "fn")receiver.props[variable.name]=closureValue(variable.value,env);
					else if(variable.value.k === "id" && !own(env,variable.value.name) && own(receiver.props,variable.value.name) && isKind(receiver.props[variable.value.name],"closure")) {
						// Keep each constructor's saved method in its lexical scope as
						// well: further descendants can reuse the same alias name.
						env[variable.name]=receiver.props[variable.name]=receiver.props[variable.value.name];
					} else return;
					env[preboundStaticMethods].add(variable);
				});
			});
		}
		try { var result = this.execute(fn.body,env); return result ? result.value : null; } finally { if(fn.preview)this.previewDepth--;this.depth--;this.currentPath=previousPath; }
	};
	function spriteValue(value, args) {
		var alpha=typeof args[3]==="number" || typeof args[3]==="boolean"?Number(args[3]):1;
		if(isKind(value,"sprite") && value.virtual && args.length>1){var copy=Object.assign({},value);copy.color=args[2]==null?"#ffffff":args[2];copy.alpha=alpha;return tagged(copy,"sprite");}
		if (isKind(value,"sprite")) return value;
		return tagged({sprite:true,name:typeof value === "string" ? value : isUnknown(value) ? value.name : "",index:typeof args[1] === "number" ? args[1] : 0,color:args[2] == null ? "#ffffff" : args[2],alpha:alpha,scale:typeof args[5] === "number" ? args[5] : 1,scale9:typeof args[6] === "number" ? args[6] : 1},"sprite");
	}
	State.prototype.construct = function(name,args,line,env) {
		var dynamic=this.get(env || dict(),name);if(isKind(dynamic,"closure") && dynamic.fn.constructor && dynamic.fn.name)name=dynamic.fn.name;
		else if(isUnknown(dynamic) && dynamic.name!==name && /^[A-Za-z_]\w*$/.test(dynamic.name)){var dynamicDefinition=this.resolveFunction(dynamic.name);if(dynamicDefinition && dynamicDefinition.constructor)name=dynamic.name;}
		var type = shortName(name);
		if (type === "SpriteImage") return spriteValue(args[0],args);
		if (type === "TextStyle") {
			var resource = fontName(args[0]), font = resource && typeof this.options.fontFor === "function" ? this.options.fontFor(resource) : null;
			var sdfSize = typeof args[4] === "number" && args[4]>0 ? args[4] : 0;
			return tagged({_textStyle:true,fontResource:resource,fontSize:sdfSize || (font && font.size>0 ? font.size*1.3333 : 16),fontSizeUnit:sdfSize ? "sdf" : "native",bold:!!(font && font.bold),italic:!!(font && font.italic),
				color:args.length>1 ? args[1] : "#000000",fontAlpha:typeof args[2] === "number" ? args[2] : 1,
				nativeSdf:args[5] === true || args[5] === 1,sdfEffect:args[6] == null ? null : args[6]},"textStyle");
		}
		var unitTypes={AbsoluteUnit:"ABS",AbsoluteViewUnit:"ABSV",RelativeUnit:"REL",AutoUnit:"AUTO",AutoViewUnit:"AUTOV"};
		if(own(unitTypes,type)) return unit(unitTypes[type],args[0]);
		if(type === "Size") return {width:args[0],height:args[1]};
		if(type === "Margin") return {left:args[0],top:args[1],right:args[2],bottom:args[3]};
		if(type === "Alignment") return {horizontal:args[0],vertical:args[1]};
		if(type === "Rectangle") return {x:args[0] || 0,y:args[1] || 0,width:args[2] || 0,height:args[3] || 0};
		if(type === "DataBind") return tagged({dataBind:true,setter:args[0],getter:args[1],props:dict(),line:line,sourcePath:this.currentPath,updated:false},"binding");
		if (/^(?:DataAccess|DataMutate|Delegate|CallbackList|ImageGroup|DrawingGroup|ImageSource|TexturePage)$/.test(type)) return unknown(name);
		var core=visualTypes.test(type);
		// Modelled primitives/builders take precedence even when a dependency
		// indexes their real definition. In particular GUI_SCROLL_PARAMS loads
		// gw_Scroll, whose constructor must not create a second viewport subtree.
		var definition=core ? null : this.functions[name] || this.resolveFunction(name);
		if (!core && !(definition && definition.constructor)) {this.warn(line,"Constructor " + name + " could not be resolved from project source.");return unknown(name);}
		if(core && args[0]!=null && !isNode(args[0])){
			this.warn(line,"Parent for " + type + " is unresolved or not a GooWee control; its subtree was omitted. Supply a preview argument or override.");
			return unknown("omitted " + type);
		}
		if(!core){
			// Evaluate the actual base arguments and execute each constructor once.
			// This also handles nonvisual data structs and arbitrarily named builders.
			var constructorEnv=dict(),constructorClosure=isKind(dynamic,"closure") && dynamic.env!==this.global?dynamic.env:dict(),self=this,base=definition.base,object;
			Object.keys(constructorClosure || {}).forEach(function(k){constructorEnv[k]=constructorClosure[k];});
			definition.params.forEach(function(p,i){constructorEnv[p.name]=i<args.length?args[i]:p.value?self.eval(p.value,constructorEnv):unknown(p.name);});
			if(this.depth>=25){this.warn(line,"Constructor inheritance depth limit reached.");return unknown(name);}
			this.depth++;
			try{object=base && base.k==="call" ? this.construct(exprName(base.callee),base.args.map(function(arg){return self.eval(arg,constructorEnv);}),line,constructorEnv) : structValue(type);}
			finally{this.depth--;}
			if(!object || isUnknown(object))object=structValue(type);
			object.type=type;if(isNode(object)){object.name=type;object.line=line;object.sourcePath=this.currentPath;}
			this.invoke(definition,args,constructorClosure,object);return object;
		}
		this.check();
		var layoutType=type,parent = isNode(args[0]) ? args[0] : null, auto = /^(Image|Label|Button)$/.test(type);
		var n = {id:"node-" + this.nextNodeId++,name:type,type:type,layoutType:layoutType,line:line,parentId:parent ? parent.id : null,children:[],x:0,y:0,width:0,height:0,text:"",sprite:null,background:null,style:{fontSize:16,color:"#000000",alignH:0,alignV:0},hidden:false,approximate:false,props:dict(),_style:{text_alignment:{horizontal:0,vertical:0}},size:[unit(auto ? "AUTO" : "REL",1),unit(auto ? "AUTO" : "REL",1)],margin:[0,0,0,0],padding:[0,0,0,0],alignment:[0,0],orientation:1};
		tagged(n,"node");n.sourcePath=this.currentPath;
		this.nodes.push(n); if (parent) parent.children.push(n);
		if(type==="Button")Object.assign(n.props,{is_hover:false,is_down:false,is_down_right:false,is_enabled:true,is_disabled_to_press:false});
		if (type === "Label") n.size = [unit("AUTOV",1),unit("AUTOV",1)];
		if (type === "Label" || type === "Textbox") { n.text = this.text(args[1],n); }
		if (type === "Image") n.sprite = spriteValue(args[1],[]);
		if (type === "Scroll" || type === "DragScroll") {
			// Scroll is a builder struct in GooWee. Its viewport occupies layout
			// space, while the separately rendered canvas retains the same parent.
			n.layoutType="Float"; n.clipChildren=true;
			n.size = [args[1] || unit("REL",1),args[2] || unit("REL",1)]; n.props.viewport = n;
			var horizontal=type === "Scroll" && args[7] === 0;
			if(horizontal && args[8])n.size[0]=args[8];
			if(type === "Scroll" && args[2] && /^(ABS|ABSV)$/.test(args[2].unit)) {
				n.size[1]=unit("AUTO",1);n.size_max=[n.size[0],args[2]];
			}
			var scrollCanvas=this.construct(type === "Scroll" ? "gw_CanvasScroll" : "gw_CanvasDragScroll",[n],line,env);
			scrollCanvas.name="scroll_canvas";scrollCanvas.separateRender=true;
			scrollCanvas.size=type === "DragScroll" ? [unit("AUTO",1),unit("AUTO",1)] : [unit("REL",1),unit("AUTO",1)];
			n.props.canvas=scrollCanvas;
			var content = this.construct("gw_" + (type === "Scroll" ? "StackPanel" : "Float"),[scrollCanvas],line,env);
			content.name="content";content.size=type === "DragScroll" || horizontal ? [unit("AUTO",1),unit("AUTO",1)] : [unit("REL",1),unit("AUTO",1)];
			content.orientation=horizontal ? 0 : 1;
			n.props.content=content;n.props.stack_content=content;
			if(type === "Scroll") {
				var params=typeof args[3] === "number" ? args[3] : 0, barWidth=typeof args[4] === "number" ? args[4] : 23;
				var barMargin=typeof args[5] === "number" ? args[5] : 0, hideBar=horizontal || !!(params & 2), leftBar=!!(params & 8);
				if(!hideBar)content.margin[leftBar ? 0 : 2]=unit("ABSV",barWidth);
				var bar=this.construct("gw_Canvas",[n],line,env);bar.name="canvas_scroll_bar";bar.size=[unit("ABSV",barWidth),unit("REL",1)];bar.alignment=[leftBar?0:2,0];bar.hidden=hideBar;
				bar._style.background_image=spriteValue("s_white_pixel",["s_white_pixel",0,"#0b0b11",1]);
				var thumb=this.construct("gw_Button",[bar],line,env);thumb.name="button_scroll_bar";thumb.size=[unit("REL",1),unit("ABSV",32)];
				var thumbImage=this.construct("gw_Image",[thumb,spriteValue("ns_scroll_thumb",["ns_scroll_thumb",params&16 ? 1 : 0])],line,env);
				thumbImage.name="image_scroll_bar";thumbImage.size=[unit("REL",1),unit("REL",1)];thumbImage.margin=[0,unit("ABSV",barMargin),0,unit("ABSV",barMargin)];
				n.props.canvas_scroll_bar=bar;n.props.image_scroll_bar=thumbImage;n.props.button_scroll_bar=thumb;
				n.scrollPreview={content:content,bar:bar,thumb:thumb,autoHide:!!(params&4),barWidth:barWidth,left:leftBar};
			}
		}
		if (definition && definition.constructor) this.invoke(definition,args,env,n);
		else if (!/^(?:Canvas(?:Surface|Scroll|DragScroll)?|Container(?:Canvas)?|Control|Float|Panel|StackPanel|WrapPanel|Label|Image|Button|Scroll|DragScroll)$/.test(type)) { n.approximate = true; this.warn(line,"Custom control " + type + ": showing its outer bounds; implementation is outside this script."); }
		return n;
	};
	State.prototype.text = function(v,n) { if (isUnknown(v)) { n.approximate = true; this.warn(n.line,"Dynamic text shown as a placeholder."); return "{" + v.name + "}"; } if(v && typeof v==="object"){n.approximate=true;this.warn(n.line,"A struct or array cannot be displayed as label text; supply a caption.");return Array.isArray(v)?"{array}":"{struct}";}return v == null ? "" : String(v); };
	State.prototype.removeElements = function(element, includeSelf) {
		if(!isNode(element))return;
		var removed=new Set();
		function mark(node){if(removed.has(node.id))return;removed.add(node.id);(node.children || []).forEach(mark);}
		if(includeSelf)mark(element);else element.children.forEach(mark);
		this.nodes.forEach(function(node){node.children=node.children.filter(function(child){return !removed.has(child.id);});});
		for(var i=this.nodes.length-1;i>=0;i--)if(removed.has(this.nodes[i].id))this.nodes.splice(i,1);
	};
	State.prototype.method = function(n,name,args,line) {
		if (isKind(n,"binding")) {
			if(name === "update" && !n.updated && ++this.dataUpdates <= 64) {
				n.updated=true;
				var setter=n.setter, getter=n.getter, value=args[0];
				if(isKind(getter,"closure"))value=this.invoke(getter.fn,[],getter.env,getter.boundSelf);
				if(isKind(setter,"closure")) {
					this.warn(line,"DataBind.update sampled once; runtime values remain placeholders.");
					return this.invoke(setter.fn,[value],setter.env,setter.boundSelf);
				}
			}
			return n;
		}
		if (own(n.props,name) && isKind(n.props[name],"closure")) return this.invoke(n.props[name].fn,args,n.props[name].env,n);
		if(isStruct(n))return unknown(n.type+"."+name+"(...)");
		if(name === "child_count")return n.children.length;
		if(name === "_measure_margin") {
			if(this.layoutMeasureMargin)return this.layoutMeasureMargin(n,args[0],args[1] === 0 ? 0 : 1);
			var margin=args[0],value=typeof margin === "number" ? margin : isKind(margin,"unit") ? margin.value : null;
			if(typeof value === "number" && (!margin.unit || margin.unit === "ABS"))return value;
			if(typeof value === "number" && margin.unit === "ABSV")return value*this.scale;
			this.warn(line,"Margin measurement needs a resolved parent layout.");return unknown("margin measurement");
		}
		if(name === "add_surface_render_callback") {
			var callback=args[0], body=isKind(callback,"closure") ? JSON.stringify(callback.fn.body) : "";
			var calls=body.match(/"name":"[A-Z][A-Z_]+"/g) || [];
			n.runtimePlaceholder=calls.length ? calls[0].slice(8,-1)+" · runtime drawing" : "Runtime drawing";
			n.approximate=true;this.warn(line,"CanvasSurface content is drawn by a game callback; the preview shows its allocated area.");return n;
		}
		if(name === "clear") { this.removeElements(n,false);return n; }
		if (/^(size|size_min|size_max|margin|padding|alignment|aspectratio)$/.test(name)) {
			if (args.length) { n[name] = args; if (args.some(isUnknown) || args.some(function(v) { return v && v.unit && isUnknown(v.value); })) { n.approximate = true; this.warn(line,"Dynamic " + name + ": using fallback values."); } return n; }
			var values=n[name] || [], fields=/^size/.test(name)?["width","height"]:name === "alignment"?["horizontal","vertical"]:name === "aspectratio"?["orientation","ratio"]:["left","top","right","bottom"],value={};
			fields.forEach(function(key,i){value[key]=values[i];});return value;
		}
		if (name === "orientation") { if (args.length) n.orientation = args[0] === 0 ? 0 : 1; return args.length ? n : n.orientation; }
		if (name === "justify") { if(args.length)n.justify=args[0];return n; }
		if (name === "set_render_scale") { n.canvasScale=typeof args[0] === "number" ? args[0] : 1;return n; }
		if (name === "disable_affect_by_gui_scale") { n.ignoreGuiScale=true;return n; }
		if (name === "separate_render") { n.separateRender=true;return n; }
		if (name === "push_all_canvases_to_array" && Array.isArray(args[0])) {
			[n.props.canvas,n.props.canvas_scroll_bar].forEach(function(canvas){if(canvas && args[0].indexOf(canvas)<0)args[0].push(canvas);});return n;
		}
		if (name === "text") { if (args.length) n.text = this.text(args[0],n); return args.length ? n : n.text; }
		if (name === "sprite") { if (args.length) n.sprite = spriteValue(args[0],[]); return args.length ? n : n.sprite; }
		if (name === "is_draw_disabled") return n.hidden;
		if(name==="enable")n.props.is_enabled=true;
		if(name==="disable"){n.props.is_enabled=false;n.props.is_hover=false;n.props.is_down=false;n.props.is_down_right=false;}
		if (name === "draw_disable") n.hidden = true;
		if (name === "draw_enable") n.hidden = false;
		if (name === "draw_set_enable" && !isUnknown(args[0])) n.hidden = !args[0];
		if (name === "set_codename" && !isUnknown(args[0])) n.codename = args[0];
		if (name === "progress" && typeof args[0] === "number") n.progress = args[0];
		if (name === "alpha" && typeof args[0] === "number") n.alpha = args[0];
		if ((name === "set_parent" || name === "relocate") && isNode(args[0]) && args[0] !== n) {
			var parent = args[0], cursor = parent; while (cursor) { if (cursor === n) return n; cursor = this.nodes.find(function(x) { return x.id === cursor.parentId; }); }
			this.nodes.forEach(function(x) { x.children = x.children.filter(function(c) { return c !== n; }); }); n.parentId = parent.id; parent.children.push(n);
		}
		return n;
	};
	State.prototype.replaceText = function(text, key, value, line) {
		if (typeof key !== "string" && typeof key !== "number") { this.warn(line,"Dynamic text replacement name omitted from preview."); return text; }
		var token = "{" + key + "}";
		if (text.indexOf(token) < 0) return text;
		if (value == null || isUnknown(value) || typeof value === "object" || typeof value === "function") {
			this.warn(line,"Dynamic text replacement " + token + " kept as a placeholder."); return text;
		}
		return text.split(token).join(String(value));
	};
	State.prototype.localizedText = function(name, args, line) {
		var key = args[0];
		if (typeof key !== "string") { this.warn(line,"Dynamic localization key cannot be resolved in the preview."); return unknown("localized text"); }
		var header = name === "preview_hint_header";
		var lookup = header ? this.options.localizeHeader : this.options.localize;
		var text,fallback=/^preview_text(?:_english)?$/.test(name) && typeof args[1]==="string"?args[1]:null;
		if (typeof lookup === "function") {
			try { text = lookup(key, name === "preview_text_english"); }
			catch (_) { this.warn(line,"Could not read localization for " + key + "."); }
			if (typeof text !== "string" && fallback==null) this.warn(line,"Missing localization " + (header ? "header " : "key ") + key + ".");
		}
		if (typeof text !== "string") text = fallback==null?"⟦" + key + "⟧":fallback;
		if (name === "preview_text_format") {
			for (var i = 1; i < Math.min(args.length,201); i += 2) text = this.replaceText(text,args[i],args[i+1],line);
		} else if (name === "preview_text_format_from_struct") {
			var values = args[1], self = this;
			if (values && !isUnknown(values) && typeof values === "object") {
				values = isStruct(values) ? values.props : values;
				Object.keys(values).slice(0,100).forEach(function(field) { if (safeKey(field)) text = self.replaceText(text,field,values[field],line); });
			} else this.warn(line,"Dynamic localization replacements kept as placeholders.");
		}
		return text;
	};
	State.prototype.call = function(name,args,line,env) {
		var short = shortName(name);
		if(/^preview_/.test(name)){
			if(!this.previewDepth){this.warn(line,"Preview helper " + name + " is only available inside preview annotations.");return unknown(name);}
			if(name==="preview_override"){
				if(typeof args[0]==="string" && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\(\.\.\.\))*$/.test(args[0]) && isKind(args[1],"closure")){this.overrides[args[0]]=args[1];return null;}
				this.warn(line,"preview_override expects a call path and a GML function.");return null;
			}
			if(name==="preview_args"){if(Array.isArray(args[0]))this.entryArgs=args[0].slice(0,100);else this.warn(line,"preview_args expects an array.");return null;}
			if(name==="preview_entry")return this.selectedEntry?closureValue(this.selectedEntry,this.global):null;
			if(name==="preview_instance")return this.previewInstance(args[0],args[1],line);
			if(name==="preview_viewport")return {x:this.width,y:this.height,width:this.width,height:this.height,scale:this.scale};
			if(name==="preview_locale")return Object.assign({language:this.options.localeLanguage || ""},this.options.localeInfo || {});
			if(name==="preview_note"){this.warn(line,String(args[0] || "Preview fixture data is active."));return null;}
			if(name==="preview_init_script")return this.initializeScript(args[0],line);
			if(name==="preview_include")return this.includePreview(args[0],line);
			if(name==="preview_sprite_layers"){
				var imageWidth=args[0],imageHeight=args[1],inputLayers=args[2],layers=[],state=this;
				if(!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth<=0 || imageHeight<=0 || imageWidth>2048 || imageHeight>2048 || !Array.isArray(inputLayers) || inputLayers.length>64){this.warn(line,"preview_sprite_layers expects dimensions up to 2048 and at most 64 sprite layers.");return unknown(name);}
				inputLayers.forEach(function(input){
					var fields=isStruct(input)?input.props:input;
					if(!fields || isUnknown(fields)){state.warn(line,"Invalid preview sprite layer.");return;}
					var image=spriteValue(fields.sprite,[]),x=fields.x==null?0:fields.x,y=fields.y==null?0:fields.y;
					var asset=(state.options.assets || {})[image.name],w=fields.width==null && asset?asset.width:fields.width,h=fields.height==null && asset?asset.height:fields.height;
					if(!image.name || image.layers || ![x,y,w,h].every(Number.isFinite) || w<=0 || h<=0 || w>8192 || h>8192){state.warn(line,"Preview sprite layers require a sprite and finite positive dimensions.");return;}
					layers.push({sprite:image,x:x,y:y,width:w,height:h});
				});
				var layered=spriteValue("<preview layers>",[]);layered.width=imageWidth;layered.height=imageHeight;layered.layers=layers;
				layered.originX=Number.isFinite(args[3])?args[3]:0;layered.originY=Number.isFinite(args[4])?args[4]:0;return layered;
			}
			if(/^preview_(?:text(?:_english|_format|_format_from_struct)?|hint|hint_header)$/.test(name))return this.localizedText(name,args,line);
			if(name==="preview_json" || name==="preview_json_files"){
				var reader=this.options[name==="preview_json"?"jsonFor":"jsonFiles"];
				try{if(typeof reader==="function" && typeof args[0]==="string")return reader(args[0]);}catch(error){this.warn(line,"Preview data: " + error.message);return unknown(name);}
				this.warn(line,name+" requires a project-relative path and an available project reader.");return unknown(name);
			}
			if(name==="preview_measure_text" && typeof args[0]==="string"){
				var style=args[1] || {},measured=typeof this.options.measureText==="function"?this.options.measureText(args[0],style):null;
				return measured || {width:args[0].length*(style.fontSize || 16)*0.56,height:style.fontSize || 16};
			}
			this.warn(line,"Unknown preview helper " + name + ".");return unknown(name);
		}
		if(/^(?:gw_)?GooWee\.element_remove$/.test(name)){this.removeElements(args[0],true);return null;}
		if (/^(ABS|ABSV|REL|AUTO|AUTOV)$/.test(short)) return unit(short,args[0]);
		if (visualTypes.test(short) || short === "SpriteImage") return this.construct(name,args,line,env);
		if (/^c_/.test(name)) return unknown(name);
		if (name === "method") {
			var target=args[1],scope=args[0];
			if(isKind(target,"closure")){var closure=dict();Object.keys(target.env || {}).forEach(function(k){closure[k]=target.env[k];});if(scope && !isUnknown(scope) && !isNode(scope) && !isStruct(scope))Object.keys(scope).forEach(function(k){if(safeKey(k))closure[k]=scope[k];});return closureValue(target.fn,closure,isNode(scope) || isStruct(scope) ? scope : target.boundSelf);}
			if(isKind(target,"method"))return methodValue(isNode(scope) ? scope : target.receiver,target.method);
			return unknown(name);
		}
		if(name==="method_call" && Array.isArray(args[1])){
			var callable=args[0];if(isKind(callable,"closure"))return this.invoke(callable.fn,args[1],callable.env,callable.boundSelf || null);
			if(isKind(callable,"builtin"))return this.call(callable.builtin,args[1],line,env);
			if(isKind(callable,"method"))return this.method(callable.receiver,callable.method,args[1],line);
		}
		if(/^(?:variable_struct_|struct_)(?:get_names|get|set|exists|remove)$/.test(name)){
			var record=args[0],fields=isStruct(record) || isNode(record)?record.props:record;
			if(!fields || isUnknown(fields) || typeof fields!=="object" || Array.isArray(fields))return unknown(name);
			if(/get_names$/.test(name))return Object.keys(fields).filter(safeKey).slice(0,2048);
			var key=args[1];if(typeof key!=="string" || !safeKey(key))return unknown(name);
			if(/exists$/.test(name))return own(fields,key);
			if(/get$/.test(name))return own(fields,key)?fields[key]:null;
			if(/remove$/.test(name)){delete fields[key];return null;}
			fields[key]=args[2];return null;
		}
		if(/^is_(?:undefined|array|struct|real|numeric|string|bool|method|nan|infinity)$/.test(name)){
			if(isUnknown(args[0]))return unknown(name);
			if(name==="is_nan")return Number.isNaN(args[0]);
			if(name==="is_infinity")return args[0]===Infinity || args[0]===-Infinity;
			if(name==="is_undefined")return args[0]==null;
			if(name==="is_array")return Array.isArray(args[0]);
			if(name==="is_struct")return !!args[0] && typeof args[0]==="object" && !Array.isArray(args[0]) && !args[0][valueBrand] || isStruct(args[0]) || isNode(args[0]);
			if(name==="is_method")return isKind(args[0],"closure") || isKind(args[0],"method");
			return typeof args[0]===({is_real:"number",is_numeric:"number",is_string:"string",is_bool:"boolean"})[name];
		}
		if(name==="variable_struct_names_count" || name==="struct_names_count"){
			var counted=isStruct(args[0]) || isNode(args[0])?args[0].props:args[0];return counted && typeof counted==="object" && !isUnknown(counted)?Object.keys(counted).filter(safeKey).length:unknown(name);
		}
		if(name==="string_format" && typeof args[0]==="number"){
			var formatted=args[0].toFixed(Math.max(0,Math.min(32,Number(args[2]) || 0)));
			return formatted.padStart(Math.max(0,Math.min(1024,Number(args[1]) || 0))," ");
		}
		if(name==="string" && args[0] && typeof args[0]==="object" && !isUnknown(args[0]))return this.text(args[0],{line:line,approximate:false});
		if(name==="string_length" && typeof args[0]==="string")return args[0].length;
		if(name==="string_digits" && typeof args[0]==="string")return args[0].replace(/[^0-9]/g,"");
		if(name==="string_char_at" && typeof args[0]==="string" && Number.isFinite(args[1]))return args[1]<1?"":args[0].charAt(Math.trunc(args[1])-1);
		if(name==="string_delete" && typeof args[0]==="string" && Number.isFinite(args[1]) && Number.isFinite(args[2])){
			var start=Math.max(0,Math.trunc(args[1])-1),length=Math.max(0,Math.trunc(args[2]));return args[0].slice(0,start)+args[0].slice(start+length);
		}
		if(name==="string_lower" && typeof args[0]==="string")return args[0].toLowerCase();
		if(name==="string_upper" && typeof args[0]==="string")return args[0].toUpperCase();
		if(name==="string_copy" && typeof args[0]==="string")return args[0].slice(Math.max(0,Number(args[1])-1),Math.max(0,Number(args[1])-1)+Math.max(0,Number(args[2])));
		if(name==="string_pos" && typeof args[0]==="string" && typeof args[1]==="string")return args[1].indexOf(args[0])+1;
		if(name==="string_count" && typeof args[0]==="string" && typeof args[1]==="string"){
			if(!args[0])return 0;var occurrences=0,offset=0;while((offset=args[1].indexOf(args[0],offset))>=0){occurrences++;offset+=args[0].length;}return occurrences;
		}
		if(name==="string_split" && args.length<=3 && typeof args[0]==="string" && typeof args[1]==="string"){
			var pieces=args[0].split(args[1]);if(args[2]===true)pieces=pieces.filter(function(piece){return piece!=="";});
			if(pieces.length>2048){this.warn(line,"String split capped at 2048 items.");pieces=pieces.slice(0,2048);}return pieces;
		}
		if(name==="string_insert" && typeof args[0]==="string" && typeof args[1]==="string" && Number.isFinite(args[2])){
			if(args[0].length+args[1].length>1500000){this.warn(line,"String insertion exceeds preview size limit.");return unknown(name);}
			var position=Math.max(0,Math.min(args[1].length,Math.trunc(args[2])-1));return args[1].slice(0,position)+args[0]+args[1].slice(position);
		}
		if((name==="string_replace" || name==="string_replace_all") && args.slice(0,3).every(function(value){return typeof value==="string";})){
			if(!args[1])return args[0];var parts=name==="string_replace_all"?args[0].split(args[1]):null;
			if(parts && args[0].length+parts.length*args[2].length>1500000){this.warn(line,"String replacement exceeds preview size limit.");return unknown(name);}
			return parts?parts.join(args[2]):args[0].replace(args[1],function(){return args[2];});
		}
		if(name==="json_parse" && typeof args[0]==="string" && args[0].length<=1500000){try{return JSON.parse(args[0]);}catch(error){this.warn(line,"Invalid JSON supplied to json_parse.");return unknown(name);}}
		if(name==="json_stringify"){try{var json=JSON.stringify(args[0],function(key,value){return isStruct(value)?value.props:value;});if(json.length<=1500000)return json;}catch(error){}this.warn(line,"Preview JSON serialization requires bounded acyclic data.");return unknown(name);}
		if(name==="asset_get_index" && typeof args[0]==="string")return (this.options.assets || {})[args[0]]?args[0]:this.resolveFunction(args[0])?closureValue(this.functions[args[0]],this.global):null;
		if(name==="asset_get_name")return isUnknown(args[0])?args[0].name:isKind(args[0],"closure")?args[0].fn.name:typeof args[0]==="string"?args[0]:"";
		if (name === "string" && args.length > 1 && typeof args[0] === "string") {
			var self = this;
			return args[0].replace(/\{(\d+)\}/g,function(token,index) {
				var value = args[Number(index)+1];
				return self.replaceText(token,index,value,line);
			});
		}
		if(name==="font_add" && typeof this.options.fontFileFor==="function" && typeof args[0]==="string"){
			try{return this.options.fontFileFor(args[0],args[1],args[2],args[3]);}catch(error){this.warn(line,"Preview font: " + error.message);return unknown(name);}
		}
		if(name==="draw_get_font")return this.drawFont==null?null:this.drawFont;
		if(name==="draw_set_font"){this.drawFont=args[0];return null;}
		if(/^font_get_(?:size|bold|italic|fontname)$/.test(name)){
			var font=this.options.fontFor && this.options.fontFor(fontName(args[0]));
			if(font)return font[({font_get_size:"size",font_get_bold:"bold",font_get_italic:"italic",font_get_fontname:"fontName"})[name]];
			this.warn(line,"Font metadata is unavailable for " + fontName(args[0]) + ".");return unknown(name);
		}
		if((name==="string_width" || name==="string_height") && typeof args[0]==="string"){
			var textStyle=this.construct("TextStyle",[this.drawFont],line,env),metrics=typeof this.options.measureText==="function"?this.options.measureText(args[0],textStyle):null;
			if(!metrics){var lines=args[0].split(/\r?\n/);metrics={width:Math.max.apply(null,lines.map(function(text){return text.length*textStyle.fontSize*0.56;})),height:lines.length*textStyle.fontSize*1.25};}
			return metrics[name==="string_width"?"width":"height"];
		}
		if(name==="sprite_exists")return !!this.spriteAsset(args[0]);
		if(name==="sprite_delete"){if(isKind(args[0],"sprite") && args[0].virtual)return null;this.warn(line,"Deleting project sprites is not supported in preview.");return null;}
		if (/^sprite_get_(?:width|height|xoffset|yoffset|number)$/.test(name)) { var asset=this.spriteAsset(args[0]);return asset ? (name==="sprite_get_number" && asset.virtual?1:asset[({sprite_get_width:"width",sprite_get_height:"height",sprite_get_xoffset:"originX",sprite_get_yoffset:"originY",sprite_get_number:"frameCount"})[name]]) : unknown(name + "(...)"); }
		if(/^(?:surface_(?:create|exists|get_width|get_height|resize|set_target|reset_target|get_target|free|get_texture)|texture_get_texel_(?:width|height)|matrix_(?:get|set|build|build_identity)|sprite_create_from_surface|draw_clear(?:_alpha)?|draw_(?:sprite|surface)(?:_part)?(?:_ext)?)$/.test(name))return this.graphicsCall(name,args,line);
		if(name==="lengthdir_x" && args.every(Number.isFinite))return args[0]*Math.cos(args[1]*Math.PI/180);
		if(name==="lengthdir_y" && args.every(Number.isFinite))return -args[0]*Math.sin(args[1]*Math.PI/180);
		if (name === "array_push" && Array.isArray(args[0])) { for (var i = 1; i < args.length; i++) args[0].push(args[i]); return null; }
		if(name==="array_delete" && Array.isArray(args[0])){
			if(!Number.isFinite(args[1]) || !Number.isFinite(args[2]) || args[1]<0 || args[2]<0){this.warn(line,"array_delete requires a nonnegative index and count in preview.");return null;}
			args[0].splice(Math.trunc(args[1]),Math.trunc(args[2]));return null;
		}
		if(name==="array_concat" && args.every(Array.isArray)){var combined=[].concat.apply([],args);if(combined.length>2048){this.warn(line,"Array concatenation capped at 2048 items.");combined.length=2048;}return combined;}
		if(name==="array_clone" && Array.isArray(args[0]))return args[0].slice(Math.max(0,args[1] || 0),args[2]==null?2048:Math.min(2048,(args[1] || 0)+args[2]));
		if(name==="array_copy" && Array.isArray(args[0]) && Array.isArray(args[2]) && [args[1],args[3],args[4]].every(Number.isFinite)){
			var destination=Math.max(0,Math.trunc(args[1])),start=Math.max(0,Math.trunc(args[3])),count=Math.max(0,Math.trunc(args[4]));
			if(destination+count>2048){this.warn(line,"Array copy capped at 2048 items.");count=Math.max(0,2048-destination);}
			var copied=args[2].slice(start,start+count);for(var ci=0;ci<copied.length;ci++)args[0][destination+ci]=copied[ci];return null;
		}
		if(name==="ds_map_create")return tagged({values:new Map()},"dsMap");
		if(/^ds_map_(?:add|replace|set|find_value|exists|delete|clear|destroy|size|find_first|find_next)$/.test(name) && isKind(args[0],"dsMap")){
			var map=args[0].values;
			if(/(?:add|replace|set)$/.test(name)){
				if(!safeKey(args[1]))return false;if(map.size>=2048 && !map.has(args[1])){this.warn(line,"Preview map capped at 2048 entries.");return false;}
				if(name==="ds_map_add" && map.has(args[1]))return false;map.set(args[1],args[2]);return true;
			}
			if(name==="ds_map_find_value")return map.has(args[1])?map.get(args[1]):null;
			if(name==="ds_map_exists")return map.has(args[1]);
			if(name==="ds_map_delete")return map.delete(args[1]);
			if(name==="ds_map_size")return map.size;
			if(name==="ds_map_find_first")return map.size?map.keys().next().value:null;
			if(name==="ds_map_find_next"){var keys=Array.from(map.keys()),ki=keys.indexOf(args[1]);return ki>=0 && ki+1<keys.length?keys[ki+1]:null;}
			map.clear();return null;
		}
		if(name==="ds_priority_create")return tagged({values:[]},"dsPriority");
		if(/^ds_priority_(?:add|size|empty|clear|destroy|copy|find_min|find_max|delete_min|delete_max|find_priority|change_priority|delete_value)$/.test(name) && isKind(args[0],"dsPriority")){
			var queue=args[0].values;
			if(name==="ds_priority_copy" && isKind(args[1],"dsPriority")){args[0].values=args[1].values.map(function(item){return {value:item.value,priority:item.priority};});return null;}
			if(name==="ds_priority_add"){
				if(queue.length>=2048){this.warn(line,"Preview priority queue capped at 2048 entries.");return null;}
				if(!Number.isFinite(args[2])){this.warn(line,"Preview priority queue needs a numeric priority.");return null;}queue.push({value:args[1],priority:args[2]});return null;
			}
			if(name==="ds_priority_size")return queue.length;
			if(name==="ds_priority_empty")return queue.length===0;
			if(/(?:clear|destroy)$/.test(name)){queue.length=0;return null;}
			if(/(?:min|max)$/.test(name)){
				if(!queue.length)return null;var qi=0,isMax=/max$/.test(name);for(var qj=1;qj<queue.length;qj++)if(isMax?queue[qj].priority>queue[qi].priority:queue[qj].priority<queue[qi].priority)qi=qj;
				var item=queue[qi].value;if(/delete/.test(name))queue.splice(qi,1);return item;
			}
			var found=queue.findIndex(function(item){return sameValue(item.value,args[1]);});
			if(found<0)return null;if(name==="ds_priority_find_priority")return queue[found].priority;
			if(name==="ds_priority_change_priority" && Number.isFinite(args[2]))queue[found].priority=args[2];else if(name==="ds_priority_delete_value")queue.splice(found,1);return null;
		}
		if(name==="array_pop" && Array.isArray(args[0]))return args[0].length?args[0].pop():null;
		if(name==="array_contains" && Array.isArray(args[0]))return args[0].indexOf(args[1])>=0;
		if(name==="array_sort" && Array.isArray(args[0])){
			if(args[0].length>2048){this.warn(line,"Array sorting capped at 2048 items.");return null;}
			var compare=args[1],state=this;
			args[0].sort(function(a,b){state.check();if(isKind(compare,"closure")){var result=state.invoke(compare.fn,[a,b],compare.env,compare.boundSelf);return typeof result==="number"?result:0;}return (a>b?1:a<b?-1:0)*(compare===false?-1:1);});return null;
		}
		if(/^array_(?:map|filter|foreach|find_index|any|all)$/.test(name) && Array.isArray(args[0]) && isKind(args[1],"closure")){
			var callback=args[1],input=args[0],output=[],start=typeof args[2]==="number"?Math.max(0,args[2]):0,end=Math.min(input.length,start+(typeof args[3]==="number"?Math.max(0,args[3]):input.length),start+2048);
			if(end<input.length && args[3]==null)this.warn(line,"Array iteration capped at 2048 items.");
			for(var index=start;index<end;index++){
				this.check();var item=this.invoke(callback.fn,[input[index],index],callback.env,callback.boundSelf);
				if(name==="array_map")output.push(item);
				if(name==="array_filter" && !isUnknown(item) && item)output.push(input[index]);
				if(name==="array_find_index" && !isUnknown(item) && item)return index;
				if(name==="array_any" && !isUnknown(item) && item)return true;
				if(name==="array_all" && (isUnknown(item) || !item))return false;
			}
			return name==="array_foreach"?null:name==="array_find_index"?-1:name==="array_any"?false:name==="array_all"?true:output;
		}
		if (name === "array_get_index" && Array.isArray(args[0]) && !isUnknown(args[1])) {var offset=typeof args[2]==="number"?Math.max(0,args[2]):0,index=args[0].indexOf(args[1],offset);return typeof args[3]==="number" && index>=offset+args[3]?-1:index;}
		if (name === "array_length" && Array.isArray(args[0])) return args[0].length;
		if (name === "array_length" && isUnknown(args[0])) { this.warn(line,"Dynamic collection: showing one example item.");return 1; }
		if (name === "array_create" && typeof args[0] === "number") {if(args[0]>2048)this.warn(line,"Array creation capped at 2048 items.");return Array(Math.max(0,Math.min(2048,Math.floor(args[0])))).fill(args[1]);}
		if (name === "array_create_ext" && Number.isFinite(args[0]) && isKind(args[1],"closure")) {
			if(args[0]>2048)this.warn(line,"Array creation capped at 2048 items.");
			var generated=[],generator=args[1],length=Math.max(0,Math.min(2048,Math.floor(args[0])));
			for(var generatedIndex=0;generatedIndex<length;generatedIndex++){
				this.check();generated.push(this.invoke(generator.fn,[generatedIndex],generator.env,generator.boundSelf));
			}
			return generated;
		}
		var external = /^[A-Za-z_]\w*$/.test(name) ? this.resolveFunction(name) : null;
		if(external)return this.invoke(external,args,this.global,null);
		if (args.some(isUnknown)) { this.warn(line,"Call " + name + " needs runtime values or a preview override."); return unknown(name + "(...)"); }
		var fns = {min:Math.min,max:Math.max,abs:Math.abs,sign:Math.sign,floor:Math.floor,ceil:Math.ceil,round:Math.round,sqrt:Math.sqrt,power:Math.pow,clamp:function(v,a,b) { return Math.max(a,Math.min(b,v)); },lerp:function(a,b,t) { return a+(b-a)*t; },string:String,real:Number};
		if (own(fns,name)) return fns[name].apply(null,args);
		this.warn(line,"Call " + name + " is not supported or its source is unavailable; omitted from preview.");
		return unknown(name + "(...)");
	};
	function color(v, fallback) { if (typeof v === "string" && /^#[\da-f]{6}$/i.test(v)) return v; if (typeof v === "number") return "#" + [v & 255,(v >> 8) & 255,(v >> 16) & 255].map(function(x) { return ("0"+x.toString(16)).slice(-2); }).join(""); var name = isUnknown(v) ? v.name : v; if(typeof name === "string") name=name.replace(/^Color\./,"c_"); return ({c_white:"#ffffff",c_black:"#000000",c_red:"#ff0000",c_gray:"#808080",c_grey:"#808080",c_yellow:"#ffff00",c_blue:"#0000ff",c_green:"#008000",c_lime:"#00ff00",c_aqua:"#00ffff",c_fuchsia:"#ff00ff",c_orange:"#ffa500",c_silver:"#c0c0c0",c_maroon:"#800000",c_navy:"#000080",c_olive:"#808000",c_purple:"#800080",c_teal:"#008080"})[name] || fallback; }
	State.prototype.textEffect = function(value, node) {
		if(value == null)return null;
		var props=isStruct(value)?value.props:value, self=this;
		function unresolved(field) {node.approximate=true;self.warn(node.line,"SDF effect"+(field?" field "+field:"")+" needs resolved scalar settings; supply its initialization or a preview override.");}
		if(!props || typeof props!=="object" || Array.isArray(props) || props[valueBrand]) {unresolved();return null;}
		var result={}, keys=Object.keys(props);
		if(keys.length>128) {node.approximate=true;this.warn(node.line,"SDF effect settings capped at 128 fields.");}
		keys.slice(0,128).forEach(function(key) {
			if(!safeKey(key))return;
			var field=props[key];
			if(isKind(field,"closure"))return; // Struct helper methods are not effect settings.
			if(isUnknown(field) && /^(?:core|dropShadow|glow|outline)Colou?r$/.test(key)) {
				field=color(field,null);if(field == null) {unresolved(key);return;}
			}
			if(field == null || typeof field === "string" || typeof field === "boolean" || typeof field === "number" && Number.isFinite(field))result[key]=field;
			else unresolved(key);
		});
		return result;
	};
	State.prototype.layout = function() {
		var self=this;
		this.nodes.forEach(function(n) {
			["size","size_min","size_max","margin","padding","aspectratio"].forEach(function(property){if(Array.isArray(n[property]))n[property]=n[property].map(function(value){if(value && typeof value==="object" && own(value,"unit") && !isKind(value,"unit")){n.approximate=true;self.warn(n.line,"Layout requires a GooWee unit, not a data struct with a unit field.");return unknown("layout unit");}return value;});});
			var s = n._style, ts = s.text_style;
			if (isUnknown(ts)) {n.approximate=true;self.warn(n.line,"Text style " + ts.name + " is unresolved; supply its initialization in preview setup.");}
			if (isKind(ts,"textStyle")) {
				n.style.fontSize = ts.fontSize || 16; n.style.color = color(ts.color,"#000000"); n.style.bold = !!ts.bold; n.style.italic = !!ts.italic;
				["fontResource","fontSizeUnit","sdfSpread","sdfLineHeight","sdfLineYCorrection","fontLineHeightAdjustment","fontYOffset","fontAlpha","nativeSdf"].forEach(function(key) { if (ts[key] != null) n.style[key]=ts[key]; });
				var effect=self.textEffect(ts.sdfEffect,n);if(effect)n.style.sdfEffect=effect;
				if (n.style.fontResource && n.style.fontSizeUnit === "native" && typeof self.options.fontFor === "function") {
					var resource = self.options.fontFor(n.style.fontResource);
					if (resource && resource.size > 0) n.style.fontSize=resource.size*1.3333;
				}
			}
			if (typeof n.alpha === "number" && n.alpha >= 0) n.style.fontAlpha=(n.style.fontAlpha == null ? 1 : n.style.fontAlpha)*n.alpha;
			n.style.baseFontSize = n.style.fontSize;
			if(Number.isFinite(n.props.text_clip_width))n.style.baseTextClipWidth=Math.max(0,n.props.text_clip_width);
			if(Number.isFinite(n.props.text_draw_offset_x))n.style.baseTextDrawOffsetX=n.props.text_draw_offset_x;
			n.style.fontSize = Math.max(1,Math.min(512,n.style.fontSize * self.scale));
			n.style.color = color(n.props.color_override,n.style.color); n.style.alignH = s.text_alignment.horizontal || 0; n.style.alignV = s.text_alignment.vertical || 0;
			n.style.spriteAlpha = typeof s.sprite_alpha === "number" ? s.sprite_alpha : 1; n.style.additionalColorBlend = color(s.additional_color_blend,"#ffffff"); n.style.flipHorizontal = s.sprite_is_flip_horizontal === true; n.style.angle = typeof s.angle === "number" ? s.angle : 0;
			n.background = isKind(s.background_image,"sprite") ? s.background_image : null;
			[n.sprite,n.background].forEach(function(sprite) { if (sprite) sprite.color = color(sprite.color,"#ffffff"); });
		});
		var layoutOptions={
			width:this.width,height:this.height,scale:this.scale,assets:this.options.assets,
			measureText:this.options.measureText,warn:this.warn.bind(this),
			getBaseLayout:function(parent,child,fallback,phase,measureMargin) {
				var override=parent.props.get_base_layout;
				if(!override)return null;
				if(override.receiver && override.method === "get_base_layout") {
					var target=override.receiver,p=target.paddingActual || [0,0,0,0];
					return {x:target.x+p[0],y:target.y+p[1],width:target.width-p[0]-p[2],height:target.height-p[1]-p[3]};
				}
				if(isKind(override,"closure")) {
					var previousMeasure=self.layoutMeasureMargin;self.layoutMeasureMargin=measureMargin;
					try {
						var rect=self.invoke(override.fn,[child],override.env,override.boundSelf || parent);
						if(rect && [rect.x,rect.y,rect.width,rect.height].every(Number.isFinite))return rect;
					} catch (_) { } finally { self.layoutMeasureMargin=previousMeasure; }
				}
				parent.approximate=true;self.warn(parent.line,"Custom get_base_layout could not be resolved; using container bounds.");return fallback;
			}
		};
		var roots=Layout.layout(this.nodes,layoutOptions), scrollChanged=false;
		this.nodes.forEach(function(n) {
			var scroll=n.scrollPreview;if(!scroll)return;
			if(scroll.autoHide && scroll.content.height<=n.height) {
				scroll.bar.hidden=true;scroll.content.margin[scroll.left?0:2]=0;
			}
			var extent=Math.max(1,scroll.content.height), thumbHeight=Math.min(n.height,n.height*n.height/extent);
			scroll.thumb.size[1]=unit("ABS",Math.max(0,thumbHeight));scrollChanged=true;
		});
		if(scrollChanged)roots=Layout.layout(this.nodes,layoutOptions);
		this.nodes.forEach(function(n){delete n._style;delete n.scrollPreview;n.props={};});
		return roots;
	};

	function analyze(source,options) {
		options = options || {}; source = String(source || ""); var state = new State(options);
		var result = {supported:lexRaw(source).some(function(t) { return t.k === "directive" && /^#import\s+["']games\.keevee\.gw["'](?:\s|$)/.test(t.v); }),entries:[],entry:null,nodes:state.nodes,roots:[],diagnostics:state.diagnostics,width:state.width,height:state.height,guiScale:state.scale};
		if (!result.supported) return result;
		try {
			(options.setupSources || []).slice(0,16).forEach(function(setup){
				if(!setup || typeof setup.source!=="string" || setup.source.length>1500000)return;
				var key=sourceKey(setup.path || "<preview setup>");if(state.loadedSources[key])return;
				state.loadedSources[key]=true;state.sourceCount++;state.loadSource(setup.source,setup.path || key);
			});
			if(options.sourcePath)state.loadedSources[sourceKey(options.sourcePath)]=true;
			(options.sourceAliases || []).forEach(function(path){if(typeof path==="string")state.loadedSources[sourceKey(path)]=true;});
			var body = state.loadSource(source,options.sourcePath || ""), candidates = [];
			(options.sourceAliases || []).forEach(function(path){if(typeof path==="string")state.sourceBodies[sourceKey(path)]={body:body,path:options.sourcePath || ""};});
			body.forEach(function(n) { if(n.k === "fn" && n.name && state.containsVisual(n))candidates.push(n); });
			// A local wrapper that calls a UI factory is also a useful entry point.
			body.forEach(function(n) { if(n.k === "fn" && candidates.indexOf(n)<0 && candidates.some(function(c) { return JSON.stringify(n.body).indexOf('"name":"'+c.name+'"')>=0; })) candidates.push(n); });
			candidates.sort(function(a,b) { return a.line-b.line; }); result.entries = candidates.map(function(n) { return {name:n.name,line:n.line,constructor:n.constructor}; });
			var entry = candidates.find(function(n) { return n.name === options.entry; }) || candidates[0];
			// Selection belongs to the source, even if fixture setup cannot complete.
			// Keep it available to the selector and pinned-file recovery on failure.
			result.entry=entry ? entry.name : null;
			state.selectedEntry=entry;state.setupsReady=true;state.runSetups();
			if (entry) { if(entry.constructor) state.construct(entry.name,state.entryArgs.length?state.entryArgs:[null],entry.line,dict()); else state.invoke(entry,state.entryArgs,dict(),null); }
			else if (!body.some(function(n) { return n.k === "fn"; })) body.forEach(function(n) { if(n.k!=="directive")state.execute(n,state.global); });
		} catch(error) {
			if (error.previewSyntax) result.sourceIncomplete = true;
			var previousPath = state.currentPath;
			if (error.sourcePath != null) state.currentPath = error.sourcePath;
			state.warn(error.line || 1,error.previewSyntax ? error.message + " Preview waits for valid source." : state.truncated ? "Preview complexity limit reached; showing the partial layout." : "Preview stopped: " + String(error.message || error).slice(0,240) + ". Showing the partial layout.");
			state.currentPath = previousPath;
		}
		try { result.roots=state.layout(); } catch(error) { state.warn(1,"Could not resolve all layout bounds."); result.roots=state.nodes.filter(function(n){return !n.parentId;}); }
		result.previewHints=state.previewHints;
		result.stats={sources:state.sourceCount,calls:state.calls,steps:state.steps};
		return result;
	}
	return {analyze:analyze};
});
